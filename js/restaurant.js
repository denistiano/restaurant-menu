/* ============================================================
   restaurant.js — Restaurant page logic + Analytics
   Expects: window.RESTAURANT_ID, window.RESOURCES_BASE

   Every event includes (via trackRestaurantEvent):
     restaurant_id, restaurant_name (EN), restaurant_name_bg

   EVENTS FIRED ON THIS PAGE
   ┌──────────────────────────┬────────────────────────────────────────────────┐
   │ Event                    │ Key params (in addition to restaurant fields)  │
   ├──────────────────────────┼────────────────────────────────────────────────┤
   │ menu_view                │ theme, language, category_count, item_count      │
   │ category_select          │ filter_type, action, category_id,              │
   │                          │ previous_category_id, category_name            │
   │ tag_filter               │ filter_type, action, tag, tag_label            │
   │ ingredient_filter        │ filter_type, action, ingredient_key,           │
   │                          │ ingredient_label                               │
   │ allergen_exclude_filter  │ filter_type, action, allergen_key,             │
   │                          │ allergen_label                                 │
   │ advanced_filters_toggle│ filter_type, panel_open                        │
   │ advanced_filters_clear   │ filter_type, action                            │
   │ search (GA4)             │ search_term, results_count                     │
   │ item_view                │ item_name (localized), item_name_en/bg,        │
   │                          │ item_price, category_id, category_name_en/bg   │
   │ theme_change             │ from_theme, to_theme                           │
   │ language_change          │ from_lang, to_lang                             │
   │ contact_click            │ contact_type (phone|whatsapp|email)            │
   │ menu_exit                │ duration_sec, interaction_count, item_view_count,│
   │                          │ filter snapshot fields (category_id, counts, …)  │
   └──────────────────────────┴────────────────────────────────────────────────┘
   Story correlation (journey_id, story_step, page_kind) is added in analytics.js
   for every GA4 event. Register custom dimensions in GA4 as needed.
   ============================================================ */

