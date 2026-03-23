/* ============================================================
   restaurant.js — Restaurant page logic
   Expects: window.RESTAURANT_ID, window.RESOURCES_BASE
   ============================================================ */

(function () {
  'use strict';

  const RESTAURANT_ID  = window.RESTAURANT_ID  || 'unknown';
  const RESOURCES_BASE = window.RESOURCES_BASE || '../resources';
  const JSONBIN_BASE   = 'https://api.jsonbin.io/v3/b';

  const CACHE_TTL = 60 * 60 * 1000;                      // 1 hour
  const CACHE_KEY = `menu_cache_${RESTAURANT_ID}`;

  function getCached() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const { payload, ts } = JSON.parse(raw);
      if (Date.now() - ts > CACHE_TTL) {
        localStorage.removeItem(CACHE_KEY);
        return null;                                      // expired
      }
      return payload;
    } catch { return null; }
  }

  function getStaleCached() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      return JSON.parse(raw).payload || null;             // ignore TTL
    } catch { return null; }
  }

  function setCached(payload) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ payload, ts: Date.now() }));
    } catch { /* localStorage full — skip silently */ }
  }

  let data           = null;
  let currentLang    = localStorage.getItem('preferredLang') || null;
  let currentTheme   = null;
  let activeCategory = 'all';
  let activeTags     = new Set();
  let allTags        = [];
  let initialized    = false; // skip animations on first render

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

    // Fade content, swap text, fade back
    const content = document.getElementById('menuCategories');
    const filters = document.getElementById('filtersBar');
    const header  = document.querySelector('.restaurant-header__content');

    [content, filters, header].forEach(el => {
      if (el) { el.style.transition = 'opacity 0.15s ease'; el.style.opacity = '0.45'; }
    });

    setTimeout(() => {
      updateTranslatables(lang);
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
    if (activeTags.has(tagEn)) {
      activeTags.delete(tagEn);
    } else {
      activeTags.add(tagEn);
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

      <footer class="site-footer">
        <p data-en="Menus are for reference. Prices and availability may vary."
           data-bg="Менютата са за справка. Цените и наличността може да варират.">
          Menus are for reference. Prices and availability may vary.
        </p>
      </footer>
    `;

    /* Bind events */
    document.getElementById('langToggle')
      .addEventListener('click', () => applyLang(currentLang === 'en' ? 'bg' : 'en'));

    document.querySelectorAll('.theme-btn').forEach(btn => {
      btn.addEventListener('click', () => applyTheme(btn.dataset.theme));
    });

    /* Initial render — no animations */
    const initialTheme = restaurant.menu.theme || 'classic';
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
  }

  /* ============================================================
     FETCH & INIT
     ============================================================ */
  async function init() {
    try {
      // ── 1. Serve from cache if fresh ─────────────────────
      const cached = getCached();
      if (cached) {
        data = cached;
        if (!currentLang) currentLang = data.restaurant.default_language || 'en';
        buildPage(data.restaurant);
        return;
      }

      // ── 2. Resolve bin ID ─────────────────────────────────
      let binId = window.MENU_BIN_ID || null;
      if (!binId) {
        try {
          const idxRes = await fetch(`${RESOURCES_BASE}/restaurants.json`);
          if (idxRes.ok) {
            const list = await idxRes.json();
            const entry = list.find(r => r.id === RESTAURANT_ID);
            if (entry && entry.menu_bin_id && entry.menu_bin_id !== 'PASTE_BIN_ID_HERE') {
              binId = entry.menu_bin_id;
            }
          }
        } catch (_) { /* fall through */ }
      }

      // ── 3. Fetch live data ────────────────────────────────
      let rawData;
      if (binId) {
        const res = await fetch(`${JSONBIN_BASE}/${binId}/latest`);
        if (!res.ok) throw new Error(`Jsonbin HTTP ${res.status}`);
        const wrapper = await res.json();
        rawData = wrapper.record;
      } else {
        const res = await fetch(`${RESOURCES_BASE}/${RESTAURANT_ID}/menu.json`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        rawData = await res.json();
      }

      setCached(rawData);                                 // store with timestamp
      data = rawData;
      if (!currentLang) currentLang = data.restaurant.default_language || 'en';
      buildPage(data.restaurant);

    } catch (err) {
      // ── 4. Network failed — try stale cache as fallback ───
      const stale = getStaleCached();
      if (stale) {
        data = stale;
        if (!currentLang) currentLang = data.restaurant.default_language || 'en';
        buildPage(data.restaurant);
        // Non-blocking banner so user knows they're seeing cached content
        setTimeout(() => {
          const banner = document.createElement('div');
          banner.style.cssText = 'position:fixed;bottom:16px;left:50%;transform:translateX(-50%);' +
            'background:rgba(20,20,36,0.95);border:1px solid rgba(255,255,255,0.1);' +
            'color:rgba(240,236,228,0.6);font-size:12px;padding:8px 18px;border-radius:999px;' +
            'z-index:9999;pointer-events:none;';
          banner.textContent = 'Showing cached menu — could not reach server.';
          document.body.appendChild(banner);
          setTimeout(() => banner.remove(), 5000);
        }, 500);
        return;
      }
      const root = document.getElementById('restaurant-root');
      if (root) {
        root.innerHTML = `
          <div class="empty-state" style="min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;">
            <div class="empty-state__icon">🍽</div>
            <p class="empty-state__msg" style="color:var(--color-text-muted)">Could not load menu. Please try again later.</p>
            <a href="../" style="margin-top:20px;color:var(--color-accent)">← Back to restaurants</a>
          </div>`;
      }
      console.error('Failed to load menu.json:', err);
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
