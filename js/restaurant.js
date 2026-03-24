/* ============================================================
   restaurant.js — Restaurant page logic + Analytics
   Expects: window.RESTAURANT_ID, window.RESOURCES_BASE

   EVENTS FIRED ON THIS PAGE
   ┌──────────────────────┬──────────────────────────────────────────────────┐
   │ Event                │ Key params                                       │
   ├──────────────────────┼──────────────────────────────────────────────────┤
   │ menu_view            │ restaurant_id/name, theme, language,             │
   │                      │ category_count, item_count                       │
   │ category_select      │ restaurant_id, category_id, category_name        │
   │ tag_filter           │ restaurant_id, tag, action, active_count         │
   │ search  (GA4 std)    │ search_term, restaurant_id, results_count        │
   │ item_view            │ restaurant_id, item_name, item_price,            │
   │                      │ category_id, category_name                       │
   │ theme_change         │ restaurant_id, from_theme, to_theme              │
   │ language_change      │ restaurant_id, from_lang, to_lang                │
   │ contact_click        │ restaurant_id, contact_type (phone|email)        │
   │ menu_exit            │ restaurant_id, duration_sec, interaction_count   │
   └──────────────────────┴──────────────────────────────────────────────────┘
   ============================================================ */

(function () {
  'use strict';

  const RESTAURANT_ID  = window.RESTAURANT_ID  || 'unknown';
  const RESOURCES_BASE = window.RESOURCES_BASE || '../resources';
  const JSONBIN_BASE   = 'https://api.jsonbin.io/v3/b';

  // ── Cache config ─────────────────────────────────────────
  // Bump CV whenever the stored shape changes to auto-bust old entries.
  const CACHE_VERSION  = 'v2';
  const MENU_CACHE_TTL = 60 * 60 * 1000;         // 1 h  — menu data
  const BIN_CACHE_TTL  = 24 * 60 * 60 * 1000;    // 24 h — bin ID lookup
  const MENU_KEY       = `menu_${CACHE_VERSION}_${RESTAURANT_ID}`;
  const BIN_KEY        = `binid_${CACHE_VERSION}_${RESTAURANT_ID}`;

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
      return { value: entry.v, age_ms: age };
    } catch {
      return null;
    }
  }

  /** Write a value to sessionStorage with a timestamp. Silent on quota errors. */
  function cacheSet(key, value) {
    try {
      sessionStorage.setItem(key, JSON.stringify({ v: value, ts: Date.now() }));
    } catch { /* quota exceeded — degrade gracefully */ }
  }

  /** Remove a cache entry. */
  function cacheBust(key) {
    try { sessionStorage.removeItem(key); } catch { }
  }

  /** Expose bust function so admin page can call it after a save. */
  window.__bustMenuCache = () => cacheBust(MENU_KEY);

  /* ── Analytics: fire menu_exit exactly once ─────────────── */
  function fireMenuExit() {
    if (menuExitFired || !initialized) return;
    menuExitFired = true;
    window.trackEvent?.('menu_exit', {
      restaurant_id:     RESTAURANT_ID,
      duration_sec:      Math.round((Date.now() - pageStartMs) / 1000),
      interaction_count: interactionCount
    });
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') fireMenuExit();
  });
  window.addEventListener('pagehide', fireMenuExit);

  let data              = null;
  let currentLang       = localStorage.getItem('preferredLang')   || null;
  let currentTheme      = localStorage.getItem('preferredTheme')  || null;
  let activeCategory    = 'all';
  let activeTags        = new Set();
  let allTags           = [];
  let initialized       = false;  // skip animations on first render
  let currentModalItem  = null;   // item currently shown in the detail modal
  let searchQuery       = '';     // live search string

  /* ── Per-session analytics state ────────────────────────── */
  const pageStartMs      = window._sessionStartMs || Date.now();
  let   interactionCount = 0;   // incremented on every meaningful interaction
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

  function formatPrice(price) {
    if (price === undefined || price === null) return '';
    return price.toFixed(2) + '€';
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
    let categoryId = '', categoryName = '';
    for (const cat of data?.restaurant?.menu?.categories || []) {
      if (cat.items?.some(i => i === item)) {
        categoryId   = cat.id;
        categoryName = cat.name.en || cat.id;
        break;
      }
    }

    window.trackEvent?.('item_view', {
      restaurant_id:  RESTAURANT_ID,
      item_name:      (item.name.en || '').slice(0, 100),
      item_name_bg:   (item.name.bg || '').slice(0, 100),
      item_price:     item.price ?? 0,
      category_id:    categoryId,
      category_name:  categoryName
    });
    interactionCount++;

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
  }

  /** Tab / share title: {Name} - {Description} - Menu (localized Menu/Меню). */
  function buildTabTitle(restaurant) {
    const name = t(restaurant.name);
    const desc = t(restaurant.description).trim();
    const menuWord = currentLang === 'bg' ? 'Меню' : 'Menu';
    if (desc) return `${name} - ${desc} - ${menuWord}`;
    return `${name} - ${menuWord}`;
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
      return;
    }

    window.trackEvent?.('language_change', {
      restaurant_id: RESTAURANT_ID,
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

    window.trackEvent?.('theme_change', {
      restaurant_id: RESTAURANT_ID,
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
    if (initialized) {
      const cat = categories.find(c => c.id === catId);
      window.trackEvent?.('category_select', {
        restaurant_id:  RESTAURANT_ID,
        category_id:    catId,
        category_name:  cat ? (cat.name.en || catId) : catId,
        item_count:     cat ? (cat.items?.length || 0) : 0
      });
      interactionCount++;
    }
    activeCategory = catId;
    activeTags.clear();

    document.querySelectorAll('.category-tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.cat === catId);
    });

    renderTagFilters(categories);
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
      window.trackEvent?.('tag_filter', {
        restaurant_id: RESTAURANT_ID,
        tag:           tagEn,
        action:        adding ? 'add' : 'remove',
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

  /* ============================================================
     APPLY FILTERS (show/hide items & categories)
     ============================================================ */
  function applyFilters(categories) {
    const hasTagFilter    = activeTags.size > 0;
    const hasSearchFilter = searchQuery.trim() !== '';
    const anyFilter       = hasTagFilter || hasSearchFilter;
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
        const passesSearch = matchesSearch(item, searchQuery.trim());
        const passes = passesTag && passesSearch;
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
        noResultsEl.dataset.en = 'No items match your search.';
        noResultsEl.dataset.bg = 'Няма намерени продукти.';
        noResultsEl.textContent = currentLang === 'bg'
          ? 'Няма намерени продукти.'
          : 'No items match your search.';
        document.getElementById('menuCategories')?.after(noResultsEl);
      }
      noResultsEl.style.display = 'block';
    } else if (noResultsEl) {
      noResultsEl.style.display = 'none';
    }
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
      lazyLoadImage(el.querySelector('.menu-item__img-wrap'), imgSrc, nameEn);
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
          <a href="../" class="back-link" aria-label="Back to all restaurants">
            <span class="back-link__arrow" aria-hidden="true">&#8592;</span>
            <span data-en="All restaurants" data-bg="Всички ресторанти">All restaurants</span>
          </a>
          <div style="display:flex;align-items:center;gap:12px;">
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
          ${logoSrc ? `<img src="${logoSrc}" alt="${esc(restaurant.name.en||'')}" class="restaurant-header__cover-thumb" onerror="this.style.display='none'" />` : ''}
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
        </div>
      </div>

      <main class="menu-content" id="menuContent">
        <div id="menuCategories"></div>
      </main>

      <footer class="restaurant-footer">
        <div class="rf__inner">
          <a href="../" class="rf__back">
            <span aria-hidden="true">&#8592;</span>
            <span data-en="All restaurants" data-bg="Всички ресторанти">All restaurants</span>
          </a>
          <p class="rf__copy"
             data-en="Menus are for reference. Prices and availability may vary."
             data-bg="Менютата са за справка. Цените и наличността може да варират.">
            Menus are for reference. Prices and availability may vary.
          </p>
          <div class="rf__contact">
            <a href="tel:+359898513566" class="rf__link">+359 898 513 566</a>
            <a href="mailto:denistiano@gmail.com" class="rf__link">denistiano@gmail.com</a>
          </div>
        </div>
      </footer>
    `;

    ensureModal();

    /* Bind events */
    document.getElementById('langToggle')
      .addEventListener('click', () => applyLang(currentLang === 'en' ? 'bg' : 'en'));

    document.querySelectorAll('.theme-btn').forEach(btn => {
      btn.addEventListener('click', () => applyTheme(btn.dataset.theme));
    });

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
          window.trackEvent?.('search', {
            search_term:    term.slice(0, 100),
            restaurant_id:  RESTAURANT_ID,
            results_count:  resultsCount
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
        window.trackEvent?.('contact_click', {
          restaurant_id: RESTAURANT_ID,
          contact_type:  link.href.startsWith('tel:') ? 'phone' : 'email'
        });
      });
    });

    /* Fire menu_view — queued if analytics module hasn't loaded yet */
    const allItems = restaurant.menu.categories.reduce(
      (sum, cat) => sum + (cat.items?.length || 0), 0
    );
    window.trackEvent?.('menu_view', {
      restaurant_id:    restaurant.id,
      restaurant_name:  (restaurant.name.en || restaurant.id).slice(0, 100),
      theme:            restaurant.menu.theme || 'classic',
      language:         currentLang,
      category_count:   restaurant.menu.categories.length,
      item_count:       allItems
    });
  }

  /* ============================================================
     FETCH & INIT
     ============================================================ */
  async function init() {
    // ── Layer 1: fresh sessionStorage cache (< 1 h) ──────────
    const menuCached = cacheGet(MENU_KEY, MENU_CACHE_TTL);
    if (menuCached) {
      console.debug(`[menu] cache HIT for "${RESTAURANT_ID}" (age ${Math.round(menuCached.age_ms / 60000)} min)`);
      data = menuCached.value;
      if (!currentLang) currentLang = data.restaurant.default_language || 'en';
      buildPage(data.restaurant);
      return;
    }
    console.debug(`[menu] cache MISS for "${RESTAURANT_ID}" — fetching…`);

    try {
      // ── Layer 2: resolve bin ID (cached 24 h) ──────────────
      let binId = window.MENU_BIN_ID || null;

      if (!binId) {
        const binCached = cacheGet(BIN_KEY, BIN_CACHE_TTL);
        if (binCached) {
          binId = binCached.value;
          console.debug(`[menu] bin ID from cache: ${binId}`);
        } else {
          try {
            const idxRes = await fetch(`${RESOURCES_BASE}/restaurants.json`);
            if (idxRes.ok) {
              const list = await idxRes.json();
              const entry = list.find(r => r.id === RESTAURANT_ID);
              if (entry && entry.menu_bin_id && entry.menu_bin_id !== 'PASTE_BIN_ID_HERE') {
                binId = entry.menu_bin_id;
                cacheSet(BIN_KEY, binId);               // cache bin ID for 24 h
                console.debug(`[menu] bin ID fetched & cached: ${binId}`);
              }
            }
          } catch (_) { /* fall through to local file */ }
        }
      }

      // ── Layer 3: fetch live menu data ──────────────────────
      let rawData;
      if (!binId) {
        throw new Error(
          'No menu_bin_id for this restaurant. Add it in resources/restaurants.json (source of truth).'
        );
      }
      const res = await fetch(`${JSONBIN_BASE}/${binId}/latest`);
      if (!res.ok) throw new Error(`Jsonbin HTTP ${res.status}`);
      const wrapper = await res.json();
      rawData = wrapper.record;
      if (!rawData) throw new Error('Jsonbin returned empty record');

      cacheSet(MENU_KEY, rawData);                       // store with 1 h TTL
      console.debug(`[menu] fetched & cached for 1 h`);

      data = rawData;
      if (!currentLang) currentLang = data.restaurant.default_language || 'en';
      buildPage(data.restaurant);

    } catch (err) {
      // ── Layer 4: network failed — serve stale cache ────────
      console.warn(`[menu] fetch failed (${err.message}) — trying stale cache…`);
      const stale = cacheGet(MENU_KEY, Infinity, { stale: true });
      if (stale) {
        console.debug(`[menu] serving stale cache (age ${Math.round(stale.age_ms / 60000)} min)`);
        data = stale.value;
        if (!currentLang) currentLang = data.restaurant.default_language || 'en';
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
            <a href="../" style="color:var(--color-accent)">← Back to restaurants</a>
          </div>`;
      }
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