(function () {
  'use strict';

  const RESTAURANT_ID  = window.RESTAURANT_ID  || 'unknown';
  const RESOURCES_BASE = window.RESOURCES_BASE || '../resources';
  /** Small UI marks (back buttons, errors): webp in resources; tab icon stays favicon.ico in HTML. */
  const SITE_FAVICON_HREF = '../resources/logo.webp';
  const SITE_BRAND = (typeof window !== 'undefined' && window.__SEO__ && window.__SEO__.siteName)
    ? String(window.__SEO__.siteName)
    : 'emenu.click';

  /** Spring Boot default in this repo; override with meta or window.__MENU_API_BASE__. */
  const DEFAULT_LOCAL_MENU_API = 'http://127.0.0.1:8080';

  /**
   * API origin (scheme+host+port only). Static hosting (e.g. :8888) and API are different origins —
   * do not use location.origin as the API base.
   * On localhost / 127.0.0.1 only, defaults to DEFAULT_LOCAL_MENU_API (same machine).
   * On deployed hosts (e.g. GitHub Pages), set meta or __MENU_API_BASE__ to your real API URL.
   */
  function getMenuApiBase() {
    const w = typeof window !== 'undefined' && window.__MENU_API_BASE__;
    if (w && typeof w === 'string' && w.trim()) return w.trim().replace(/\/?$/, '');
    const meta = typeof document !== 'undefined' && document.querySelector('meta[name="menu-api-base"]');
    if (meta) {
      const c = meta.getAttribute('content');
      if (c && c.trim()) return c.trim().replace(/\/?$/, '');
    }
    const h = typeof location !== 'undefined' ? location.hostname : '';
    if (h === 'localhost' || h === '127.0.0.1' || h === '') {
      return DEFAULT_LOCAL_MENU_API;
    }
    return '';
  }

  // ── Cache config ─────────────────────────────────────────
  // Bump CV whenever the stored shape changes to auto-bust old entries.
  const CACHE_VERSION  = 'v3';
  const MENU_CACHE_TTL = 5 * 60 * 1000;          // 5 min — menu JSON in sessionStorage
  const MENU_KEY       = `menu_${CACHE_VERSION}_${RESTAURANT_ID}`;

  // ── Generic cache helpers ─────────────────────────────────
  /**
   * Read an entry from sessionStorage.
   * Returns { value, age_ms } when fresh, or null when missing/expired.
   * Pass stale:true to return expired entries too (offline fallback).
   */
  function cacheGet(key, ttl, { stale = false } = {}) {
    try {
      const raw = sessionStorage.getItem(key);
      if (raw === null) return null;                      // nothing stored
      const entry = JSON.parse(raw);
      if (typeof entry !== 'object' || entry === null ||
          !('v' in entry) || !('ts' in entry)) {
        sessionStorage.removeItem(key);                   // corrupt / old format
        return null;
      }
      const age = Date.now() - entry.ts;
      if (!stale && age > ttl) {
        sessionStorage.removeItem(key);
        return null;                                      // expired
      }
      return { value: entry.v, age_ms: age, rev: entry.rev };
    } catch {
      return null;
    }
  }

  /** Write a value to sessionStorage with a timestamp. Optional `rev` = server menu revision. */
  function cacheSet(key, value, rev) {
    try {
      const o = { v: value, ts: Date.now() };
      if (rev !== undefined && rev !== null) o.rev = rev;
      sessionStorage.setItem(key, JSON.stringify(o));
    } catch { /* quota exceeded — degrade gracefully */ }
  }

  /** Remove a cache entry. */
  function cacheBust(key) {
    try { sessionStorage.removeItem(key); } catch { }
  }

  /** Expose bust function so admin page can call it after a save. */
  window.__bustMenuCache = () => cacheBust(MENU_KEY);

  // Used to keep GA4 event parameters consistent across all restaurant-page events.
  // GA4 Explorations often shows "Not set" when an event parameter is missing for some events.
  let pageRestaurantNameEn = RESTAURANT_ID;
  let pageRestaurantNameBg = RESTAURANT_ID;

  function trackRestaurantEvent(eventName, params = {}) {
    const merged = {
      restaurant_id: RESTAURANT_ID,
      restaurant_name: (pageRestaurantNameEn || RESTAURANT_ID).slice(0, 100),
      restaurant_name_bg: (pageRestaurantNameBg || '').slice(0, 100),
      ...params,
    };
    Object.keys(merged).forEach(k => {
      if (merged[k] === undefined) delete merged[k];
    });
    window.trackEvent?.(eventName, merged);
  }

  /* ── Analytics: fire menu_exit exactly once ─────────────── */
  function buildFilterSnapshot() {
    const parts = [];
    if (activeCategory && activeCategory !== 'all') parts.push(`cat:${activeCategory}`);
    if (activeTags.size) parts.push(`tags:${activeTags.size}`);
    if (activeIngredients.size) parts.push(`ing:${activeIngredients.size}`);
    if (excludeAllergens.size) parts.push(`ex:${excludeAllergens.size}`);
    if (searchQuery.trim()) parts.push(`q:${searchQuery.trim().slice(0, 24)}`);
    return parts.join('|').slice(0, 100);
  }

  function fireMenuExit() {
    if (menuExitFired || !initialized) return;
    menuExitFired = true;
    trackRestaurantEvent('menu_exit', {
      duration_sec:      Math.round((Date.now() - pageStartMs) / 1000),
      interaction_count: interactionCount,
      item_view_count:   itemViewCount,
      category_id:       activeCategory,
      tags_count:        activeTags.size,
      ingredients_count: activeIngredients.size,
      allergens_exclude_count: excludeAllergens.size,
      advanced_filters_open: advancedFiltersOpen ? 1 : 0,
      search_active:     searchQuery.trim() ? 1 : 0,
      search_term:       searchQuery.trim().slice(0, 50),
      filter_snapshot:   buildFilterSnapshot()
    });
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') fireMenuExit();
  });
  window.addEventListener('pagehide', fireMenuExit);

  let data              = null;
  let restaurantMeta    = null; // entry from resources/restaurants.json
  let quantityMetrics   = [];   // from restaurants.json
  let currentLang       = localStorage.getItem('preferredLang')   || null;
  let currentTheme      = localStorage.getItem('preferredTheme')  || null;
  let activeCategory    = 'all';
  let activeTags        = new Set();
  let allTags           = [];
  /** Ingredient filter keys — normalized `ing.en` (fallback bg) for stable matching */
  let activeIngredients = new Set();
  /** Allergen keys to exclude — dishes containing any listed allergen are hidden */
  let excludeAllergens  = new Set();
  let advancedFiltersOpen = false;
  let initialized       = false;  // skip animations on first render
  let currentModalItem  = null;   // item currently shown in the detail modal
  let searchQuery       = '';     // live search string

  /* ── Per-session analytics state ────────────────────────── */
  const pageStartMs      = window._sessionStartMs || Date.now();
  let   interactionCount = 0;   // incremented on every meaningful interaction
  let   itemViewCount    = 0;   // dish detail modals opened
  let   menuExitFired    = false;

  /* ── Timed-section minute timer ─────────────────────────── */
  let timedSectionTimer = null;

  /* ============================================================
     TIMED SECTIONS
     ============================================================ */

  /**
   * Returns true if the category's schedule is currently active,
   * false if inactive, or null if no schedule is defined.
   */
  function isTimedSectionActive(cat, timezone) {
    if (!cat.schedule || !cat.schedule.enabled) return null;
    try {
      const tz  = timezone || 'Europe/Sofia';
      const now = new Date();
      const ts  = now.toLocaleTimeString('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false });
      const [ch, cm] = ts.split(':').map(Number);
      const cur = ch * 60 + cm;
      const [sh, sm] = (cat.schedule.start_time || '00:00').split(':').map(Number);
      const [eh, em] = (cat.schedule.end_time   || '23:59').split(':').map(Number);
      const start = sh * 60 + sm, end = eh * 60 + em;
      return end > start ? (cur >= start && cur < end) : (cur >= start || cur < end);
    } catch { return null; }
  }

  /**
   * Returns categories sorted so timed sections float to top / sink to bottom
   * only when their per-section behaviour toggles allow it.
   */
  function getSortedCategories(categories) {
    const cfg = (data && data.restaurant.menu.config) || {};
    const tz  = cfg.timezone || 'Europe/Sofia';

    const active = [], normal = [], inactive = [];
    categories.forEach(cat => {
      const s          = isTimedSectionActive(cat, tz);
      const moveTop    = cat.schedule && cat.schedule.enabled && cat.schedule.move_active_top !== false;
      const moveBottom = cat.schedule && cat.schedule.enabled && cat.schedule.move_inactive_bottom !== false;

      if (s === true && moveTop) active.push(cat);
      else if (s === false && moveBottom) inactive.push(cat);
      else normal.push(cat);
    });
    return [...active, ...normal, ...inactive];
  }

  /**
   * Called every minute (and on initial render) to update visual timed-section
   * states: classes on tabs + sections, schedule badges, and DOM order.
   */
  function applyTimedStates() {
    if (!data) return;
    const cfg        = data.restaurant.menu.config || {};
    const tz         = cfg.timezone || 'Europe/Sofia';
    const categories = data.restaurant.menu.categories;

    /* ── Update tab visual state & reorder tabs (per-section move rules) ── */
    const tabsContainer = document.getElementById('categoryTabs');
    if (tabsContainer) {
      categories.forEach(cat => {
        const tab = tabsContainer.querySelector(`[data-cat="${cat.id}"]`);
        if (!tab) return;
        const s = isTimedSectionActive(cat, tz);
        tab.classList.toggle('timed-active',   s === true);
        tab.classList.toggle('timed-inactive', s === false);
      });
      const sorted = getSortedCategories(categories);
      const allBtn = tabsContainer.querySelector('[data-cat="all"]');
      sorted.forEach(cat => {
        const tab = tabsContainer.querySelector(`[data-cat="${cat.id}"]`);
        if (tab) tabsContainer.appendChild(tab);
      });
      if (allBtn) tabsContainer.insertBefore(allBtn, tabsContainer.firstChild);
    }

    /* ── Update section visual state, badges & reorder sections ── */
    const sectionsContainer = document.getElementById('menuCategories');
    if (sectionsContainer) {
      categories.forEach(cat => {
        const section = document.getElementById(`cat-${cat.id}`);
        if (!section) return;
        const s = isTimedSectionActive(cat, tz);
        section.classList.toggle('timed-active',   s === true);
        section.classList.toggle('timed-inactive', s === false);

        /* Badge: "Now serving" or "HH:MM – HH:MM" */
        let badge = section.querySelector('.timed-badge');
        if (s !== null) {
          if (!badge) {
            badge = document.createElement('span');
            badge.className = 'timed-badge';
            const titleEl = section.querySelector('.menu-category__title');
            if (titleEl) titleEl.appendChild(badge);
          }
          if (s) {
            badge.textContent = currentLang === 'bg' ? 'Сервира се между' : 'Serving between';
            badge.textContent += ` ${cat.schedule.start_time} - ${cat.schedule.end_time}`;
            badge.dataset.active = '1';
          } else {
            badge.textContent = currentLang === 'bg' ? 'Сервира се между' : 'Serving between';
            badge.textContent += ` ${cat.schedule.start_time} - ${cat.schedule.end_time}`;
            badge.dataset.active = '0';
          }
        } else if (badge) {
          badge.remove();
        }
      });

      const sorted = getSortedCategories(categories);
      sorted.forEach(cat => {
        const section = document.getElementById(`cat-${cat.id}`);
        if (section) sectionsContainer.appendChild(section);
      });
    }
  }

  /* ============================================================
     HELPERS
     ============================================================ */
  function t(field) {
    if (!field) return '';
    if (typeof field === 'string') return field;
    return field[currentLang] || field.en || '';
  }

  function getCurrencyConfig() {
    const cfg = data?.restaurant?.menu?.config || {};
    const c = cfg.currencies || {};

    const base = (c.base || (restaurantMeta?.currency_reference || 'EUR')).toUpperCase();
    const support = Array.isArray(restaurantMeta?.currencies_supported) ? restaurantMeta.currencies_supported : [];
    const supportedCodes = new Set(
      support.map(x => String(x?.code || '').toUpperCase()).filter(Boolean)
        .concat(Object.keys(restaurantMeta?.currency_rates || {}).map(k => String(k).toUpperCase()))
    );
    supportedCodes.delete('');

    const displayRaw = Array.isArray(c.display) && c.display.length
      ? c.display
      : [base, ...Array.from(supportedCodes).filter(code => code !== base)];
    const display = [...new Set(displayRaw.map(x => String(x).toUpperCase()))];
    if (!display.includes(base)) display.unshift(base);

    const ref = String(restaurantMeta?.currency_reference || 'EUR').toUpperCase();
    const rates = (restaurantMeta?.currency_rates && typeof restaurantMeta.currency_rates === 'object')
      ? restaurantMeta.currency_rates
      : {};

    return { base, display, ref, rates };
  }

  function currencySymbol(code) {
    const support = restaurantMeta?.currencies_supported;
    if (Array.isArray(support)) {
      const m = support.find(x => String(x?.code || '').toUpperCase() === String(code).toUpperCase());
      if (m && m.symbol) return m.symbol;
    }
    if (code === 'EUR') return '€';
    if (code === 'BGN') return 'лв';
    return String(code);
  }

  function formatPrice(price) {
    if (price === undefined || price === null) return '';
    const { base, display, ref, rates } = getCurrencyConfig();
    const parts = display.map(code => {
      const baseRate = (String(base).toUpperCase() === ref) ? 1 : Number(rates[base] || 1);
      const codeRate = (String(code).toUpperCase() === ref) ? 1 : Number(rates[code] || 1);
      const ratio = (Number.isFinite(baseRate) && baseRate > 0) ? (codeRate / baseRate) : 1;
      const converted = Number(price) * ratio;
      return `${converted.toFixed(2)}${currencySymbol(code)}`;
    });
    return parts.join(' / ');
  }

  function esc(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /**
   * Resolve a menu image / logo / bg-image value:
   * - Full URL (http/https) or absolute path → use as-is
   * - Otherwise → prefix with the resources base path
   */
  function resolveImageSrc(val, restaurantId) {
    if (!val) return null;
    if (/^https?:\/\//i.test(val) || val.startsWith('/')) return val;
    return `${RESOURCES_BASE}/${restaurantId}/${val}`;
  }

  /**
   * Inject Cloudinary delivery-time transformations for bandwidth-efficient display.
   * Non-Cloudinary URLs are returned unchanged.
   */
  function optimizeCloudinaryUrl(url, width) {
    if (!url || !url.includes('res.cloudinary.com')) return url;
    return url.replace('/upload/', `/upload/w_${width},c_limit,q_auto,f_auto/`);
  }

  /**
   * Non-blocking lazy image loader using IntersectionObserver.
   * Creates a skeleton shimmer in `container`, then loads the image when the
   * element nears the viewport, and fades it in smoothly on load.
   *
   * @param {HTMLElement} container  - element to inject the image into
   * @param {string}      src        - resolved image URL
   * @param {string}      [alt]      - alt text
   * @param {string}      [cls]      - extra CSS class for the <img>
   */
  function lazyLoadImage(container, src, alt, cls) {
    if (!src) return;

    const skeleton = document.createElement('div');
    skeleton.className = 'img-skeleton';
    container.appendChild(skeleton);

    const load = () => {
      const img = new Image();
      img.alt = alt || '';
      if (cls) img.className = cls;
      // When a CSS class manages sizing, only set opacity & display inline.
      // For bare fill-containers (no class), also force fill dimensions.
      img.style.cssText = cls
        ? 'opacity:0;transition:opacity 0.4s ease;'
        : 'opacity:0;transition:opacity 0.4s ease;display:block;width:100%;height:100%;object-fit:cover;';

      img.onload = () => {
        skeleton.replaceWith(img);
        requestAnimationFrame(() => { img.style.opacity = '1'; });
      };
      img.onerror = () => {
        skeleton.remove();
      };
      img.src = src;
    };

    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver((entries, observer) => {
        if (!entries[0].isIntersecting) return;
        observer.disconnect();
        load();
      }, { threshold: 0, rootMargin: '300px 0px' });
      io.observe(skeleton);
    } else {
      load();
    }
  }

  /**
   * Liberal "contains" search across all searchable text fields.
   * Returns true if any field contains the query (case-insensitive).
   */
  function matchesSearch(item, query) {
    if (!query) return true;
    const q = query.toLowerCase();

    // name (both languages)
    const names = [item.name?.en, item.name?.bg].filter(Boolean);
    if (names.some(n => n.toLowerCase().includes(q))) return true;

    // description (both languages)
    if (item.description) {
      const descs = [item.description.en, item.description.bg].filter(Boolean);
      if (descs.some(d => d.toLowerCase().includes(q))) return true;
    }

    // tags (both languages)
    if (item.tags?.length) {
      const tagTexts = item.tags.flatMap(t => [t.en, t.bg]).filter(Boolean);
      if (tagTexts.some(t => t.toLowerCase().includes(q))) return true;
    }

    return false;
  }

  /* ============================================================
     ITEM DETAIL MODAL
     ============================================================ */
  function ensureModal() {
    if (document.getElementById('itemModal')) return;

    const el = document.createElement('div');
    el.className = 'item-modal';
    el.id        = 'itemModal';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-labelledby', 'itemModalName');
    el.innerHTML = `
      <div class="item-modal__backdrop" id="itemModalBackdrop"></div>
      <div class="item-modal__sheet" id="itemModalSheet">
        <button class="item-modal__close" id="itemModalClose" aria-label="Close">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M1.5 1.5l13 13M14.5 1.5l-13 13" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>
          </svg>
        </button>
        <div class="item-modal__img-wrap" id="itemModalImgWrap" style="display:none"></div>
        <div class="item-modal__body" id="itemModalBody"></div>
      </div>
    `;
    document.body.appendChild(el);

    document.getElementById('itemModalClose')
      .addEventListener('click', closeItemModal);
    document.getElementById('itemModalBackdrop')
      .addEventListener('click', closeItemModal);
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') closeItemModal();
    });

    /* ── Swipe-down to close (mobile bottom sheet) ────────── */
    const sheet = document.getElementById('itemModalSheet');
    let swipeStartY  = 0;
    let swipeCurrent = 0;
    let swipeActive  = false;

    sheet.addEventListener('touchstart', e => {
      /* Only begin swipe if sheet content is scrolled to top */
      if (sheet.scrollTop > 0) return;
      swipeStartY  = e.touches[0].clientY;
      swipeCurrent = swipeStartY;
      swipeActive  = true;
      sheet.style.transition = 'none';
    }, { passive: true });

    sheet.addEventListener('touchmove', e => {
      if (!swipeActive) return;
      swipeCurrent = e.touches[0].clientY;
      const delta = Math.max(0, swipeCurrent - swipeStartY);
      sheet.style.transform = `translateY(${delta}px)`;
    }, { passive: true });

    sheet.addEventListener('touchend', () => {
      if (!swipeActive) return;
      swipeActive = false;
      sheet.style.transition = ''; // restore CSS transition
      const delta = swipeCurrent - swipeStartY;
      if (delta > 110 || delta > sheet.offsetHeight * 0.28) {
        closeItemModal();
      } else {
        sheet.style.transform = ''; // spring back
      }
    });
  }

  function populateModal(item) {
    const imgWrap = document.getElementById('itemModalImgWrap');
    const body    = document.getElementById('itemModalBody');
    if (!imgWrap || !body) return;

    const restaurantId = data?.restaurant?.id;
    const rawImgSrc    = item.image ? resolveImageSrc(item.image, restaurantId) : null;
    // Use a moderate width; Cloudinary will serve a WebP at appropriate resolution
    const imgSrc = rawImgSrc ? optimizeCloudinaryUrl(rawImgSrc, 800) : null;

    imgWrap.innerHTML = '';
    if (imgSrc) {
      imgWrap.style.display = '';
      // Non-blocking: show skeleton first, load image asynchronously
      lazyLoadImage(imgWrap, imgSrc, t(item.name), 'item-modal__img');
    } else {
      imgWrap.style.display = 'none';
    }

    const config = data?.restaurant?.menu?.config || {};

    const tagsHtml = (config.show_tags !== false && item.tags && item.tags.length)
      ? `<div class="item-modal__tags">${item.tags.map(tag =>
          `<span class="item-modal__tag">${esc(t(tag))}</span>`
        ).join('')}</div>`
      : '';

    const descText = (config.show_description !== false && item.description) ? t(item.description) : '';
    const descHtml = descText
      ? `<p class="item-modal__desc">${esc(descText)}</p>`
      : '';

    const ingredientsHtml = (config.show_ingredients && item.ingredients && item.ingredients.length)
      ? `<div class="item-modal__ingredients">
           <span class="item-modal__ingredients-label"
                 data-en="Ingredients" data-bg="Съставки">${currentLang === 'bg' ? 'Съставки' : 'Ingredients'}</span>
           <div class="item-modal__ingredients-list">${item.ingredients.map(ing =>
             `<span class="item-modal__ingredient">${esc(t(ing))}</span>`
           ).join('')}</div>
         </div>`
      : '';

    const allergensHtml = (config.show_allergens && item.allergens && item.allergens.length)
      ? `<div class="item-modal__ingredients">
           <span class="item-modal__ingredients-label"
                 data-en="Allergens" data-bg="Алергени">${currentLang === 'bg' ? 'Алергени' : 'Allergens'}</span>
           <div class="item-modal__ingredients-list">${item.allergens.map(al =>
             `<span class="item-modal__ingredient">${esc(t(al))}</span>`
           ).join('')}</div>
         </div>`
      : '';

    const quantityHtml = (item.quantity && item.quantity.metric && item.quantity.value)
      ? (() => {
          const metric = quantityMetrics.find(m => m.code === item.quantity.metric);
          const label = metric ? metric.label[currentLang] || metric.label.en : item.quantity.metric;
          return `<div class="item-modal__ingredients item-modal__quantity">
             <span class="item-modal__ingredients-label"
                   data-en="Quantity" data-bg="Количество">${currentLang === 'bg' ? 'Количество' : 'Quantity'}</span>
             <div class="item-modal__ingredients-list">
               <span class="item-modal__ingredient item-modal__ingredient--quantity">${item.quantity.value}${esc(label)}</span>
             </div>
           </div>`;
        })()
      : '';

    const priceHtml = (item.price !== undefined && item.price !== null)
      ? `<span class="item-modal__price">${esc(formatPrice(item.price))}</span>`
      : '';

    const unavailHtml = !item.availability
      ? `<span class="item-modal__unavail"
              data-en="Currently unavailable"
              data-bg="Временно недостъпно">Currently unavailable</span>`
      : '';

    body.innerHTML = `
      ${tagsHtml}
      <h2 class="item-modal__name" id="itemModalName"
          data-en="${esc(item.name.en || '')}"
          data-bg="${esc(item.name.bg || item.name.en || '')}">${esc(t(item.name))}</h2>
      ${descHtml}
      ${ingredientsHtml}
      ${allergensHtml}
      ${quantityHtml}
      <div class="item-modal__footer">
        ${priceHtml}
        ${unavailHtml}
      </div>
    `;
  }

  function openItemModal(item) {
    ensureModal();
    currentModalItem = item;
    populateModal(item);

    const modal = document.getElementById('itemModal');
    modal.classList.add('open');
    document.body.style.overflow = 'hidden';

    /* Look up the category that owns this item (reference equality) */
    let categoryId = '', categoryNameEn = '', categoryNameBg = '';
    for (const cat of data?.restaurant?.menu?.categories || []) {
      if (cat.items?.some(i => i === item)) {
        categoryId     = cat.id;
        categoryNameEn = cat.name?.en || cat.id;
        categoryNameBg = cat.name?.bg || '';
        break;
      }
    }

    trackRestaurantEvent('item_view', {
      item_name:         t(item.name).slice(0, 100),
      item_name_en:      (item.name.en || '').slice(0, 100),
      item_name_bg:      (item.name.bg || '').slice(0, 100),
      item_price:        item.price ?? 0,
      is_available:      item.availability ? 1 : 0,
      category_id:       categoryId,
      category_name:     categoryNameEn.slice(0, 100),
      category_name_en:  categoryNameEn.slice(0, 100),
      category_name_bg:  categoryNameBg.slice(0, 100)
    });
    interactionCount++;
    itemViewCount++;

    setTimeout(() => {
      document.getElementById('itemModalClose')?.focus();
    }, 350);
  }

  function closeItemModal() {
    const modal = document.getElementById('itemModal');
    if (!modal || !modal.classList.contains('open')) return;
    const sheet = document.getElementById('itemModalSheet');
    if (sheet) sheet.style.transform = ''; // reset any partial swipe
    modal.classList.remove('open');
    document.body.style.overflow = '';
    currentModalItem = null;
  }

  /* ============================================================
     IN-PLACE TEXT UPDATE (used by applyLang)
     ============================================================ */
  function updateTranslatables(lang) {
    document.querySelectorAll('[data-en]').forEach(el => {
      const text = (lang === 'bg' && el.dataset.bg) ? el.dataset.bg : (el.dataset.en || '');
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
        el.placeholder = text;
      } else if (el.childElementCount === 0) {
        el.textContent = text;
      }
    });
    document.querySelectorAll('[data-title-en]').forEach(el => {
      const tip = (lang === 'bg' && el.dataset.titleBg) ? el.dataset.titleBg : (el.dataset.titleEn || '');
      if (tip) el.setAttribute('title', tip);
    });
    document.querySelectorAll('[data-aria-en]').forEach(el => {
      const al = (lang === 'bg' && el.dataset.ariaBg) ? el.dataset.ariaBg : (el.dataset.ariaEn || '');
      if (al) el.setAttribute('aria-label', al);
    });
  }

  /** Tab / share title: {Name} - {Description} - Menu (localized Menu/Меню). */
  function buildTabTitle(restaurant) {
    const name = t(restaurant.name);
    const desc = t(restaurant.description).trim();
    const menuWord = currentLang === 'bg' ? 'Меню' : 'Menu';
    let base = desc ? `${name} - ${desc} - ${menuWord}` : `${name} - ${menuWord}`;
    const seo = window.__SEO__;
    if (seo) {
      const suf = ((currentLang === 'bg' ? seo.titleSuffixBg : seo.titleSuffixEn) || '').trim();
      if (suf && !base.endsWith(suf)) base = `${base} | ${suf}`;
    }
    return base;
  }

  /** Readable phone for footer (BG mobile: +359 XX XXX XXX). */
  function formatPhoneDisplay(raw) {
    const s = String(raw || '').trim();
    const d = s.replace(/\D/g, '');
    if (d.length >= 12 && d.startsWith('359')) {
      return `+${d.slice(0, 3)} ${d.slice(3, 5)} ${d.slice(5, 8)} ${d.slice(8, 12)}`;
    }
    return s;
  }

  function setWhatsappPrefill(anchor) {
    if (!anchor || !anchor.dataset.waBase) return;
    const base = anchor.dataset.waBase;
    const msg = currentLang === 'bg' ? (anchor.dataset.msgBg || '') : (anchor.dataset.msgEn || '');
    const sep = base.includes('?') ? '&' : '?';
    anchor.href = msg ? base + sep + 'text=' + encodeURIComponent(msg) : base;
  }

  function injectRestaurantFooterContact(mount) {
    if (!mount) return;
    const seo = window.__SEO__;
    const phone = seo && seo.contactPhone ? String(seo.contactPhone).trim() : '';
    const waUrl = seo && seo.whatsappUrl ? String(seo.whatsappUrl).trim() : '';
    const loc = seo && seo.contactEmailLocal ? String(seo.contactEmailLocal).trim() : '';
    const dom = seo && seo.contactEmailDomain ? String(seo.contactEmailDomain).trim() : '';
    mount.innerHTML = '';
    if (phone) {
      const a = document.createElement('a');
      a.href = 'tel:' + phone.replace(/\s/g, '');
      a.className = 'rf__link';
      a.textContent = formatPhoneDisplay(phone);
      mount.appendChild(a);
    }
    if (waUrl) {
      const a = document.createElement('a');
      a.className = 'rf__link rf__link--whatsapp';
      a.rel = 'noopener noreferrer';
      a.target = '_blank';
      a.dataset.waBase = waUrl;
      a.dataset.msgEn = 'Hi — a question about emenu.click or this menu.';
      a.dataset.msgBg = 'Здравейте — въпрос относно emenu.click или това меню.';
      a.dataset.en = 'WhatsApp';
      a.dataset.bg = 'WhatsApp';
      a.textContent = 'WhatsApp';
      setWhatsappPrefill(a);
      mount.appendChild(a);
    }
    if (loc && dom) {
      const a = document.createElement('a');
      a.className = 'rf__link';
      a.href = 'mailto:' + loc + '@' + dom;
      a.dataset.en = 'Email';
      a.dataset.bg = 'Имейл';
      a.textContent = currentLang === 'bg' ? 'Имейл' : 'Email';
      mount.appendChild(a);
    }
  }

  /** Bilingual alt for venue logo/cover (no dependency on currentLang ordering at first paint). */
  function restaurantNameAltText(restaurant) {
    const n = restaurant && restaurant.name ? restaurant.name : {};
    const en = (n.en || '').trim();
    const bg = (n.bg || '').trim();
    if (en && bg && bg !== en) return `${en} · ${bg}`;
    return en || bg || '';
  }

  /**
   * Keep <title>, meta description, Open Graph, Twitter, canonical, and favicon
   * aligned with live menu JSON + current language (static HTML is the crawler baseline).
   */
  function syncRestaurantSeo(restaurant) {
    const seo = window.__SEO__;
    if (!seo || !restaurant) return;

    const fullTitle = buildTabTitle(restaurant);
    document.title = fullTitle;

    const desc = t(restaurant.description).trim();
    const descEl = document.getElementById('seo-meta-desc');
    if (descEl && desc) descEl.setAttribute('content', desc);

    const setProp = (prop, val) => {
      if (!val) return;
      const el = document.querySelector(`meta[property="${prop}"]`);
      if (el) el.setAttribute('content', val);
    };
    const setName = (name, val) => {
      if (!val) return;
      const el = document.querySelector(`meta[name="${name}"]`);
      if (el) el.setAttribute('content', val);
    };

    setProp('og:title', fullTitle);
    setProp('og:description', desc);
    setName('twitter:title', fullTitle);
    setName('twitter:description', desc);

    const base = seo.baseUrl && String(seo.baseUrl).replace(/\/$/, '');
    if (base && seo.canonicalPath) {
      const canon = base + seo.canonicalPath;
      const link = document.querySelector('link[rel="canonical"]');
      if (link) link.setAttribute('href', canon);
      setProp('og:url', canon);
    }

    const rawHero = restaurant.image || restaurant.logo;
    const heroSrc = rawHero ? resolveImageSrc(rawHero, restaurant.id) : null;
    let ogImg = null;
    if (heroSrc && /^https?:\/\//i.test(heroSrc)) {
      ogImg = optimizeCloudinaryUrl(heroSrc, 1200);
    } else if (heroSrc && base && rawHero && !/^https?:\/\//i.test(String(rawHero).trim())) {
      ogImg = `${base}/resources/${restaurant.id}/${String(rawHero).trim()}`;
    }
    if (ogImg) {
      setProp('og:image', ogImg);
      setName('twitter:image', ogImg);
      const imgAlt = t(restaurant.name);
      if (imgAlt) {
        setProp('og:image:alt', imgAlt);
        setName('twitter:image:alt', imgAlt);
      }
    }

    const logoRaw = restaurant.logo || restaurant.image;
    const iconSrc = logoRaw ? resolveImageSrc(logoRaw, restaurant.id) : null;
    if (iconSrc) {
      document.querySelectorAll('link[rel="icon"], link[rel="apple-touch-icon"]').forEach(l => {
        l.setAttribute('href', iconSrc);
      });
    }

    const loc = document.querySelector('meta[property="og:locale"]');
    const alt = document.querySelector('meta[property="og:locale:alternate"]');
    if (loc && alt) {
      if (currentLang === 'bg') {
        loc.setAttribute('content', seo.defaultOgLocale || 'bg_BG');
        alt.setAttribute('content', seo.alternateOgLocale || 'en_US');
      } else {
        loc.setAttribute('content', seo.alternateOgLocale || 'en_US');
        alt.setAttribute('content', seo.defaultOgLocale || 'bg_BG');
      }
    }
  }

  /* ============================================================
     LANGUAGE — smooth crossfade, no DOM rebuild
     ============================================================ */
  function applyLang(lang) {
    const prevLang = currentLang;
    currentLang = lang;
    localStorage.setItem('preferredLang', lang);
    document.documentElement.lang = lang;

    const btn = document.getElementById('langToggle');
    if (btn) {
      btn.querySelector('.lang-toggle__label').textContent = lang === 'bg' ? 'EN' : 'BG';
    }

    updatePageTitle();

    if (!initialized) {
      updateTranslatables(lang);
      document.querySelectorAll('.restaurant-footer [data-wa-base]').forEach(setWhatsappPrefill);
      return;
    }

    trackRestaurantEvent('language_change', {
      from_lang:     prevLang || 'unknown',
      to_lang:       lang
    });
    interactionCount++;

    // Fade content, swap text, fade back
    const content = document.getElementById('menuCategories');
    const filters = document.getElementById('filtersBar');
    const header  = document.querySelector('.restaurant-header__content');

    [content, filters, header].forEach(el => {
      if (el) { el.style.transition = 'opacity 0.15s ease'; el.style.opacity = '0.45'; }
    });

    setTimeout(() => {
      updateTranslatables(lang);
      updatePageTitle();
      document.querySelectorAll('.restaurant-footer [data-wa-base]').forEach(setWhatsappPrefill);
      if (data) renderAdvancedFilters(data.restaurant.menu.categories);
      if (currentModalItem) populateModal(currentModalItem);
      [content, filters, header].forEach(el => {
        if (el) el.style.opacity = '1';
      });
    }, 150);
  }

  /* ============================================================
     THEME — fade menu, rebuild, fade back
     ============================================================ */
  function applyTheme(theme) {
    const prevTheme = currentTheme;
    currentTheme = theme;
    localStorage.setItem('preferredTheme', theme);
    const menuEl = document.getElementById('menuContent');
    if (!menuEl) return;

    document.body.dataset.theme = theme;
    document.querySelectorAll('.theme-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.theme === theme);
    });

    if (!initialized) {
      menuEl.classList.remove('theme-classic', 'theme-modern');
      menuEl.classList.add(`theme-${theme}`);
      if (data) {
        renderMenu(data.restaurant.menu.categories);
        applyFilters(data.restaurant.menu.categories);
      }
      return;
    }

    trackRestaurantEvent('theme_change', {
      from_theme:    prevTheme || 'unknown',
      to_theme:      theme
    });
    interactionCount++;

    menuEl.style.transition = 'opacity 0.18s ease';
    menuEl.style.opacity = '0';

    setTimeout(() => {
      menuEl.classList.remove('theme-classic', 'theme-modern');
      menuEl.classList.add(`theme-${theme}`);
      if (data) {
        renderMenu(data.restaurant.menu.categories);
        applyFilters(data.restaurant.menu.categories);
      }
      requestAnimationFrame(() => requestAnimationFrame(() => {
        menuEl.style.opacity = '1';
      }));
    }, 185);
  }

  /* ============================================================
     COLLECT ALL UNIQUE TAGS — sorted by frequency desc, then alpha
     ============================================================ */
  function collectTags(categories, categoryId) {
    const counts = new Map(); // en_key → count
    const entries = new Map(); // en_key → tag object

    categories.forEach(cat => {
      if (categoryId !== 'all' && cat.id !== categoryId) return;
      cat.items.forEach(item => {
        (item.tags || []).forEach(tag => {
          const key = tag.en || '';
          if (!key) return;
          counts.set(key, (counts.get(key) || 0) + 1);
          if (!entries.has(key)) entries.set(key, tag);
        });
      });
    });

    return [...entries.values()].sort((a, b) => {
      const ca = counts.get(a.en || '') || 0;
      const cb = counts.get(b.en || '') || 0;
      if (cb !== ca) return cb - ca;
      return (a.en || '').localeCompare(b.en || '');
    });
  }

  function ingredientKey(ing) {
    const raw = (ing && (ing.en || ing.bg)) ? String(ing.en || ing.bg).trim() : '';
    return raw ? raw.toLowerCase() : '';
  }

  function allergenKey(al) {
    const raw = (al && (al.en || al.bg)) ? String(al.en || al.bg).trim() : '';
    return raw ? raw.toLowerCase() : '';
  }

  function itemHasIngredientKey(item, key) {
    if (!key || !item.ingredients?.length) return false;
    return item.ingredients.some(ing => ingredientKey(ing) === key);
  }

  function itemHasAllergenKey(item, key) {
    if (!key || !item.allergens?.length) return false;
    return item.allergens.some(al => allergenKey(al) === key);
  }

  /* ============================================================
     COLLECT INGREDIENTS — frequency desc, then alpha (by EN key)
     ============================================================ */
  function collectIngredients(categories, categoryId) {
    const counts = new Map();
    const entries = new Map();

    categories.forEach(cat => {
      if (categoryId !== 'all' && cat.id !== categoryId) return;
      (cat.items || []).forEach(item => {
        (item.ingredients || []).forEach(ing => {
          const k = ingredientKey(ing);
          if (!k) return;
          counts.set(k, (counts.get(k) || 0) + 1);
          if (!entries.has(k)) entries.set(k, { en: ing.en || ing.bg || '', bg: ing.bg || ing.en || '' });
        });
      });
    });

    return [...entries.keys()].sort((a, b) => {
      const ca = counts.get(a) || 0;
      const cb = counts.get(b) || 0;
      if (cb !== ca) return cb - ca;
      return a.localeCompare(b);
    }).map(k => ({
      key: k,
      label: entries.get(k),
      count: counts.get(k) || 0
    }));
  }

  /* ============================================================
     COLLECT ALLERGENS — for “avoid” filter, same sort as ingredients
     ============================================================ */
  function collectAllergens(categories, categoryId) {
    const counts = new Map();
    const entries = new Map();

    categories.forEach(cat => {
      if (categoryId !== 'all' && cat.id !== categoryId) return;
      (cat.items || []).forEach(item => {
        (item.allergens || []).forEach(al => {
          const k = allergenKey(al);
          if (!k) return;
          counts.set(k, (counts.get(k) || 0) + 1);
          if (!entries.has(k)) entries.set(k, { en: al.en || al.bg || '', bg: al.bg || al.en || '' });
        });
      });
    });

    return [...entries.keys()].sort((a, b) => {
      const ca = counts.get(a) || 0;
      const cb = counts.get(b) || 0;
      if (cb !== ca) return cb - ca;
      return a.localeCompare(b);
    }).map(k => ({
      key: k,
      label: entries.get(k),
      count: counts.get(k) || 0
    }));
  }

  /* ============================================================
     CATEGORY TABS
     ============================================================ */
  function renderCategoryTabs(categories) {
    const container = document.getElementById('categoryTabs');
    if (!container) return;
    container.innerHTML = '';

    const allBtn = document.createElement('button');
    allBtn.className = 'category-tab' + (activeCategory === 'all' ? ' active' : '');
    allBtn.dataset.en  = 'All';
    allBtn.dataset.bg  = 'Всички';
    allBtn.dataset.cat = 'all';
    allBtn.textContent = currentLang === 'bg' ? 'Всички' : 'All';
    allBtn.addEventListener('click', () => selectCategory('all', categories));
    container.appendChild(allBtn);

    categories.forEach(cat => {
      const btn = document.createElement('button');
      btn.className    = 'category-tab' + (activeCategory === cat.id ? ' active' : '');
      btn.dataset.en   = cat.name.en || '';
      btn.dataset.bg   = cat.name.bg || cat.name.en || '';
      btn.dataset.cat  = cat.id;
      btn.textContent  = t(cat.name);
      btn.addEventListener('click', () => selectCategory(cat.id, categories));
      container.appendChild(btn);
    });
  }

  /* selectCategory — no DOM rebuild, just show/hide */
  function selectCategory(catId, categories) {
    const previousCategoryId = activeCategory;
    if (initialized) {
      const cat = categories.find(c => c.id === catId);
      const prevCat = previousCategoryId === 'all'
        ? null
        : categories.find(c => c.id === previousCategoryId);
      trackRestaurantEvent('category_select', {
        filter_type:            'category',
        action:                 catId === 'all' ? 'clear' : 'select',
        category_id:          catId,
        previous_category_id: previousCategoryId,
        category_name:        cat ? (cat.name.en || catId).slice(0, 100) : String(catId).slice(0, 100),
        previous_category_name: prevCat
          ? (prevCat.name.en || prevCat.id).slice(0, 100)
          : 'all',
        item_count:           cat ? (cat.items?.length || 0) : 0
      });
      interactionCount++;
    }
    activeCategory = catId;
    activeTags.clear();

    document.querySelectorAll('.category-tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.cat === catId);
    });

    renderTagFilters(categories);
    pruneAdvancedFilterKeys(categories);
    renderAdvancedFilters(categories);
    applyFilters(categories);

    if (catId !== 'all') {
      const targetSection = document.getElementById(`cat-${catId}`);
      if (targetSection) {
        setTimeout(() => targetSection.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
      }
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  /* ============================================================
     TAG FILTERS
     ============================================================ */
  function renderTagFilters(categories) {
    const container = document.getElementById('tagFilters');
    if (!container) return;

    allTags = collectTags(categories, activeCategory);

    if (!allTags.length) {
      container.innerHTML = '';
      return;
    }

    container.innerHTML = '';
    allTags.forEach(tag => {
      const chip = document.createElement('button');
      chip.className    = 'tag-chip' + (activeTags.has(tag.en) ? ' active' : '');
      chip.dataset.en   = tag.en || '';
      chip.dataset.bg   = tag.bg || tag.en || '';
      chip.dataset.tagEn = tag.en;
      chip.textContent  = t(tag);
      chip.addEventListener('click', () => toggleTag(tag.en, categories));
      container.appendChild(chip);
    });
  }

  function toggleTag(tagEn, categories) {
    const adding = !activeTags.has(tagEn);
    if (adding) {
      activeTags.add(tagEn);
    } else {
      activeTags.delete(tagEn);
    }
    if (initialized) {
      const tagObj = allTags.find(t => t.en === tagEn);
      const tagLabel = tagObj ? t(tagObj) : tagEn;
      trackRestaurantEvent('tag_filter', {
        filter_type:   'tag',
        action:        adding ? 'add' : 'remove',
        tag:           tagEn.slice(0, 100),
        tag_label:     tagLabel.slice(0, 100),
        active_count:  activeTags.size,
        active_tags:   Array.from(activeTags).join(',').slice(0, 100)
      });
      interactionCount++;
    }
    applyFilters(categories);

    document.querySelectorAll('.tag-chip').forEach(chip => {
      chip.classList.toggle('active', activeTags.has(chip.dataset.tagEn));
    });
  }

  function pruneAdvancedFilterKeys(categories) {
    const ingList = collectIngredients(categories, activeCategory);
    const algList = collectAllergens(categories, activeCategory);
    const validIng = new Set(ingList.map(x => x.key));
    const validAlg = new Set(algList.map(x => x.key));
    activeIngredients = new Set([...activeIngredients].filter(k => validIng.has(k)));
    excludeAllergens = new Set([...excludeAllergens].filter(k => validAlg.has(k)));
  }

  function updateAdvancedFiltersBadge() {
    const badge = document.getElementById('advancedFiltersBadge');
    if (!badge) return;
    const n = activeIngredients.size + excludeAllergens.size;
    badge.textContent = n > 0 ? String(n) : '';
    if (n > 0) {
      badge.removeAttribute('hidden');
      badge.setAttribute('aria-hidden', 'false');
    } else {
      badge.setAttribute('hidden', '');
      badge.setAttribute('aria-hidden', 'true');
    }
  }

  /** Keeps “More filters” button styling in sync with panel open/closed (not filter count). */
  function syncAdvancedFiltersToggleVisual() {
    const btn = document.getElementById('advancedFiltersToggle');
    if (!btn) return;
    btn.classList.toggle('filters-advanced-toggle--expanded', advancedFiltersOpen);
  }

  let advancedFiltersBound = false;

  function bindAdvancedFiltersUiOnce() {
    if (advancedFiltersBound) return;
    const btn = document.getElementById('advancedFiltersToggle');
    const panel = document.getElementById('advancedFiltersPanel');
    if (!btn || !panel) return;
    advancedFiltersBound = true;
    btn.addEventListener('click', () => {
      advancedFiltersOpen = !advancedFiltersOpen;
      panel.classList.toggle('hidden', !advancedFiltersOpen);
      btn.setAttribute('aria-expanded', advancedFiltersOpen ? 'true' : 'false');
      panel.setAttribute('aria-hidden', advancedFiltersOpen ? 'false' : 'true');
      syncAdvancedFiltersToggleVisual();
      trackRestaurantEvent('advanced_filters_toggle', {
        filter_type:  'advanced_panel',
        action:       advancedFiltersOpen ? 'open' : 'close',
        panel_open:   advancedFiltersOpen,
        open:         advancedFiltersOpen
      });
      interactionCount++;
    });
    const clearBtn = document.getElementById('advancedFiltersClear');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        activeIngredients.clear();
        excludeAllergens.clear();
        if (data) {
          renderAdvancedFilters(data.restaurant.menu.categories);
          applyFilters(data.restaurant.menu.categories);
        } else {
          updateAdvancedFiltersBadge();
        }
        trackRestaurantEvent('advanced_filters_clear', {
          filter_type: 'advanced_panel',
          action:      'clear'
        });
        interactionCount++;
      });
    }
  }

  function renderAdvancedFilters(categories) {
    bindAdvancedFiltersUiOnce();
    pruneAdvancedFilterKeys(categories);

    const toggleWrap = document.getElementById('advancedFiltersToggleWrap');
    const panel = document.getElementById('advancedFiltersPanel');
    const ingRow = document.getElementById('ingredientFilters');
    const algRow = document.getElementById('allergenExcludeFilters');
    const secIng = document.getElementById('advancedSectionIngredients');
    const secAlg = document.getElementById('advancedSectionAllergens');
    if (!panel || !ingRow || !algRow) return;

    const ingList = collectIngredients(categories, activeCategory);
    const algList = collectAllergens(categories, activeCategory);
    const hasIng = ingList.length > 0;
    const hasAlg = algList.length > 0;

    if (!hasIng && !hasAlg) {
      ingRow.innerHTML = '';
      algRow.innerHTML = '';
      if (toggleWrap) toggleWrap.hidden = true;
      panel.classList.add('hidden');
      advancedFiltersOpen = false;
      const tgl = document.getElementById('advancedFiltersToggle');
      if (tgl) {
        tgl.setAttribute('aria-expanded', 'false');
        panel.setAttribute('aria-hidden', 'true');
      }
      syncAdvancedFiltersToggleVisual();
      updateAdvancedFiltersBadge();
      return;
    }
    if (toggleWrap) toggleWrap.hidden = false;

    ingRow.innerHTML = '';
    algRow.innerHTML = '';

    if (secIng) secIng.style.display = hasIng ? '' : 'none';
    if (secAlg) secAlg.style.display = hasAlg ? '' : 'none';

    ingList.forEach(({ key, label, count }) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'filter-pill filter-pill--ingredient' + (activeIngredients.has(key) ? ' active' : '');
      chip.dataset.kind = 'ingredient';
      chip.dataset.key = key;
      chip.setAttribute('aria-pressed', activeIngredients.has(key) ? 'true' : 'false');
      const name = t(label);
      chip.innerHTML = `<span class="filter-pill__text">${esc(name)}</span><span class="filter-pill__count">${count}</span>`;
      chip.addEventListener('click', () => {
        if (activeIngredients.has(key)) activeIngredients.delete(key);
        else activeIngredients.add(key);
        chip.classList.toggle('active', activeIngredients.has(key));
        chip.setAttribute('aria-pressed', activeIngredients.has(key) ? 'true' : 'false');
        if (initialized) {
          const ingLabel = t(label);
          trackRestaurantEvent('ingredient_filter', {
            filter_type:       'ingredient',
            action:            activeIngredients.has(key) ? 'add' : 'remove',
            ingredient_key:    key.slice(0, 100),
            ingredient_label:  ingLabel.slice(0, 100),
            active_count:      activeIngredients.size
          });
          interactionCount++;
        }
        applyFilters(categories);
      });
      ingRow.appendChild(chip);
    });

    algList.forEach(({ key, label, count }) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'filter-pill filter-pill--allergen' + (excludeAllergens.has(key) ? ' active' : '');
      chip.dataset.kind = 'allergen';
      chip.dataset.key = key;
      chip.setAttribute('aria-pressed', excludeAllergens.has(key) ? 'true' : 'false');
      const name = t(label);
      chip.innerHTML = `<span class="filter-pill__text">${esc(name)}</span><span class="filter-pill__count">${count}</span>`;
      chip.addEventListener('click', () => {
        if (excludeAllergens.has(key)) excludeAllergens.delete(key);
        else excludeAllergens.add(key);
        chip.classList.toggle('active', excludeAllergens.has(key));
        chip.setAttribute('aria-pressed', excludeAllergens.has(key) ? 'true' : 'false');
        if (initialized) {
          const alLabel = t(label);
          trackRestaurantEvent('allergen_exclude_filter', {
            filter_type:      'allergen_exclude',
            action:           excludeAllergens.has(key) ? 'add' : 'remove',
            allergen_key:     key.slice(0, 100),
            allergen_label:   alLabel.slice(0, 100),
            active_count:     excludeAllergens.size
          });
          interactionCount++;
        }
        applyFilters(categories);
      });
      algRow.appendChild(chip);
    });

    syncAdvancedFiltersToggleVisual();
    updateAdvancedFiltersBadge();
  }

  /* ============================================================
     APPLY FILTERS (show/hide items & categories)
     ============================================================ */
  function applyFilters(categories) {
    const hasTagFilter    = activeTags.size > 0;
    const hasSearchFilter = searchQuery.trim() !== '';
    const hasIngFilter    = activeIngredients.size > 0;
    const hasAllergenEx   = excludeAllergens.size > 0;
    const anyFilter       = hasTagFilter || hasSearchFilter || hasIngFilter || hasAllergenEx;
    let totalVisible      = 0;

    categories.forEach(cat => {
      const catEl = document.getElementById(`cat-${cat.id}`);
      if (!catEl) return;

      const isVisibleCat = activeCategory === 'all' || activeCategory === cat.id;
      if (!isVisibleCat) {
        catEl.classList.add('hidden');
        return;
      }

      let visibleCount = 0;
      const items = catEl.querySelectorAll('.menu-item');
      items.forEach((itemEl, idx) => {
        const item = cat.items[idx];
        if (!item) return;
        const passesTag = !hasTagFilter ||
          Array.from(activeTags).every(activeTag =>
            (item.tags || []).some(tag => tag.en === activeTag));
        const passesIng = !hasIngFilter ||
          Array.from(activeIngredients).every(k => itemHasIngredientKey(item, k));
        const passesAllergen = !hasAllergenEx ||
          !Array.from(excludeAllergens).some(k => itemHasAllergenKey(item, k));
        const passesSearch = matchesSearch(item, searchQuery.trim());
        const passes = passesTag && passesIng && passesAllergen && passesSearch;
        itemEl.classList.toggle('filtered-out', !passes);
        if (passes) visibleCount++;
      });

      totalVisible += visibleCount;

      // When any filter is active and a category has no matching items, hide it entirely
      if (anyFilter && visibleCount === 0) {
        catEl.classList.add('hidden');
      } else {
        catEl.classList.remove('hidden');
        // The per-category empty message is superseded by hiding — keep it hidden
        const emptyEl = catEl.querySelector('.category-empty');
        if (emptyEl) emptyEl.style.display = 'none';
      }
    });

    // Global "no results" banner
    let noResultsEl = document.getElementById('noResultsBanner');
    if (anyFilter && totalVisible === 0) {
      if (!noResultsEl) {
        noResultsEl = document.createElement('p');
        noResultsEl.id = 'noResultsBanner';
        noResultsEl.className = 'no-results-banner';
        noResultsEl.dataset.en = 'No items match your filters.';
        noResultsEl.dataset.bg = 'Няма намерени продукти за избраните филтри.';
        noResultsEl.textContent = currentLang === 'bg'
          ? 'Няма намерени продукти за избраните филтри.'
          : 'No items match your filters.';
        document.getElementById('menuCategories')?.after(noResultsEl);
      }
      noResultsEl.style.display = 'block';
    } else if (noResultsEl) {
      noResultsEl.style.display = 'none';
    }

    updateAdvancedFiltersBadge();
  }

  /* ============================================================
     RENDER MENU ITEM — CLASSIC
     ============================================================ */
  function renderClassicItem(item, index) {
    const config    = data.restaurant.menu.config;
    const showTags  = config.show_tags;
    const showDesc  = config.show_description;
    const showPrice = config.show_price;

    const nameEn = item.name.en || '';
    const nameBg = item.name.bg || item.name.en || '';
    const descEn = item.description ? (item.description.en || '') : '';
    const descBg = item.description ? (item.description.bg || item.description.en || '') : '';

    const tagHtml = (showTags && item.tags && item.tags.length)
      ? `<div class="menu-item__tags">${item.tags.map(tag =>
          `<span class="menu-item__tag" data-en="${esc(tag.en||'')}" data-bg="${esc(tag.bg||tag.en||'')}">${esc(t(tag))}</span>`
        ).join('')}</div>`
      : '';

    const descHtml = (showDesc && descEn)
      ? `<p class="menu-item__desc" data-en="${esc(descEn)}" data-bg="${esc(descBg)}">${esc(t(item.description))}</p>`
      : '';

    const priceHtml = showPrice
      ? `<span class="menu-item__price">${esc(formatPrice(item.price))}</span>`
      : '';

    const el = document.createElement('div');
    el.className = 'menu-item' + (!item.availability ? ' unavailable' : '');
    el.setAttribute('role', 'button');
    el.setAttribute('tabindex', '0');
    el.setAttribute('aria-label', t(item.name));
    el.innerHTML = `
      <span class="menu-item__number">${index + 1}.</span>
      <div class="menu-item__body">
        <span class="menu-item__name${!item.availability ? ' unavailable' : ''}"
              data-en="${esc(nameEn)}" data-bg="${esc(nameBg)}">${esc(t(item.name))}</span>
        ${descHtml}
        ${tagHtml}
      </div>
      ${priceHtml}
    `;
    el.addEventListener('click', () => openItemModal(item));
    el.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openItemModal(item); }
    });
    return el;
  }

  /* ============================================================
     RENDER MENU ITEM — MODERN
     ============================================================ */
  function renderModernItem(item, restaurantId) {
    const config    = data.restaurant.menu.config;
    const showTags  = config.show_tags;
    const showDesc  = config.show_description;
    const showPrice = config.show_price;

    const nameEn = item.name.en || '';
    const nameBg = item.name.bg || item.name.en || '';
    const descEn = item.description ? (item.description.en || '') : '';
    const descBg = item.description ? (item.description.bg || item.description.en || '') : '';

    // Resolve image: supports Cloudinary full URLs, local paths, or empty
    const rawImgSrc = item.image ? resolveImageSrc(item.image, restaurantId) : null;
    // Serve a 600 px wide optimised version for card thumbnails
    const imgSrc    = rawImgSrc ? optimizeCloudinaryUrl(rawImgSrc, 600) : null;

    const descHtml = (showDesc && descEn)
      ? `<p class="menu-item__desc" data-en="${esc(descEn)}" data-bg="${esc(descBg)}">${esc(t(item.description))}</p>`
      : '';

    const tagHtml = (showTags && item.tags && item.tags.length)
      ? `<div class="menu-item__tags">${item.tags.map(tag =>
          `<span class="menu-item__tag" data-en="${esc(tag.en||'')}" data-bg="${esc(tag.bg||tag.en||'')}">${esc(t(tag))}</span>`
        ).join('')}</div>`
      : '<div class="menu-item__tags"></div>';

    const priceHtml = showPrice
      ? `<span class="menu-item__price">${esc(formatPrice(item.price))}</span>`
      : '';

    const el = document.createElement('div');
    el.className = 'menu-item' + (!item.availability ? ' unavailable' : '');
    el.setAttribute('role', 'button');
    el.setAttribute('tabindex', '0');
    el.setAttribute('aria-label', t(item.name));

    // Build base markup — image slot is a bare wrapper; image loaded non-blocking below
    el.innerHTML = `
      ${imgSrc ? '<div class="menu-item__img-wrap"></div>' : ''}
      <div class="menu-item__body">
        <h3 class="menu-item__name" data-en="${esc(nameEn)}" data-bg="${esc(nameBg)}">${esc(t(item.name))}</h3>
        ${descHtml}
        <div class="menu-item__footer">
          ${tagHtml}
          ${priceHtml}
        </div>
      </div>
    `;

    // Non-blocking lazy image load — skeleton shown until image arrives
    if (imgSrc) {
      lazyLoadImage(el.querySelector('.menu-item__img-wrap'), imgSrc, t(item.name));
    }

    el.addEventListener('click', () => openItemModal(item));
    el.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openItemModal(item); }
    });
    return el;
  }

  /* ============================================================
     RENDER CATEGORIES & ITEMS
     ============================================================ */
  function renderMenu(categories) {
    const container = document.getElementById('menuCategories');
    if (!container) return;
    container.innerHTML = '';

    const restaurantId = data.restaurant.id;

    categories.forEach(cat => {
      const section = document.createElement('section');
      section.className = 'menu-category';
      section.id = `cat-${cat.id}`;
      section.setAttribute('aria-label', t(cat.name));

      const title = document.createElement('h2');
      title.className  = 'menu-category__title';
      title.dataset.en = cat.name.en || '';
      title.dataset.bg = cat.name.bg || cat.name.en || '';
      title.textContent = t(cat.name);
      section.appendChild(title);

      const itemsWrap = document.createElement('div');
      itemsWrap.className = 'menu-category__items';

      cat.items.forEach((item, idx) => {
        const el = currentTheme === 'modern'
          ? renderModernItem(item, restaurantId)
          : renderClassicItem(item, idx);
        itemsWrap.appendChild(el);
      });

      section.appendChild(itemsWrap);

      const emptyMsg = document.createElement('p');
      emptyMsg.className       = 'category-empty';
      emptyMsg.style.display   = 'none';
      emptyMsg.style.padding   = '16px 0';
      emptyMsg.style.color     = 'var(--color-text-muted)';
      emptyMsg.style.fontSize  = '14px';
      emptyMsg.dataset.en = 'No items match the selected filters.';
      emptyMsg.dataset.bg = 'Няма продукти, отговарящи на избраните филтри.';
      emptyMsg.textContent = currentLang === 'bg'
        ? 'Няма продукти, отговарящи на избраните филтри.'
        : 'No items match the selected filters.';
      section.appendChild(emptyMsg);

      container.appendChild(section);
    });
  }

  /* ============================================================
     PAGE TITLE / HEADER TEXT
     ============================================================ */
  function updatePageTitle() {
    if (!data) return;
    if (window.__SEO__) syncRestaurantSeo(data.restaurant);
    else document.title = buildTabTitle(data.restaurant);
    const nameEl = document.getElementById('restaurantName');
    if (nameEl) nameEl.textContent = t(data.restaurant.name);
    const taglineEl = document.getElementById('restaurantTagline');
    if (taglineEl) taglineEl.textContent = t(data.restaurant.description);
  }

  /* ============================================================
     QUANTITY / UNIT (API uses flat strings; UI expects { value, metric })
     ============================================================ */
  function resolveMetricCodeForPublic(rawU) {
    if (rawU == null || rawU === '') return undefined;
    if (typeof rawU === 'string') {
      const s = rawU.trim();
      if (!s) return undefined;
      if (quantityMetrics.some(m => m.code === s)) return s;
      const hit = quantityMetrics.find(m => m.label && (m.label.en === s || m.label.bg === s));
      return hit ? hit.code : s;
    }
    if (typeof rawU === 'object') {
      const en = rawU.en != null ? String(rawU.en).trim() : '';
      const bg = rawU.bg != null ? String(rawU.bg).trim() : '';
      const byCode = quantityMetrics.find(m => m.code === en || m.code === bg);
      if (byCode) return byCode.code;
      const byLabel = quantityMetrics.find(
        m => m.label && (m.label.en === en || m.label.en === bg || m.label.bg === en || m.label.bg === bg)
      );
      return byLabel ? byLabel.code : en || bg || undefined;
    }
    return undefined;
  }

  function normalizeItemQuantityForPublic(item) {
    if (!item || typeof item !== 'object') return;
    if (
      item.quantity &&
      typeof item.quantity === 'object' &&
      !Array.isArray(item.quantity) &&
      ('value' in item.quantity || 'metric' in item.quantity)
    ) {
      delete item.unit;
      return;
    }

    let value;
    const rawQ = item.quantity;
    const rawU = item.unit;

    if (typeof rawQ === 'number' && !Number.isNaN(rawQ)) {
      value = rawQ;
    } else if (typeof rawQ === 'string' && rawQ.trim()) {
      const n = parseFloat(rawQ.replace(',', '.'));
      if (!Number.isNaN(n)) value = n;
    } else if (rawQ && typeof rawQ === 'object') {
      const en = rawQ.en != null ? String(rawQ.en).trim() : '';
      const bg = rawQ.bg != null ? String(rawQ.bg).trim() : '';
      const s = en || bg;
      if (s) {
        const n = parseFloat(s.replace(',', '.'));
        if (!Number.isNaN(n)) value = n;
      }
    }

    const metric = resolveMetricCodeForPublic(rawU);

    delete item.quantity;
    delete item.unit;

    if (value != null && value !== '' && !Number.isNaN(value) && value !== 0) {
      item.quantity = { value };
      if (metric) item.quantity.metric = metric;
    } else if (metric) {
      item.quantity = { metric };
    }
  }

  function normalizeRecordQuantityForPublic(record) {
    const cats = record && record.restaurant && record.restaurant.menu && record.restaurant.menu.categories;
    if (!cats) return;
    cats.forEach(cat => (cat.items || []).forEach(normalizeItemQuantityForPublic));
  }

  /* ============================================================
     BUILD PAGE STRUCTURE
     ============================================================ */
  function buildPage(restaurant) {
    const root    = document.getElementById('restaurant-root');
    const spinner = document.getElementById('loadingSpinner');
    if (spinner) spinner.remove();

    const bgSrc   = resolveImageSrc(restaurant.background_image || restaurant.image, restaurant.id);
    const logoSrc = resolveImageSrc(restaurant.logo, restaurant.id);

    const bgStyle = bgSrc ? `background-image: url('${bgSrc}')` : '';

    root.innerHTML = `
      <header class="restaurant-header">
        <div class="restaurant-header__bg" style="${bgStyle}" aria-hidden="true"></div>
        <nav class="restaurant-header__nav" aria-label="Site navigation">
          <a href="../" class="back-link"
             data-title-en="Back to all restaurants" data-title-bg="Към всички ресторанти"
             data-aria-en="Back to all restaurants" data-aria-bg="Към всички ресторанти">
            <img src="${SITE_FAVICON_HREF}" alt="${esc(SITE_BRAND)}" class="back-link__logo" width="40" height="40" decoding="async" />
          </a>
          <div style="display:flex;align-items:center;gap:10px;">
            <a href="../reserve/?r=${encodeURIComponent(restaurant.id)}" class="header-reserve-link" id="headerReserveLink"
               data-title-en="Reserve a table" data-title-bg="Резервация на маса"
               data-aria-en="Reserve a table" data-aria-bg="Резервация на маса">
              <svg class="header-reserve-link__icon" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <rect x="3" y="5" width="18" height="14" rx="2"/>
                <path d="M3 10h18"/>
                <path d="M8 15h.01M12 15h.01"/>
              </svg>
              <span class="header-reserve-link__text" data-en="Reserve" data-bg="Резервация">Reserve</span>
            </a>
            <div class="theme-switcher" role="group" aria-label="Menu theme">
              <button class="theme-btn" data-theme="classic">Classic</button>
              <button class="theme-btn" data-theme="modern">Modern</button>
            </div>
            <button class="lang-toggle" id="langToggle" aria-label="Toggle language">
              <span class="lang-toggle__label">EN</span>
            </button>
          </div>
        </nav>
        <div class="restaurant-header__content">
          ${logoSrc ? `<img src="${logoSrc}" alt="${esc(restaurantNameAltText(restaurant))}" class="restaurant-header__cover-thumb" onerror="this.style.display='none'" />` : ''}
          <h1 class="restaurant-header__name" id="restaurantName"></h1>
          <p class="restaurant-header__tagline" id="restaurantTagline"></p>
        </div>
      </header>

      <div class="filters-bar" id="filtersBar" role="navigation" aria-label="Menu filters">
        <div class="filters-bar__inner">
          <div class="search-bar-wrap">
            <div class="search-bar" role="search">
              <svg class="search-bar__icon" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" stroke-width="1.4"/>
                <path d="M10 10l3 3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
              </svg>
              <input class="search-bar__input" id="searchInput" type="search"
                     data-en="Search menu…" data-bg="Търси в менюто…"
                     placeholder="Търси в менюто…"
                     autocomplete="off" autocorrect="off" spellcheck="false"
                     aria-label="Search menu" />
              <button class="search-bar__clear hidden" id="searchClear" aria-label="Clear search" type="button">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                  <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                </svg>
              </button>
            </div>
          </div>
          <div class="category-tabs" id="categoryTabs" role="tablist" aria-label="Categories"></div>
          <div class="tag-filters"   id="tagFilters"   aria-label="Tag filters"></div>
          <div class="filters-advanced-toggle-wrap" id="advancedFiltersToggleWrap" hidden>
            <button type="button" class="filters-advanced-toggle" id="advancedFiltersToggle"
                    aria-expanded="false" aria-controls="advancedFiltersPanel">
              <span class="filters-advanced-toggle__label" data-en="More filters" data-bg="Още филтри">More filters</span>
              <span class="filters-advanced-toggle__badge" id="advancedFiltersBadge" hidden>0</span>
              <span class="filters-advanced-toggle__chevron" aria-hidden="true"></span>
            </button>
            <button type="button" class="filters-advanced-clear" id="advancedFiltersClear"
                    data-en="Clear" data-bg="Изчисти">Clear</button>
          </div>
          <div class="filters-advanced-panel hidden" id="advancedFiltersPanel" role="region"
               aria-hidden="true" aria-label="Advanced filters">
            <div class="filters-advanced__section" id="advancedSectionIngredients">
              <h4 class="filters-advanced__label" data-en="Ingredients" data-bg="Съставки">Ingredients</h4>
              <p class="filters-advanced__hint" data-en="Show dishes that include all selected ingredients."
                 data-bg="Покажи ястия, които включват всички избрани съставки.">
                Show dishes that include all selected ingredients.</p>
              <div class="filter-pill-slider" id="ingredientFiltersSlider" role="group"
                   aria-label="Ingredient filters">
                <div class="filter-pill-row filter-pill-row--scroll" id="ingredientFilters"></div>
              </div>
            </div>
            <div class="filters-advanced__section" id="advancedSectionAllergens">
              <h4 class="filters-advanced__label" data-en="Avoid allergens" data-bg="Избягвай алергени">Avoid allergens</h4>
              <p class="filters-advanced__hint" data-en="Hide dishes that contain any of these."
                 data-bg="Скрий ястия, които съдържат някой от тях.">
                Hide dishes that contain any of these.</p>
              <div class="filter-pill-slider" id="allergenExcludeFiltersSlider" role="group"
                   aria-label="Allergen exclusions">
                <div class="filter-pill-row filter-pill-row--scroll" id="allergenExcludeFilters"></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <main class="menu-content" id="menuContent">
        <div id="menuCategories"></div>
      </main>

      <footer class="restaurant-footer">
        <div class="rf__inner">
          <a href="../" class="rf__back"
             data-title-en="Back to all restaurants" data-title-bg="Към всички ресторанти"
             data-aria-en="Back to all restaurants" data-aria-bg="Към всички ресторанти">
            <img src="${SITE_FAVICON_HREF}" alt="${esc(SITE_BRAND)}" class="rf__back-logo" width="36" height="36" decoding="async" />
          </a>
          <p class="rf__copy"
             data-en="Menus are for reference. Prices and availability may vary."
             data-bg="Менютата са за справка. Цените и наличността може да варират.">
            Menus are for reference. Prices and availability may vary.
          </p>
          <div class="rf__contact" id="rfContactMount"></div>
        </div>
      </footer>
    `;

    ensureModal();

    injectRestaurantFooterContact(document.getElementById('rfContactMount'));

    /* Bind events */
    document.getElementById('langToggle')
      .addEventListener('click', () => applyLang(currentLang === 'en' ? 'bg' : 'en'));

    document.querySelectorAll('.theme-btn').forEach(btn => {
      btn.addEventListener('click', () => applyTheme(btn.dataset.theme));
    });

    const reserveNav = document.getElementById('headerReserveLink');
    if (reserveNav) {
      reserveNav.addEventListener('click', () => {
        trackRestaurantEvent('reserve_nav_click', { restaurant_id: restaurant.id });
      });
    }

    /* Search bar */
    const searchInput = document.getElementById('searchInput');
    const searchClear = document.getElementById('searchClear');
    let searchDebounce;
    let searchTrackDebounce;

    searchInput.addEventListener('input', () => {
      /* Fast debounce — update filter results */
      clearTimeout(searchDebounce);
      searchDebounce = setTimeout(() => {
        searchQuery = searchInput.value;
        searchClear.classList.toggle('hidden', !searchQuery);
        if (data) applyFilters(data.restaurant.menu.categories);
      }, 180);

      /* Slower debounce — fire analytics only after user pauses typing */
      clearTimeout(searchTrackDebounce);
      if (searchInput.value.trim()) {
        searchTrackDebounce = setTimeout(() => {
          const term = searchInput.value.trim();
          if (!term) return;
          /* Count matching items for results_count */
          let resultsCount = 0;
          data?.restaurant?.menu?.categories?.forEach(cat => {
            cat.items?.forEach(item => {
              if (matchesSearch(item, term)) resultsCount++;
            });
          });
          /* Use GA4 standard 'search' event so it populates built-in reports */
          trackRestaurantEvent('search', {
            search_term:   term.slice(0, 100),
            results_count: resultsCount
          });
          interactionCount++;
        }, 1200);
      }
    });

    searchClear.addEventListener('click', () => {
      searchInput.value = '';
      searchQuery = '';
      searchClear.classList.add('hidden');
      searchInput.focus();
      if (data) applyFilters(data.restaurant.menu.categories);
    });

    /* Initial render — honour saved preference, fall back to JSON default */
    const initialTheme = currentTheme || restaurant.menu.theme || 'classic';
    currentTheme = initialTheme;

    const menuEl = document.getElementById('menuContent');
    menuEl.classList.add(`theme-${initialTheme}`);
    document.body.dataset.theme = initialTheme;

    document.querySelectorAll('.theme-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.theme === initialTheme);
    });

    const categories = restaurant.menu.categories;
    renderCategoryTabs(categories);
    renderTagFilters(categories);
    renderAdvancedFilters(categories);
    renderMenu(categories);
    applyFilters(categories);

    // Apply language (no animation yet)
    const lang = currentLang || restaurant.default_language || 'en';
    currentLang = lang;
    localStorage.setItem('preferredLang', lang);
    document.documentElement.lang = lang;
    updatePageTitle();
    updateTranslatables(lang);

    const langBtnEl = document.getElementById('langToggle');
    if (langBtnEl) {
      langBtnEl.querySelector('.lang-toggle__label').textContent = lang === 'bg' ? 'EN' : 'BG';
    }

    // From here on, transitions are enabled
    initialized = true;

    /* Apply timed section states (and start minute-update timer) */
    applyTimedStates();
    if (timedSectionTimer) clearInterval(timedSectionTimer);
    timedSectionTimer = setInterval(applyTimedStates, 60 * 1000);

    /* Bind footer contact links */
    document.querySelectorAll('.restaurant-footer .rf__link').forEach(link => {
      link.addEventListener('click', () => {
        const href = link.getAttribute('href') || '';
        const contactType = href.startsWith('tel:')
          ? 'phone'
          : (href.includes('wa.me') ? 'whatsapp' : 'email');
        trackRestaurantEvent('contact_click', { contact_type: contactType });
      });
    });

    /* Fire menu_view — queued if analytics module hasn't loaded yet */
    const allItems = restaurant.menu.categories.reduce(
      (sum, cat) => sum + (cat.items?.length || 0), 0
    );
    pageRestaurantNameEn = (restaurant.name?.en || restaurant.id || RESTAURANT_ID).slice(0, 100);
    pageRestaurantNameBg = (restaurant.name?.bg || restaurant.name?.en || restaurant.id || RESTAURANT_ID).slice(0, 100);

    trackRestaurantEvent('menu_view', {
      theme:            restaurant.menu.theme || 'classic',
      language:         currentLang,
      category_count:   restaurant.menu.categories.length,
      item_count:       allItems
    });
  }

  /* ── Live updates: compare server revision to cached menu ─── */
  let revisionPollTimer = null;
  function startMenuRevisionPolling() {
    if (revisionPollTimer) clearInterval(revisionPollTimer);
    revisionPollTimer = setInterval(checkMenuRevision, 25000);
  }
  async function checkMenuRevision() {
    if (document.visibilityState === 'hidden') return;
    try {
      const apiBase = getMenuApiBase();
      if (!apiBase) return;
      const r = await fetch(`${apiBase}/api/public/menu/${encodeURIComponent(RESTAURANT_ID)}/revision`);
      if (!r.ok) return;
      const j = await r.json();
      const serverRev = typeof j.revision === 'number' ? j.revision : 0;
      const live = cacheGet(MENU_KEY, MENU_CACHE_TTL);
      const stale = cacheGet(MENU_KEY, Infinity, { stale: true });
      const cached = live || stale;
      const cachedRev = cached && typeof cached.rev === 'number' ? cached.rev : null;
      if (cachedRev === null) return;
      if (serverRev > cachedRev) {
        cacheBust(MENU_KEY);
        location.reload();
      }
    } catch (_) { /* ignore */ }
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkMenuRevision();
  });

  /* ============================================================
     FETCH & INIT
     ============================================================ */
  async function init() {
    // ── Layer 1: fresh sessionStorage cache (MENU_CACHE_TTL) ─
    const menuCached = cacheGet(MENU_KEY, MENU_CACHE_TTL);
    if (menuCached) {
      console.debug(`[menu] cache HIT for "${RESTAURANT_ID}" (age ${Math.round(menuCached.age_ms / 60000)} min)`);
      data = menuCached.value;
      if (!currentLang) currentLang = data.restaurant.default_language || 'en';
      if (!restaurantMeta) {
        try {
          const idxRes = await fetch(`${RESOURCES_BASE}/restaurants.json`);
          if (idxRes.ok) {
            const data = await idxRes.json();
            const list = data.restaurants || (Array.isArray(data) ? data : []);
            quantityMetrics = data.quantity_metrics || [];
            restaurantMeta = list.find(r => r.id === RESTAURANT_ID) || null;
          }
        } catch (_) { /* ignore */ }
      }
      normalizeRecordQuantityForPublic(data);
      buildPage(data.restaurant);
      startMenuRevisionPolling();
      return;
    }
    console.debug(`[menu] cache MISS for "${RESTAURANT_ID}" — fetching…`);

    try {
      const apiBase = getMenuApiBase();
      if (!apiBase) {
        console.error(
          '[menu] Missing API base. Set menu_api_base in seo-config.json (production), or ' +
            '<meta name="menu-api-base" content="https://your-api.example.com">, or window.__MENU_API_BASE__.'
        );
        const root = document.getElementById('restaurant-root');
        if (root) {
          root.innerHTML = `
          <div style="min-height:100vh;display:flex;flex-direction:column;
               align-items:center;justify-content:center;gap:16px;padding:40px;max-width:36rem;">
            <div style="font-size:40px">⚙</div>
            <p style="color:var(--color-text-muted);text-align:center;line-height:1.5">
              Menu API URL is not configured for this host (not localhost). Set
              <code style="color:var(--color-accent)">menu_api_base</code> in
              <code>seo-config.json</code> and regenerate pages, or add
              <code style="word-break:break-all">&lt;meta name="menu-api-base" content="https://your-api.example.com"&gt;</code>
              or <code>window.__MENU_API_BASE__</code>.
            </p>
            <a href="../" class="menu-error-back" aria-label="Back to all restaurants" title="Back to all restaurants">
              <img src="${SITE_FAVICON_HREF}" alt="${esc(SITE_BRAND)}" class="menu-error-back__logo" width="52" height="52" decoding="async" />
            </a>
          </div>`;
        }
        return;
      }
      const res = await fetch(`${apiBase}/api/public/menu/${encodeURIComponent(RESTAURANT_ID)}`);
      if (!res.ok) throw new Error(`Menu API HTTP ${res.status}`);
      const wrapper = await res.json();
      const rawData = wrapper.record;
      const serverRev = typeof wrapper.revision === 'number' ? wrapper.revision : 0;
      if (!rawData) throw new Error('API returned empty record');

      if (!restaurantMeta) {
        try {
          const idxRes = await fetch(`${RESOURCES_BASE}/restaurants.json`);
          if (idxRes.ok) {
            const data = await idxRes.json();
            const list = data.restaurants || (Array.isArray(data) ? data : []);
            quantityMetrics = data.quantity_metrics || [];
            restaurantMeta = list.find(r => r.id === RESTAURANT_ID) || null;
          }
        } catch (_) { /* optional metadata */ }
      }

      normalizeRecordQuantityForPublic(rawData);
      cacheSet(MENU_KEY, rawData, serverRev);
      console.debug(`[menu] fetched & cached (${Math.round(MENU_CACHE_TTL / 60000)} min TTL, revision ${serverRev})`);

      data = rawData;
      if (!currentLang) currentLang = data.restaurant.default_language || 'en';
      buildPage(data.restaurant);
      startMenuRevisionPolling();

    } catch (err) {
      // ── Layer 4: network failed — serve stale cache ────────
      console.warn(`[menu] fetch failed (${err.message}) — trying stale cache…`);
      const stale = cacheGet(MENU_KEY, Infinity, { stale: true });
      if (stale) {
        console.debug(`[menu] serving stale cache (age ${Math.round(stale.age_ms / 60000)} min)`);
        data = stale.value;
        if (!currentLang) currentLang = data.restaurant.default_language || 'en';
        normalizeRecordQuantityForPublic(data);
        buildPage(data.restaurant);
        setTimeout(() => {
          const banner = document.createElement('div');
          banner.style.cssText =
            'position:fixed;bottom:16px;left:50%;transform:translateX(-50%);' +
            'background:rgba(20,20,36,0.95);border:1px solid rgba(255,255,255,0.1);' +
            'color:rgba(240,236,228,0.6);font-size:12px;padding:8px 18px;' +
            'border-radius:999px;z-index:9999;pointer-events:none;';
          banner.textContent = 'Showing cached menu — could not reach server.';
          document.body.appendChild(banner);
          setTimeout(() => banner.remove(), 5000);
        }, 500);
        return;
      }

      // ── Layer 5: nothing at all — show error ───────────────
      console.error('[menu] no cache, no network:', err);
      const root = document.getElementById('restaurant-root');
      if (root) {
        root.innerHTML = `
          <div style="min-height:100vh;display:flex;flex-direction:column;
               align-items:center;justify-content:center;gap:16px;padding:40px;">
            <div style="font-size:40px">🍽</div>
            <p style="color:var(--color-text-muted);text-align:center">
              Could not load menu. Please try again later.</p>
            <a href="../" class="menu-error-back" aria-label="Back to all restaurants" title="Back to all restaurants">
              <img src="${SITE_FAVICON_HREF}" alt="${esc(SITE_BRAND)}" class="menu-error-back__logo" width="52" height="52" decoding="async" />
            </a>
          </div>`;
      }
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
