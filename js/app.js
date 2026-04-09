/* ============================================================
   app.js — Landing page logic + Analytics
   ============================================================

   EVENTS FIRED ON THIS PAGE
   ┌─────────────────────┬───────────────────────────────────────────────────┐
   │ Event               │ Key params                                        │
   ├─────────────────────┼───────────────────────────────────────────────────┤
   │ landing_view        │ language, referrer_host                           │
   │ restaurant_select   │ restaurant_id, restaurant_name, position          │
   │ cta_click           │ cta_type (hero|nav|contact_phone|contact_email)   │
   │ scroll_depth        │ percent (25|50|75|90)                             │
   │ language_change     │ from_lang, to_lang, page:"landing"                │
   │ page_exit           │ duration_sec, max_scroll_pct, page:"landing"      │
   └─────────────────────┴───────────────────────────────────────────────────┘
   Story fields (journey_id, story_step, page_kind) are added in analytics.js
   for every event. Same tab keeps one journey across landing → restaurant pages.
   ============================================================ */

(function () {
  'use strict';

  /* ── Page-level timing ───────────────────────────────────── */
  const pageStartMs    = window._sessionStartMs || Date.now();
  let   maxScrollPct   = 0;
  let   pageExitFired  = false;

  /* ── Language state ──────────────────────────────────────── */
  const DEFAULT_LANG = 'bg';
  let currentLang = localStorage.getItem('preferredLang') || DEFAULT_LANG;

  /* ============================================================
     ANALYTICS HELPERS
     ============================================================ */

  /** Fire page_exit exactly once (visibilitychange + pagehide both call this). */
  function firePageExit() {
    if (pageExitFired) return;
    pageExitFired = true;
    window.trackEvent?.('page_exit', {
      page:           'landing',
      duration_sec:   Math.round((Date.now() - pageStartMs) / 1000),
      max_scroll_pct: maxScrollPct
    });
  }

  /** Track scroll-depth milestones (25 / 50 / 75 / 90 %). */
  function initScrollDepth() {
    const milestones = [25, 50, 75, 90];
    const reached    = new Set();
    window.addEventListener('scroll', () => {
      const pct = Math.min(100, Math.round(
        (window.scrollY + window.innerHeight) /
        document.documentElement.scrollHeight * 100
      ));
      maxScrollPct = Math.max(maxScrollPct, pct);
      milestones.forEach(m => {
        if (pct >= m && !reached.has(m)) {
          reached.add(m);
          window.trackEvent?.('scroll_depth', { percent: m, page: 'landing' });
        }
      });
    }, { passive: true });
  }

  /** Bind CTA and contact links. */
  function initCTATracking() {
    /* Hero and nav "Get yours / Искам е-меню" buttons */
    document.querySelectorAll('.l-hero__cta').forEach(el => {
      el.addEventListener('click', () =>
        window.trackEvent?.('cta_click', { cta_type: 'hero', page: 'landing' }));
    });
    document.querySelectorAll('.l-nav__cta-link').forEach(el => {
      el.addEventListener('click', () =>
        window.trackEvent?.('cta_click', { cta_type: 'nav', page: 'landing' }));
    });
    document.querySelectorAll('[data-scroll-target="restaurants"]').forEach(el => {
      el.addEventListener('click', e => {
        e.preventDefault();
        const target = document.getElementById('restaurants');
        if (!target) return;
        const nav = document.getElementById('lNav');
        const navH = nav ? nav.offsetHeight : 0;
        const top = target.getBoundingClientRect().top + window.scrollY - navH - 10;
        window.scrollTo({ top, behavior: 'smooth' });
      });
    });

    /* Footer / CTA section contact links */
    document.querySelectorAll('[href^="tel:"]').forEach(el => {
      el.addEventListener('click', () =>
        window.trackEvent?.('cta_click', { cta_type: 'contact_phone', page: 'landing' }));
    });
    document.querySelectorAll('[href^="mailto:"]').forEach(el => {
      el.addEventListener('click', () =>
        window.trackEvent?.('cta_click', { cta_type: 'contact_email', page: 'landing' }));
    });
  }

  /* ── Restaurant card image: local path or absolute URL ───── */
  function resolveLandingImageUrl(r) {
    const raw = (r.image || '').trim();
    if (!raw) return null;
    if (/^https?:\/\//i.test(raw) || raw.startsWith('//')) return raw;
    return `resources/${r.id}/${raw}`;
  }

  /* ============================================================
     LANGUAGE
     ============================================================ */
  function applyLang(lang, isUserTriggered = false) {
    const prevLang = currentLang;
    currentLang = lang;
    localStorage.setItem('preferredLang', lang);
    document.documentElement.lang = lang;

    document.querySelectorAll('[data-en]').forEach(el => {
      el.textContent = el.dataset[lang] || el.dataset.en;
    });

    const btn = document.getElementById('langToggle');
    if (btn) {
      const label = btn.querySelector('.l-lang-toggle__label');
      if (label) label.textContent = lang === 'bg' ? 'EN' : 'BG';
    }

    document.querySelectorAll('.l-card').forEach(card => {
      const nameKey = `name${lang.charAt(0).toUpperCase() + lang.slice(1)}`;
      const descKey = `desc${lang.charAt(0).toUpperCase() + lang.slice(1)}`;
      const nameEl  = card.querySelector('.l-card__name');
      const descEl  = card.querySelector('.l-card__desc');
      if (nameEl && card.dataset[nameKey]) nameEl.textContent = card.dataset[nameKey];
      if (descEl && card.dataset[descKey]) descEl.textContent = card.dataset[descKey];
    });

    if (isUserTriggered) {
      window.trackEvent?.('language_change', {
        page:      'landing',
        from_lang: prevLang,
        to_lang:   lang
      });
    }
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
      const imgSrc = resolveLandingImageUrl(r);
      const isFeatured = index === 0;

      const card = document.createElement('a');
      card.className   = 'l-card' + (isFeatured ? ' l-card--featured' : '');
      card.href        = `${r.id}/`;
      card.dataset.nameEn = r.name.en || '';
      card.dataset.nameBg = r.name.bg || r.name.en || '';
      card.dataset.descEn = r.description.en || '';
      card.dataset.descBg = r.description.bg || r.description.en || '';
      card.setAttribute('aria-label', r.name[currentLang] || r.name.en);

      card.addEventListener('click', () => {
        try {
          sessionStorage.setItem('e_menu_last_restaurant_id_v1', String(r.id));
        } catch { /* ignore */ }
        window.trackEvent?.('restaurant_select', {
          restaurant_id:   r.id,
          restaurant_name: r.name.en,
          position:        index
        });
      });

      const nameLang = r.name[currentLang] || r.name.en;
      const descLang = r.description[currentLang] || r.description.en;

      /* Render card immediately — image injected async below */
      card.innerHTML = `
        <div class="l-card__accent"></div>
        <div class="l-card__img-placeholder"></div>
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

      /* Load image in the background; fade it in once ready */
      if (imgSrc) {
        const img    = new Image();
        img.className = 'l-card__img';
        img.alt       = escapeHtml(r.name.en);
        img.onload    = () => {
          const placeholder = card.querySelector('.l-card__img-placeholder');
          if (placeholder) placeholder.replaceWith(img);
        };
        img.onerror   = () => { /* keep skeleton */ };
        img.src        = imgSrc;
      }
    });

    applyLang(currentLang);
  }

  /** Show all landing reveal targets immediately (no scroll-based hiding). */
  function revealLandingStaticSections() {
    document.querySelectorAll('.l-feature-card, .l-step, .l-cta-block__inner').forEach(el => {
      el.classList.add('visible');
    });
  }

  /* ============================================================
     SCROLL — frosted nav
     ============================================================ */
  function initScrollNav() {
    const nav = document.getElementById('lNav');
    if (!nav) return;
    const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > 40);
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
  /** Fetch timeout so a hung network request cannot block the whole page. */
  const RESTAURANTS_FETCH_MS = 12000;

  async function fetchRestaurantsJson() {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), RESTAURANTS_FETCH_MS);
    try {
      const res = await fetch('resources/restaurants.json', {
        signal: controller.signal,
        cache: 'default'
      });
      clearTimeout(tid);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      clearTimeout(tid);
      throw e;
    }
  }

  async function init() {
    initScrollNav();
    initScrollDepth();
    initCTATracking();

    /* Exit tracking — visibilitychange is reliable on mobile too */
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') firePageExit();
    });
    window.addEventListener('pagehide', firePageExit);

    /* Language toggle */
    const langBtn = document.getElementById('langToggle');
    if (langBtn) {
      langBtn.addEventListener('click', () => {
        const newLang = currentLang === 'en' ? 'bg' : 'en';
        applyLang(newLang, true);
      });
    }

    applyLang(currentLang);

    revealLandingStaticSections();

    const grid = document.getElementById('restaurantGrid');

    try {
      const data = await fetchRestaurantsJson();
      const restaurants = data.restaurants || (Array.isArray(data) ? data : []);
      renderRestaurants(restaurants);
      if (grid) grid.removeAttribute('aria-busy');
    } catch (err) {
      if (grid) {
        grid.innerHTML =
          '<p style="grid-column:1/-1;text-align:center;color:rgba(255,255,255,0.45);padding:48px 16px">Could not load restaurants.</p>';
        grid.removeAttribute('aria-busy');
      }
      console.error('Failed to load restaurants.json:', err);
    }

    queueMicrotask(() => {
      let referrerHost = 'direct';
      try {
        if (document.referrer) referrerHost = new URL(document.referrer).hostname;
      } catch (_) {}
      window.trackEvent?.('landing_view', {
        language:      currentLang,
        referrer_host: referrerHost
      });
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
