/* ============================================================
   restaurant.js — Restaurant page logic
   Expects: window.RESTAURANT_ID, window.RESOURCES_BASE
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

  let data              = null;
  let currentLang       = localStorage.getItem('preferredLang')   || null;
  let currentTheme      = localStorage.getItem('preferredTheme')  || null;
  let activeCategory    = 'all';
  let activeTags        = new Set();
  let allTags           = [];
  let initialized       = false; // skip animations on first render
  let currentModalItem  = null;  // item currently shown in the detail modal

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
  }

  function populateModal(item) {
    const imgWrap = document.getElementById('itemModalImgWrap');
    const body    = document.getElementById('itemModalBody');
    if (!imgWrap || !body) return;

    const restaurantId = data?.restaurant?.id;
    const imgSrc = (item.image && restaurantId)
      ? `${RESOURCES_BASE}/${restaurantId}/menu-images/${item.image}`
      : null;

    if (imgSrc) {
      imgWrap.style.display = '';
      imgWrap.innerHTML = `<img src="${esc(imgSrc)}" alt="${esc(t(item.name))}" class="item-modal__img" onerror="this.parentElement.style.display='none'">`;
    } else {
      imgWrap.style.display = 'none';
      imgWrap.innerHTML = '';
    }

    const tagsHtml = (item.tags && item.tags.length)
      ? `<div class="item-modal__tags">${item.tags.map(tag =>
          `<span class="item-modal__tag">${esc(t(tag))}</span>`
        ).join('')}</div>`
      : '';

    const descText = item.description ? t(item.description) : '';
    const descHtml = descText
      ? `<p class="item-modal__desc">${esc(descText)}</p>`
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

    window.trackEvent?.('item_view', {
      restaurant_id: RESTAURANT_ID,
      item_name:     item.name.en || ''
    });

    setTimeout(() => {
      document.getElementById('itemModalClose')?.focus();
    }, 350);
  }

  function closeItemModal() {
    const modal = document.getElementById('itemModal');
    if (!modal || !modal.classList.contains('open')) return;
    modal.classList.remove('open');
    document.body.style.overflow = '';
    currentModalItem = null;
  }

  /* ============================================================
     IN-PLACE TEXT UPDATE (used by applyLang)
     ============================================================ */
  function updateTranslatables(lang) {
    document.querySelectorAll('[data-en]').forEach(el => {
      if (el.childElementCount === 0) {
        el.textContent = (lang === 'bg' && el.dataset.bg)
          ? el.dataset.bg
          : (el.dataset.en || '');
      }
    });
  }

  /* ============================================================
     LANGUAGE — smooth crossfade, no DOM rebuild
     ============================================================ */
  function applyLang(lang) {
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

    window.trackEvent?.('language_switch', {
      language:      lang,
      restaurant_id: RESTAURANT_ID
    });

    // Fade content, swap text, fade back
    const content = document.getElementById('menuCategories');
    const filters = document.getElementById('filtersBar');
    const header  = document.querySelector('.restaurant-header__content');

    [content, filters, header].forEach(el => {
      if (el) { el.style.transition = 'opacity 0.15s ease'; el.style.opacity = '0.45'; }
    });

    setTimeout(() => {
      updateTranslatables(lang);
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

    window.trackEvent?.('theme_switch', {
      theme,
      restaurant_id: RESTAURANT_ID
    });

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
     COLLECT ALL UNIQUE TAGS
     ============================================================ */
  function collectTags(categories, categoryId) {
    const seen = new Map();
    categories.forEach(cat => {
      if (categoryId !== 'all' && cat.id !== categoryId) return;
      cat.items.forEach(item => {
        (item.tags || []).forEach(tag => {
          const key = tag.en || '';
          if (key && !seen.has(key)) seen.set(key, tag);
        });
      });
    });
    return Array.from(seen.values());
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
        category_name:  cat ? (cat.name.en || catId) : catId
      });
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
        tag_name:      tagEn,
        action:        adding ? 'add' : 'remove',
        active_tags:   Array.from(activeTags).join(',')
      });
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
    categories.forEach(cat => {
      const catEl = document.getElementById(`cat-${cat.id}`);
      if (!catEl) return;

      const isVisibleCat = activeCategory === 'all' || activeCategory === cat.id;
      if (!isVisibleCat) {
        catEl.classList.add('hidden');
        return;
      }
      catEl.classList.remove('hidden');

      let visibleCount = 0;
      const items = catEl.querySelectorAll('.menu-item');
      items.forEach((itemEl, idx) => {
        const item = cat.items[idx];
        if (!item) return;
        const passesTag = activeTags.size === 0 ||
          Array.from(activeTags).every(activeTag =>
            (item.tags || []).some(tag => tag.en === activeTag));
        itemEl.classList.toggle('filtered-out', !passesTag);
        if (passesTag) visibleCount++;
      });

      const emptyEl = catEl.querySelector('.category-empty');
      if (emptyEl) emptyEl.style.display = visibleCount === 0 ? 'block' : 'none';
    });
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

    const imgSrc = item.image
      ? `${RESOURCES_BASE}/${restaurantId}/menu-images/${item.image}`
      : null;

    const imgHtml = imgSrc
      ? `<div class="menu-item__img-wrap">
           <img src="${esc(imgSrc)}" alt="${esc(nameEn)}" loading="lazy"
                onerror="this.parentElement.style.display='none'" />
         </div>`
      : '';

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
    el.innerHTML = `
      ${imgHtml}
      <div class="menu-item__body">
        <h3 class="menu-item__name" data-en="${esc(nameEn)}" data-bg="${esc(nameBg)}">${esc(t(item.name))}</h3>
        ${descHtml}
        <div class="menu-item__footer">
          ${tagHtml}
          ${priceHtml}
        </div>
      </div>
    `;
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
    document.title = t(data.restaurant.name);
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

    const bgSrc = restaurant.background_image
      ? `${RESOURCES_BASE}/${restaurant.id}/${restaurant.background_image}`
      : (restaurant.image ? `${RESOURCES_BASE}/${restaurant.id}/${restaurant.image}` : null);

    const logoSrc = restaurant.logo
      ? `${RESOURCES_BASE}/${restaurant.id}/${restaurant.logo}`
      : null;

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

    // Track restaurant view — queued if analytics hasn't loaded yet
    window.trackEvent?.('restaurant_view', {
      restaurant_id:   restaurant.id,
      restaurant_name: restaurant.name.en || restaurant.id,
      theme:           restaurant.menu.theme || 'classic',
      language:        currentLang
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
      if (binId) {
        const res = await fetch(`${JSONBIN_BASE}/${binId}/latest`);
        if (!res.ok) throw new Error(`Jsonbin HTTP ${res.status}`);
        const wrapper = await res.json();
        rawData = wrapper.record;
        if (!rawData) throw new Error('Jsonbin returned empty record');
      } else {
        // No bin configured — fall back to local JSON file
        const res = await fetch(`${RESOURCES_BASE}/${RESTAURANT_ID}/menu.json`);
        if (!res.ok) throw new Error(`Local file HTTP ${res.status}`);
        rawData = await res.json();
      }

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
