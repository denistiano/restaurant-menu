/* ============================================================
   app.js — Landing page logic
   ============================================================ */

(function () {
  'use strict';

  const DEFAULT_LANG = 'en';
  let currentLang = localStorage.getItem('preferredLang') || DEFAULT_LANG;

  /* ============================================================
     LANGUAGE
     ============================================================ */
  function applyLang(lang) {
    currentLang = lang;
    localStorage.setItem('preferredLang', lang);
    document.documentElement.lang = lang;

    document.querySelectorAll('[data-en]').forEach(el => {
      el.textContent = el.dataset[lang] || el.dataset.en;
    });

    const btn = document.getElementById('langToggle');
    if (btn) {
      btn.querySelector('.l-lang-toggle__label').textContent = lang === 'bg' ? 'EN' : 'BG';
    }

    document.querySelectorAll('.l-card').forEach(card => {
      const nameKey = `name${lang.charAt(0).toUpperCase() + lang.slice(1)}`;
      const descKey = `desc${lang.charAt(0).toUpperCase() + lang.slice(1)}`;
      const nameEl = card.querySelector('.l-card__name');
      const descEl = card.querySelector('.l-card__desc');
      if (nameEl && card.dataset[nameKey]) nameEl.textContent = card.dataset[nameKey];
      if (descEl && card.dataset[descKey]) descEl.textContent = card.dataset[descKey];
    });
  }

  /* ============================================================
     RENDER RESTAURANT CARDS
     ============================================================ */
  function renderRestaurants(restaurants) {
    const grid = document.getElementById('restaurantGrid');
    grid.innerHTML = '';

    if (!restaurants.length) {
      grid.innerHTML = '<p style="grid-column:1/-1;text-align:center;color:rgba(255,255,255,0.4);padding:60px 0">No restaurants found.</p>';
      return;
    }

    restaurants.forEach((r, index) => {
      const imgSrc = r.image ? `resources/${r.id}/${r.image}` : null;
      const isFeatured = index === 0;

      const card = document.createElement('a');
      card.className = 'l-card' + (isFeatured ? ' l-card--featured' : '');
      card.href = `${r.id}/`;
      card.dataset.nameEn = r.name.en || '';
      card.dataset.nameBg = r.name.bg || r.name.en || '';
      card.dataset.descEn = r.description.en || '';
      card.dataset.descBg = r.description.bg || r.description.en || '';
      card.setAttribute('aria-label', r.name[currentLang] || r.name.en);
      card.style.transitionDelay = `${index * 80}ms`;

      card.addEventListener('click', () => {
        window.trackEvent?.('select_content', {
          content_type: 'restaurant',
          item_id:       r.id,
          item_name:     r.name.en
        });
      });

      const nameLang = r.name[currentLang] || r.name.en;
      const descLang = r.description[currentLang] || r.description.en;

      card.innerHTML = `
        <div class="l-card__accent"></div>
        ${imgSrc
          ? `<img class="l-card__img" src="${imgSrc}" alt="${escapeHtml(r.name.en)}" loading="lazy"
               onerror="this.style.display='none'" />`
          : '<div class="l-card__img-placeholder">🍽</div>'
        }
        <div class="l-card__overlay"></div>
        <div class="l-card__body">
          <span class="l-card__tag" data-en="View menu" data-bg="Виж менюто">View menu</span>
          <h2 class="l-card__name">${escapeHtml(nameLang)}</h2>
          <p class="l-card__desc">${escapeHtml(descLang)}</p>
          <span class="l-card__cta">
            <span data-en="Explore" data-bg="Разгледай">Explore</span>
            <span class="l-card__cta-arrow">→</span>
          </span>
        </div>
      `;

      grid.appendChild(card);
    });

    applyLang(currentLang);
    observeCards();
  }

  /* ============================================================
     INTERSECTION OBSERVER — card entrance animations
     ============================================================ */
  function observeCards() {
    const cards = document.querySelectorAll('.l-card');
    if (!('IntersectionObserver' in window)) {
      cards.forEach(c => c.classList.add('visible'));
      return;
    }

    const io = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.08 });

    cards.forEach(card => io.observe(card));
  }

  /* ============================================================
     SCROLL — frosted nav
     ============================================================ */
  function initScrollNav() {
    const nav = document.getElementById('lNav');
    if (!nav) return;

    const onScroll = () => {
      nav.classList.toggle('scrolled', window.scrollY > 40);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  /* ============================================================
     UTILS
     ============================================================ */
  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* ============================================================
     FETCH & INIT
     ============================================================ */
  async function init() {
    initScrollNav();

    const spinner = document.getElementById('loadingSpinner');

    try {
      const res = await fetch('resources/restaurants.json');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const restaurants = await res.json();
      // Enrich each restaurant with live menu bin metadata if available
      // (bin_id is resolved later per-restaurant when navigating)
      if (spinner) spinner.remove();
      renderRestaurants(restaurants);
    } catch (err) {
      if (spinner) {
        spinner.innerHTML = `<p style="color:rgba(255,255,255,0.4)">Could not load restaurants.</p>`;
      }
      console.error('Failed to load restaurants.json:', err);
    }

    const langBtn = document.getElementById('langToggle');
    if (langBtn) {
      langBtn.addEventListener('click', () => {
        const newLang = currentLang === 'en' ? 'bg' : 'en';
        window.trackEvent?.('language_switch', { language: newLang, page: 'landing' });
        applyLang(newLang);
      });
    }

    applyLang(currentLang);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
