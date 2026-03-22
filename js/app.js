/* ============================================================
   app.js — Landing page logic
   ============================================================ */

(function () {
  'use strict';

  const DEFAULT_LANG = 'en';
  let currentLang = localStorage.getItem('preferredLang') || DEFAULT_LANG;

  /* ---------- Language ---------- */
  function applyLang(lang) {
    currentLang = lang;
    localStorage.setItem('preferredLang', lang);
    document.documentElement.lang = lang;

    document.querySelectorAll('[data-en]').forEach(el => {
      el.textContent = el.dataset[lang] || el.dataset.en;
    });

    const btn = document.getElementById('langToggle');
    if (btn) {
      btn.querySelector('.lang-toggle__label').textContent = lang === 'en' ? 'BG' : 'EN';
      btn.title = lang === 'en' ? 'Switch to Bulgarian' : 'Switch to English';
    }

    document.querySelectorAll('.restaurant-card').forEach(card => {
      const name = card.dataset[`name${lang.charAt(0).toUpperCase() + lang.slice(1)}`];
      const desc = card.dataset[`desc${lang.charAt(0).toUpperCase() + lang.slice(1)}`];
      if (name) card.querySelector('.restaurant-card__name').textContent = name;
      if (desc) card.querySelector('.restaurant-card__desc').textContent = desc;
    });
  }

  /* ---------- Render restaurants ---------- */
  function renderRestaurants(restaurants) {
    const grid = document.getElementById('restaurantGrid');
    grid.innerHTML = '';

    if (!restaurants.length) {
      grid.innerHTML = '<p style="grid-column:1/-1;text-align:center;color:var(--color-text-muted)">No restaurants found.</p>';
      return;
    }

    restaurants.forEach(r => {
      const imgSrc = r.image ? `resources/${r.id}/${r.image}` : null;

      const card = document.createElement('a');
      card.className = 'restaurant-card';
      card.href = `${r.id}/`;
      card.dataset.nameEn = r.name.en || '';
      card.dataset.nameBg = r.name.bg || r.name.en || '';
      card.dataset.descEn = r.description.en || '';
      card.dataset.descBg = r.description.bg || r.description.en || '';
      card.setAttribute('aria-label', r.name[currentLang] || r.name.en);

      card.innerHTML = `
        <div class="restaurant-card__img-wrap">
          ${imgSrc
            ? `<img src="${imgSrc}" alt="${r.name.en}" loading="lazy" onerror="this.parentElement.innerHTML='<div class=\\"restaurant-card__img-placeholder\\">🍽</div>'" />`
            : '<div class="restaurant-card__img-placeholder">🍽</div>'
          }
        </div>
        <div class="restaurant-card__body">
          <h2 class="restaurant-card__name">${r.name[currentLang] || r.name.en}</h2>
          <p class="restaurant-card__desc">${r.description[currentLang] || r.description.en}</p>
          <span class="restaurant-card__cta" data-en="View menu" data-bg="Виж менюто">View menu</span>
        </div>
      `;
      grid.appendChild(card);
    });

    applyLang(currentLang);
  }

  /* ---------- Fetch & init ---------- */
  async function init() {
    const spinner = document.getElementById('loadingSpinner');

    try {
      const res = await fetch('resources/restaurants.json');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const restaurants = await res.json();
      if (spinner) spinner.remove();
      renderRestaurants(restaurants);
    } catch (err) {
      if (spinner) {
        spinner.innerHTML = `<p style="color:var(--color-text-muted)">Could not load restaurants.</p>`;
      }
      console.error('Failed to load restaurants.json:', err);
    }

    const langBtn = document.getElementById('langToggle');
    if (langBtn) {
      langBtn.addEventListener('click', () => {
        applyLang(currentLang === 'en' ? 'bg' : 'en');
      });
    }

    applyLang(currentLang);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
