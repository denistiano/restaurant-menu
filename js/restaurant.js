/* ============================================================
   restaurant.js — Restaurant page logic
   Expects: window.RESTAURANT_ID, window.RESOURCES_BASE
   ============================================================ */

(function () {
  'use strict';

  const RESTAURANT_ID  = window.RESTAURANT_ID  || 'unknown';
  const RESOURCES_BASE = window.RESOURCES_BASE || '../resources';

  let data         = null;
  let currentLang  = localStorage.getItem('preferredLang') || 'en';
  let currentTheme = null;
  let activeCategory = 'all';
  let activeTags   = new Set();
  let allTags      = [];

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
     LANGUAGE
     ============================================================ */
  function applyLang(lang) {
    currentLang = lang;
    localStorage.setItem('preferredLang', lang);
    document.documentElement.lang = lang;
    rerenderAll();

    const btn = document.getElementById('langToggle');
    if (btn) {
      btn.querySelector('.lang-toggle__label').textContent = lang === 'en' ? 'BG' : 'EN';
    }
  }

  /* ============================================================
     THEME
     ============================================================ */
  function applyTheme(theme) {
    currentTheme = theme;
    const menuEl = document.getElementById('menuContent');
    if (!menuEl) return;
    menuEl.classList.remove('theme-classic', 'theme-modern');
    menuEl.classList.add(`theme-${theme}`);

    document.querySelectorAll('.theme-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.theme === theme);
    });

    rerenderAll();
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
    allBtn.textContent = currentLang === 'bg' ? 'Всички' : 'All';
    allBtn.dataset.cat = 'all';
    allBtn.addEventListener('click', () => selectCategory('all', categories));
    container.appendChild(allBtn);

    categories.forEach(cat => {
      const btn = document.createElement('button');
      btn.className = 'category-tab' + (activeCategory === cat.id ? ' active' : '');
      btn.textContent = t(cat.name);
      btn.dataset.cat = cat.id;
      btn.addEventListener('click', () => selectCategory(cat.id, categories));
      container.appendChild(btn);
    });
  }

  function selectCategory(catId, categories) {
    activeCategory = catId;
    activeTags.clear();
    rerenderAll();

    const tabs = document.querySelectorAll('.category-tab');
    tabs.forEach(tab => tab.classList.toggle('active', tab.dataset.cat === catId));

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
      chip.className = 'tag-chip' + (activeTags.has(tag.en) ? ' active' : '');
      chip.textContent = t(tag);
      chip.dataset.tagEn = tag.en;
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

        const passesTag = activeTags.size === 0 || (item.tags || []).some(tag => activeTags.has(tag.en));
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
    const config   = data.restaurant.menu.config;
    const showTags = config.show_tags;
    const showDesc = config.show_description;
    const showPrice = config.show_price;

    const tagHtml = (showTags && item.tags && item.tags.length)
      ? `<div class="menu-item__tags">${item.tags.map(tag => `<span class="menu-item__tag">${esc(t(tag))}</span>`).join('')}</div>`
      : '';

    const descText = showDesc ? t(item.description) : '';
    const descHtml = descText ? `<p class="menu-item__desc">${esc(descText)}</p>` : '';

    const priceHtml = showPrice
      ? `<span class="menu-item__leader"></span><span class="menu-item__price">${esc(formatPrice(item.price))}</span>`
      : '';

    const el = document.createElement('div');
    el.className = 'menu-item' + (!item.availability ? ' unavailable' : '');
    el.innerHTML = `
      <span class="menu-item__number">${index + 1}.</span>
      <div class="menu-item__body">
        <span class="menu-item__name${!item.availability ? ' unavailable' : ''}">${esc(t(item.name))}</span>
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

    const imgSrc = item.image
      ? `${RESOURCES_BASE}/${restaurantId}/menu-images/${item.image}`
      : null;

    const imgHtml = imgSrc
      ? `<div class="menu-item__img-wrap">
           <img src="${esc(imgSrc)}" alt="${esc(t(item.name))}" loading="lazy"
                onerror="this.parentElement.innerHTML='<div class=\\"menu-item__img-placeholder\\">🍽</div>'" />
         </div>`
      : '';

    const descText = showDesc ? t(item.description) : '';
    const descHtml = descText ? `<p class="menu-item__desc">${esc(descText)}</p>` : '';

    const tagHtml = (showTags && item.tags && item.tags.length)
      ? `<div class="menu-item__tags">${item.tags.map(tag => `<span class="menu-item__tag">${esc(t(tag))}</span>`).join('')}</div>`
      : '<div class="menu-item__tags"></div>';

    const priceHtml = showPrice
      ? `<span class="menu-item__price">${esc(formatPrice(item.price))}</span>`
      : '';

    const el = document.createElement('div');
    el.className = 'menu-item' + (!item.availability ? ' unavailable' : '');
    el.innerHTML = `
      ${imgHtml}
      <div class="menu-item__body">
        <h3 class="menu-item__name">${esc(t(item.name))}</h3>
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

      section.innerHTML = `<h2 class="menu-category__title">${esc(t(cat.name))}</h2>`;

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
      emptyMsg.className = 'category-empty';
      emptyMsg.style.display = 'none';
      emptyMsg.style.padding = '16px 0';
      emptyMsg.style.color = 'var(--color-text-muted)';
      emptyMsg.style.fontSize = '14px';
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
     RERENDER ALL (on lang/theme change)
     ============================================================ */
  function rerenderAll() {
    if (!data) return;
    const categories = data.restaurant.menu.categories;
    renderCategoryTabs(categories);
    renderTagFilters(categories);
    renderMenu(categories);
    applyFilters(categories);
    updatePageTitle();
  }

  /* ============================================================
     BUILD PAGE STRUCTURE
     ============================================================ */
  function updatePageTitle() {
    if (!data) return;
    document.title = t(data.restaurant.name);
    const nameEl = document.getElementById('restaurantName');
    if (nameEl) nameEl.textContent = t(data.restaurant.name);
    const taglineEl = document.getElementById('restaurantTagline');
    if (taglineEl) taglineEl.textContent = t(data.restaurant.description);
  }

  function buildPage(restaurant) {
    const root = document.getElementById('restaurant-root');
    const spinner = document.getElementById('loadingSpinner');
    if (spinner) spinner.remove();

    const coverSrc = restaurant.image
      ? `${RESOURCES_BASE}/${restaurant.id}/${restaurant.image}`
      : null;

    const bgStyle = coverSrc ? `background-image: url('${coverSrc}')` : '';

    root.innerHTML = `
      <!-- HEADER -->
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
              <span class="lang-toggle__label">BG</span>
            </button>
          </div>
        </nav>
        <div class="restaurant-header__content">
          ${coverSrc ? `<img src="${coverSrc}" alt="${esc(t(restaurant.name))}" class="restaurant-header__cover-thumb" onerror="this.style.display='none'" />` : ''}
          <h1 class="restaurant-header__name" id="restaurantName">${esc(t(restaurant.name))}</h1>
          <p class="restaurant-header__tagline" id="restaurantTagline">${esc(t(restaurant.description))}</p>
        </div>
      </header>

      <!-- STICKY FILTERS -->
      <div class="filters-bar" id="filtersBar" role="navigation" aria-label="Menu filters">
        <div class="filters-bar__inner">
          <div class="category-tabs" id="categoryTabs" role="tablist" aria-label="Categories"></div>
          <div class="tag-filters" id="tagFilters" aria-label="Tag filters"></div>
        </div>
      </div>

      <!-- MENU -->
      <main class="menu-content theme-classic" id="menuContent">
        <div id="menuCategories"></div>
      </main>

      <!-- FOOTER -->
      <footer class="site-footer">
        <p data-en="Menus are for reference. Prices and availability may vary." data-bg="Менютата са за справка. Цените и наличността може да варират.">
          Menus are for reference. Prices and availability may vary.
        </p>
      </footer>
    `;

    /* Bind events */
    const langBtn = document.getElementById('langToggle');
    if (langBtn) {
      langBtn.addEventListener('click', () => applyLang(currentLang === 'en' ? 'bg' : 'en'));
    }

    document.querySelectorAll('.theme-btn').forEach(btn => {
      btn.addEventListener('click', () => applyTheme(btn.dataset.theme));
    });

    /* Initial render */
    applyTheme(restaurant.menu.theme || 'classic');
    applyLang(currentLang);
  }

  /* ============================================================
     FETCH & INIT
     ============================================================ */
  async function init() {
    try {
      const res = await fetch(`${RESOURCES_BASE}/${RESTAURANT_ID}/menu.json`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      data = await res.json();
      buildPage(data.restaurant);
    } catch (err) {
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
