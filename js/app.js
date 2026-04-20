/* ============================================================
   app.js — Landing page logic + Analytics
   ============================================================

   EVENTS FIRED ON THIS PAGE
   ┌─────────────────────┬───────────────────────────────────────────────────┐
   │ Event               │ Key params                                        │
   ├─────────────────────┼───────────────────────────────────────────────────┤
   │ landing_view        │ language, referrer_host                           │
   │ restaurant_select   │ restaurant_id, restaurant_name, position          │
   │ cta_click           │ cta_type (hero|contact_phone|contact_whatsapp|contact_email) │
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
  const COOKIE_NOTICE_KEY = 'emenuCookieNoticeV1';
  const forcedLandingLocale =
    window.__LANDING_LOCALE__ === 'en' || window.__LANDING_LOCALE__ === 'bg'
      ? window.__LANDING_LOCALE__
      : null;
  let currentLang =
    forcedLandingLocale || localStorage.getItem('preferredLang') || DEFAULT_LANG;

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
    /* Hero CTAs (menus + Get yours) */
    document.querySelectorAll('.l-hero__cta').forEach(el => {
      el.addEventListener('click', () =>
        window.trackEvent?.('cta_click', { cta_type: 'hero', page: 'landing' }));
    });
    document.querySelectorAll('[data-scroll-target]').forEach(el => {
      el.addEventListener('click', e => {
        e.preventDefault();
        const id = el.getAttribute('data-scroll-target');
        if (!id) return;
        if (el.classList.contains('l-nav__icon-btn')) {
          window.trackEvent?.('cta_click', { cta_type: 'nav_compact', page: 'landing' });
        }
        const target = document.getElementById(id);
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
    document.querySelectorAll('a.js-wa-contact').forEach(el => {
      el.addEventListener('click', () =>
        window.trackEvent?.('cta_click', { cta_type: 'contact_whatsapp', page: 'landing' }));
    });
  }

  /** Append ?text= to wa.me links from data-msg-* (language-aware). */
  function applyWhatsappPrefill() {
    document.querySelectorAll('a.js-wa-contact').forEach(a => {
      const base = (a.getAttribute('data-wa-base') || '').trim() || (a.href.split('?')[0] || '').trim();
      if (!base.startsWith('http')) return;
      const msg = currentLang === 'bg' ? (a.dataset.msgBg || '') : (a.dataset.msgEn || '');
      const sep = base.includes('?') ? '&' : '?';
      a.href = msg ? `${base}${sep}text=${encodeURIComponent(msg)}` : base;
    });
  }

  /* ── Restaurant card image: local path or absolute URL ───── */
  function resolveLandingImageUrl(r) {
    const raw = (r.image || '').trim();
    if (!raw) return null;
    if (/^https?:\/\//i.test(raw) || raw.startsWith('//')) return raw;
    return `resources/${r.id}/${raw}`;
  }

  /** Guest reserve page — relative to current locale segment when present. */
  function landingReserveUrl(restaurantId) {
    const q = 'r=' + encodeURIComponent(restaurantId);
    const path = window.location.pathname;
    if (path.startsWith('/en/') || path.startsWith('/bg/') || path === '/en' || path === '/bg') {
      return '../reserve/?' + q;
    }
    return 'reserve/?' + q;
  }

  function collapseLandingSplit(except) {
    document.querySelectorAll('#restaurantGrid .l-card--expanded').forEach(c => {
      if (!except || c !== except) {
        c.classList.remove('l-card--expanded');
        c.setAttribute('aria-expanded', 'false');
      }
    });
  }

  function bindLandingCardSplit(card, r, index) {
    const menuHref = `${r.id}/`;
    const reserveHref = landingReserveUrl(r.id);
    const menuA = card.querySelector('.l-card__split-action--menu');
    const resA = card.querySelector('.l-card__split-action--reserve');
    if (menuA) menuA.setAttribute('href', menuHref);
    if (resA) resA.setAttribute('href', reserveHref);

    function navPrep() {
      try {
        sessionStorage.setItem('e_menu_last_restaurant_id_v1', String(r.id));
      } catch (e) { /* ignore */ }
    }

    if (menuA) {
      menuA.addEventListener('click', () => {
        navPrep();
        window.trackEvent?.('restaurant_select', {
          restaurant_id: r.id,
          restaurant_name: r.name && r.name.en,
          position: index,
          destination: 'menu'
        });
      });
    }
    if (resA) {
      resA.addEventListener('click', () => {
        navPrep();
        window.trackEvent?.('restaurant_select', {
          restaurant_id: r.id,
          restaurant_name: r.name && r.name.en,
          position: index,
          destination: 'reserve'
        });
      });
    }

    card.addEventListener('click', e => {
      if (e.target.closest('.l-card__split-action')) return;
      if (card.classList.contains('l-card--expanded')) {
        collapseLandingSplit(null);
        return;
      }
      collapseLandingSplit(card);
      card.classList.add('l-card--expanded');
      card.setAttribute('aria-expanded', 'true');
    });

    card.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        if (e.target.closest('.l-card__split-action')) return;
        e.preventDefault();
        card.click();
      }
      if (e.key === 'Escape') {
        if (card.classList.contains('l-card--expanded')) {
          e.preventDefault();
          collapseLandingSplit(null);
        }
      }
    });
  }

  document.addEventListener('click', e => {
    const ex = e.target.closest('#restaurantGrid .l-card--expanded');
    if (ex) return;
    if (e.target.closest('#restaurantGrid .l-card')) return;
    collapseLandingSplit(null);
  });

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

    document.querySelectorAll('[data-placeholder-en]').forEach(el => {
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
        el.placeholder =
          lang === 'bg'
            ? (el.dataset.placeholderBg || el.dataset.placeholderEn || '')
            : (el.dataset.placeholderEn || el.dataset.placeholderBg || '');
      }
    });

    document.querySelectorAll('[data-aria-en]').forEach(el => {
      if (el.hasAttribute('aria-label')) {
        el.setAttribute(
          'aria-label',
          lang === 'bg'
            ? (el.dataset.ariaBg || el.dataset.ariaEn || '')
            : (el.dataset.ariaEn || el.dataset.ariaBg || '')
        );
      }
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

    applyWhatsappPrefill();
    refreshCatalogMeta();
    _carouselBuildDots();
  }

  function normalizeSearchText(s) {
    return String(s || '')
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  function restaurantSearchBlob(r) {
    const parts = [
      r.id,
      r.name && r.name.en,
      r.name && r.name.bg,
      r.description && r.description.en,
      r.description && r.description.bg
    ];
    return normalizeSearchText(parts.filter(Boolean).join(' '));
  }

  /* ── Carousel state ─────────────────────────────────────── */
  let _carouselPage = 0;

  function _carouselMetrics() {
    const track = document.getElementById('restaurantGrid');
    if (!track) return { cardsPerPage: 1, totalPages: 0, cardW: 0, visibleCards: [] };
    const visibleCards = Array.from(
      track.querySelectorAll('.l-card:not(.is-catalog-hidden)')
    );
    if (!visibleCards.length) return { cardsPerPage: 1, totalPages: 0, cardW: 0, visibleCards };
    const gap = 12;
    const cardW = visibleCards[0].getBoundingClientRect().width || 1;
    const trackW = track.clientWidth;
    const cardsPerPage = Math.max(1, Math.floor((trackW + gap) / (cardW + gap)));
    const totalPages = Math.ceil(visibleCards.length / cardsPerPage);
    return { cardsPerPage, totalPages, cardW, visibleCards };
  }

  function _carouselBuildDots() {
    const dots = document.getElementById('catalogDots');
    const prev = document.getElementById('catalogPrev');
    const next = document.getElementById('catalogNext');
    if (!dots) return;
    const { totalPages } = _carouselMetrics();
    dots.innerHTML = '';
    for (let i = 0; i < totalPages; i++) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'l-catalog__dot' + (i === _carouselPage ? ' is-active' : '');
      btn.setAttribute('role', 'listitem');
      const lblKey = currentLang === 'bg' ? `Страница ${i + 1}` : `Page ${i + 1}`;
      btn.setAttribute('aria-label', lblKey);
      btn.addEventListener('click', () => _carouselGoTo(i));
      dots.appendChild(btn);
    }
    if (prev) prev.disabled = _carouselPage <= 0;
    if (next) next.disabled = _carouselPage >= totalPages - 1;
  }

  function _carouselGoTo(page) {
    const { cardsPerPage, totalPages, cardW, visibleCards } = _carouselMetrics();
    if (!visibleCards.length) return;
    _carouselPage = Math.max(0, Math.min(page, totalPages - 1));
    const idx = _carouselPage * cardsPerPage;
    if (visibleCards[idx]) {
      const track = document.getElementById('restaurantGrid');
      const trackScrollPaddingLeft = 20;
      const gap = 12;
      const offsetLeft = idx * (cardW + gap);
      if (track) {
        track.scrollTo({ left: offsetLeft, behavior: 'smooth' });
      }
    }
    _carouselBuildDots();
  }

  function _carouselSyncFromScroll() {
    const { cardsPerPage, totalPages, cardW } = _carouselMetrics();
    if (!cardW) return;
    const track = document.getElementById('restaurantGrid');
    if (!track) return;
    const gap = 12;
    const page = Math.round(track.scrollLeft / ((cardW + gap) * cardsPerPage));
    const clamped = Math.max(0, Math.min(page, totalPages - 1));
    if (clamped !== _carouselPage) {
      _carouselPage = clamped;
      _carouselBuildDots();
    }
  }

  function initCarousel() {
    const track = document.getElementById('restaurantGrid');
    const prev  = document.getElementById('catalogPrev');
    const next  = document.getElementById('catalogNext');
    if (!track) return;

    let scrollTimer;
    track.addEventListener('scroll', () => {
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(_carouselSyncFromScroll, 80);
    }, { passive: true });

    prev?.addEventListener('click', () => _carouselGoTo(_carouselPage - 1));
    next?.addEventListener('click', () => _carouselGoTo(_carouselPage + 1));

    /* Rebuild dots on resize (card sizes change at breakpoints) */
    const ro = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => {
          _carouselPage = 0;
          _carouselBuildDots();
        })
      : null;
    if (ro) ro.observe(track);
  }

  function refreshCatalogMeta() {
    const meta = document.getElementById('restaurantCatalogMeta');
    const track = document.getElementById('restaurantGrid');
    if (!meta || !track) return;
    const cards = track.querySelectorAll('.l-card');
    if (!cards.length) { meta.textContent = ''; return; }
    let visible = 0;
    cards.forEach(c => { if (!c.classList.contains('is-catalog-hidden')) visible++; });
    const total = cards.length;
    if (currentLang === 'bg') {
      meta.textContent = visible === total
        ? `${total} заведения`
        : `${visible} от ${total}`;
    } else {
      meta.textContent = visible === total
        ? `${total} venues`
        : `${visible} of ${total}`;
    }
  }

  function applyCatalogFilter(rawQuery) {
    const track = document.getElementById('restaurantGrid');
    const empty = document.getElementById('restaurantCatalogEmpty');
    if (!track) return;
    const needle = normalizeSearchText(rawQuery.trim());
    const cards = track.querySelectorAll('.l-card');
    let visible = 0;
    cards.forEach(card => {
      const match = !needle || (card.dataset.searchBlob || '').includes(needle);
      card.classList.toggle('is-catalog-hidden', !match);
      if (match) visible++;
    });
    if (empty) empty.hidden = visible > 0 || cards.length === 0;
    /* Reset carousel to page 0 when filter changes */
    _carouselPage = 0;
    track.scrollLeft = 0;
    _carouselBuildDots();
    refreshCatalogMeta();
  }

  let catalogFilterTimer;

  function initCatalogSearch() {
    const input = document.getElementById('restaurantCatalogSearch');
    if (!input) return;
    input.addEventListener('input', () => {
      clearTimeout(catalogFilterTimer);
      catalogFilterTimer = setTimeout(() => applyCatalogFilter(input.value), 140);
    });
    input.addEventListener('keydown', e => {
      if (e.key === 'Escape') { input.value = ''; applyCatalogFilter(''); }
    });
  }

  function initHeroNavMerge() {
    const ctas = document.getElementById('heroCtas');
    const nav = document.getElementById('lNav');
    if (!ctas || !nav || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      ([entry]) => {
        const merged =
          !entry.isIntersecting || entry.intersectionRatio < 0.12;
        nav.classList.toggle('l-nav--show-cta-icons', merged);
        ctas.classList.toggle('l-hero__ctas--merged', merged);
      },
      {
        root: null,
        rootMargin: '-48px 0px 0px 0px',
        threshold: [0, 0.08, 0.12, 0.2, 0.35, 0.55, 1]
      }
    );
    io.observe(ctas);
  }

  /* ============================================================
     RENDER RESTAURANT CARDS
     ============================================================ */
  function renderRestaurants(restaurants) {
    const grid = document.getElementById('restaurantGrid');
    grid.innerHTML = '';

    if (!restaurants.length) {
      const p = document.createElement('p');
      p.className = 'l-catalog__empty';
      p.style.padding = '40px 16px';
      p.textContent =
        currentLang === 'bg' ? 'Няма налични заведения.' : 'No restaurants found.';
      grid.appendChild(p);
      refreshCatalogMeta();
      return;
    }

    restaurants.forEach((r, index) => {
      const imgSrc = resolveLandingImageUrl(r);

      const card = document.createElement('article');
      card.className = 'l-card';
      card.tabIndex = 0;
      card.dataset.nameEn = r.name.en || '';
      card.dataset.nameBg = r.name.bg || r.name.en || '';
      card.dataset.descEn = r.description.en || '';
      card.dataset.descBg = r.description.bg || r.description.en || '';
      card.dataset.searchBlob = restaurantSearchBlob(r);
      card.setAttribute('aria-label', r.name[currentLang] || r.name.en);
      card.setAttribute('aria-expanded', 'false');

      const nameLang = r.name[currentLang] || r.name.en;
      const descLang = r.description[currentLang] || r.description.en;

      /* Render card immediately — image injected async below */
      card.innerHTML = `
        <div class="l-card__accent"></div>
        <div class="l-card__img-placeholder"></div>
        <div class="l-card__overlay"></div>
        <div class="l-card__body">
          <span class="l-card__tag" data-en="Tap to choose" data-bg="Избери">Tap to choose</span>
          <h2 class="l-card__name">${escapeHtml(nameLang)}</h2>
          <p class="l-card__desc">${escapeHtml(descLang)}</p>
          <span class="l-card__cta">
            <span data-en="Menu or reserve" data-bg="Меню или резервация">Menu or reserve</span>
            <span class="l-card__cta-arrow">→</span>
          </span>
        </div>
        <div class="l-card__split" aria-hidden="true">
          <div class="l-card__split-inner">
            <a class="l-card__split-action l-card__split-action--menu" href="#">
              <span class="l-card__split-kicker" data-en="Open" data-bg="Отвори">Open</span>
              <span class="l-card__split-title" data-en="Menu" data-bg="Меню">Menu</span>
            </a>
            <a class="l-card__split-action l-card__split-action--reserve" href="#">
              <span class="l-card__split-kicker" data-en="Book" data-bg="Запази">Book</span>
              <span class="l-card__split-title" data-en="Reservations" data-bg="Резервации">Reservations</span>
            </a>
          </div>
        </div>
      `;

      bindLandingCardSplit(card, r, index);

      grid.appendChild(card);

      /* Load image in the background; fade it in once ready */
      if (imgSrc) {
        const img    = new Image();
        img.className = 'l-card__img';
        const altBits = [r.name && r.name.en, r.name && r.name.bg]
          .map(x => String(x || '').trim())
          .filter(Boolean);
        img.alt = escapeHtml([...new Set(altBits)].join(' · '));
        img.onload    = () => {
          const placeholder = card.querySelector('.l-card__img-placeholder');
          if (placeholder) placeholder.replaceWith(img);
        };
        img.onerror   = () => { /* keep skeleton */ };
        img.src        = imgSrc;
      }
    });

    applyLang(currentLang);
    /* Reset carousel, apply any live search query, rebuild dots */
    _carouselPage = 0;
    const searchInput = document.getElementById('restaurantCatalogSearch');
    applyCatalogFilter(searchInput ? searchInput.value : '');
    /* Wait one frame so card layout is painted before measuring */
    requestAnimationFrame(() => {
      requestAnimationFrame(_carouselBuildDots);
    });
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

  function initCookieNotice() {
    const bar = document.getElementById('cookieNotice');
    const okBtn = document.getElementById('cookieNoticeOk');
    if (!bar || !okBtn) return;
    try {
      if (localStorage.getItem(COOKIE_NOTICE_KEY) === '1') {
        bar.remove();
        return;
      }
    } catch (_) { /* ignore */ }
    okBtn.addEventListener('click', () => {
      try {
        localStorage.setItem(COOKIE_NOTICE_KEY, '1');
      } catch (_) { /* ignore */ }
      bar.remove();
    });
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
    if (forcedLandingLocale) {
      try {
        localStorage.setItem('preferredLang', forcedLandingLocale);
      } catch (_) { /* ignore */ }
    }
    initCookieNotice();
    initScrollNav();
    initHeroNavMerge();
    initCatalogSearch();
    initCarousel();
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
        if (document.body.classList.contains('landing-page')) {
          const u = new URL(window.location.href);
          u.pathname = `/${newLang}/`;
          window.location.href = u.href;
          return;
        }
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
