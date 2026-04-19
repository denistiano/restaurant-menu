/* ============================================================
   admin.js — Menu Admin Panel
   ============================================================ */

(function () {
  'use strict';

  /* ── CONFIG ─────────────────────────────────────────────── */
  const SESSION_TOKEN_KEY = 'menu_admin_jwt';
  /** Super-admin JWT mirror for cross-tab tools (e.g. m/logs.html) — cleared on sign-out. */
  const SUPER_JWT_MIRROR_KEY = 'menu_admin_jwt_super_mirror';
  const ADMIN_LANG_KEY    = 'preferredLang';
  let adminLang           = localStorage.getItem(ADMIN_LANG_KEY) || 'bg';

  const DEFAULT_LOCAL_MENU_API = 'http://127.0.0.1:8080';

  /** Same rules as restaurant.js: meta / __MENU_API_BASE__, else localhost → default API origin. */
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
  function getAuthToken() {
    return sessionStorage.getItem(SESSION_TOKEN_KEY) || '';
  }
  function setAuthToken(token) {
    if (token) sessionStorage.setItem(SESSION_TOKEN_KEY, token);
  }
  function clearAuthToken() {
    try { sessionStorage.removeItem(SESSION_TOKEN_KEY); } catch (_) {}
    try { localStorage.removeItem(SUPER_JWT_MIRROR_KEY); } catch (_) {}
  }
  function authJsonHeaders() {
    const h = { 'Content-Type': 'application/json' };
    const t = getAuthToken();
    if (t) h['Authorization'] = 'Bearer ' + t;
    return h;
  }

  const I18N = {
    en: {
      backToSite: '← Back to site',
      signInTitle: 'Sign in',
      authSub:
        'Use your server username and password. Venues linked to your account appear only after you sign in.',
      signIn: 'Sign in',
      chooseWorkspaceHint: 'Open a workspace below — names match your published menu titles.',
      superOnlyHint: 'No venues are linked to this account. You can still open Operations to manage users.',
      operationsLink: 'Operations',
      logsDashboardLink: 'Telemetry logs',
      signOut: 'Sign out',
      openEditor: 'Open editor',
      incorrectPassword: 'Incorrect admin password',
      editorRestaurantTab: 'Restaurant',
      editorSettingsTab: 'Settings',
      editorMenuTab: 'Menu',
      editorQrTab: 'QR media',
      preview: 'Preview ↗',
      save: 'Save',
      unsaved: 'Unsaved',
      cfgDisplayTitle: 'Display options',
      cfgDisplayDesc: 'Control which fields are shown on the public menu.',
      cfgCurrencyTitle: 'Currency',
      cfgCurrencyDesc: 'Choose which currency your menu prices are entered in, then choose the currencies guests should see and their display order.',
      cfgTimeTitle: 'Time & Scheduling',
      cfgTimeDesc: 'Required for timed sections (e.g. lunch menu 12:00–14:00) to activate at the correct local time.',
      main: 'Main',
      display: 'Display',
      addCurrencies: 'Add currencies',
      categoriesToolbarHint: 'Drag ↕ to reorder. Click a category to expand.',
      itemsSectionTitle: 'Menu items',
      itemsSectionHint: 'Drag ⠿ on a row to reorder items.',
      addCategory: '+ Add category',
      cloudinaryUploads: 'Images (server upload)',
      mainBadge: 'MAIN',
      nameEnglish: 'Name (English)',
      nameBulgarian: 'Name (Bulgarian)',
      descEnglish: 'Description (English)',
      descBulgarian: 'Description (Bulgarian)',
      itemNamePh: 'Item name',
      itemBgNamePh: 'Наименование',
      itemDescPh: 'Short description...',
      itemBgDescPh: 'Кратко описание...',
      categoryEnglish: 'English name',
      categoryBulgarian: 'Bulgarian name',
      categoryEnPh: 'Category name',
      categoryBgPh: 'Категория',
      quantity: 'Quantity',
      unit: 'Unit',
      quantityPh: 'e.g. 250',
      selectTag: 'Select tag…',
      selectIngredient: 'Select ingredient…',
      selectAllergen: 'Select allergen…'
    },
    bg: {
      backToSite: '← Назад към сайта',
      signInTitle: 'Вход',
      authSub:
        'Потребителско име и парола от сървъра. Обектите, към които имаш достъп, се показват едва след вход.',
      signIn: 'Вход',
      chooseWorkspaceHint:
        'Избери обект по-долу — имената са от публикуваното меню (EN/BG според езика на панела).',
      superOnlyHint:
        'Няма свързани обекти. Можеш да отвориш Operations за управление на потребители.',
      operationsLink: 'Операции',
      logsDashboardLink: 'Телеметрия (логове)',
      signOut: 'Изход',
      openEditor: 'Отвори редактора',
      incorrectPassword: 'Невалидна админ парола',
      editorRestaurantTab: 'Ресторант',
      editorSettingsTab: 'Настройки',
      editorMenuTab: 'Меню',
      editorQrTab: 'QR медия',
      preview: 'Преглед ↗',
      save: 'Запази',
      unsaved: 'Незаписано',
      cfgDisplayTitle: 'Опции за показване',
      cfgDisplayDesc: 'Управлявай кои полета се показват в публичното меню.',
      cfgCurrencyTitle: 'Валута',
      cfgCurrencyDesc: 'Избери основната валута за въвеждане на цени и кои валути да виждат гостите.',
      cfgTimeTitle: 'Време и графици',
      cfgTimeDesc: 'Нужно за времеви секции (напр. обедно меню 12:00–14:00) да се активират коректно.',
      main: 'Основна',
      display: 'Показване',
      addCurrencies: 'Добави валути',
      categoriesToolbarHint: 'Плъзни ↕ за подредба. Кликни категория за разгъване.',
      itemsSectionTitle: 'Продукти',
      itemsSectionHint: 'Плъзни ⠿ до реда за подредба на продуктите.',
      addCategory: '+ Добави категория',
      cloudinaryUploads: 'Изображения (качване към сървъра)',
      mainBadge: 'ОСНОВНА',
      nameEnglish: 'Име (Английски)',
      nameBulgarian: 'Име (Български)',
      descEnglish: 'Описание (Английски)',
      descBulgarian: 'Описание (Български)',
      itemNamePh: 'Име на продукт',
      itemBgNamePh: 'Наименование',
      itemDescPh: 'Кратко описание...',
      itemBgDescPh: 'Кратко описание...',
      categoryEnglish: 'Име на английски',
      categoryBulgarian: 'Име на български',
      categoryEnPh: 'Категория',
      categoryBgPh: 'Категория',
      quantity: 'Количество',
      unit: 'Мярка',
      quantityPh: 'напр. 250',
      selectTag: 'Избери таг…',
      selectIngredient: 'Избери съставка…',
      selectAllergen: 'Избери алерген…'
    }
  };
  const tr = (k) => (I18N[adminLang] && I18N[adminLang][k]) || I18N.en[k] || k;
  const isBgFirst = () => adminLang === 'bg';

  const DEFAULT_CURRENCY_SUPPORT = [
    { code: 'EUR', label: 'Euro (€)', symbol: '€' },
    { code: 'BGN', label: 'Bulgarian lev (лв)', symbol: 'лв' }
  ];

  function getCurrencySupport(restaurantEntry) {
    const supported = restaurantEntry?.currencies_supported;
    if (Array.isArray(supported) && supported.length) {
      return supported
        .map(x => ({
          code: String(x.code || '').toUpperCase(),
          label: String(x.label || x.code || '').trim(),
          symbol: String(x.symbol || '').trim()
        }))
        .filter(x => x.code);
    }
    const ref = String(restaurantEntry?.currency_reference || 'EUR').toUpperCase();
    const rates = restaurantEntry?.currency_rates || {};
    const codes = new Set([ref, ...Object.keys(rates).map(c => String(c).toUpperCase())]);
    const out = [];
    for (const code of codes) {
      const def = DEFAULT_CURRENCY_SUPPORT.find(c => c.code === code);
      out.push(def || { code, label: code, symbol: code });
    }
    return out;
  }

  function currencyMeta(code, restaurantEntry) {
    const support = getCurrencySupport(restaurantEntry);
    return support.find(c => c.code === code) || { code, label: code, symbol: code };
  }

  /* ── IMAGE UPLOAD (backend → Cloudinary) ───────────────── */
  const CLD_MAX_BYTES = 5 * 1024 * 1024; // 5 MB

  /**
   * Upload image via backend (Bearer JWT). Server signs Cloudinary request.
   */
  async function uploadImageToServer(file, folder, onProgress) {
    if (!getAuthToken()) {
      throw new Error('Not signed in. Open the editor again from the login screen.');
    }
    if (file.size > CLD_MAX_BYTES) {
      throw new Error(`Image too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum is 5 MB.`);
    }
    if (!file.type.startsWith('image/')) {
      throw new Error('Only image files (JPEG, PNG, WebP, GIF…) are allowed.');
    }
    const base = getMenuApiBase();
    if (!base) {
      throw new Error('Menu API base not set. Add <meta name="menu-api-base" content="http://127.0.0.1:8080"> or window.__MENU_API_BASE__.');
    }
    const fd = new FormData();
    fd.append('file', file);
    fd.append('folder', folder);
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${base}/api/admin/upload/image`);
      xhr.setRequestHeader('Authorization', 'Bearer ' + getAuthToken());
      if (onProgress) {
        xhr.upload.addEventListener('progress', e => {
          if (e.lengthComputable) onProgress(Math.round(e.loaded / e.total * 100));
        });
      }
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const j = JSON.parse(xhr.responseText);
            if (j.secureUrl) {
              resolve(j.secureUrl);
              return;
            }
          } catch (_) {}
          reject(new Error('Upload succeeded but response was unexpected.'));
        } else {
          let msg = `HTTP ${xhr.status}`;
          try {
            const j = JSON.parse(xhr.responseText);
            if (j.message) msg = j.message;
            if (j.error) msg = typeof j.error === 'string' ? j.error : msg;
          } catch (_) {}
          reject(new Error(msg));
        }
      };
      xhr.onerror = () => reject(new Error('Network error during upload.'));
      xhr.onabort = () => reject(new Error('Upload cancelled.'));
      xhr.send(fd);
    });
  }

  /**
   * Open a file picker, validate, upload to Cloudinary, then insert the resulting
   * URL into `targetInput` and refresh `previewEl`.
   */
  function triggerImageUpload(targetInput, previewEl, folder) {
    const fileInput = document.createElement('input');
    fileInput.type   = 'file';
    fileInput.accept = 'image/*';
    fileInput.style.display = 'none';
    document.body.appendChild(fileInput);

    fileInput.addEventListener('change', async () => {
      const file = fileInput.files[0];
      document.body.removeChild(fileInput);
      if (!file) return;

      // Warn if over 2 MB but under 5 MB
      if (file.size > 2 * 1024 * 1024 && file.size <= CLD_MAX_BYTES) {
        showToast(`Large image (${(file.size / 1024 / 1024).toFixed(1)} MB) — uploading…`, 'info');
      }

      previewEl.innerHTML = `
        <div class="upload-progress">
          <div class="upload-progress__bar" style="width:0%"></div>
          <span class="upload-progress__label">Uploading 0%</span>
        </div>`;

      try {
        const url = await uploadImageToServer(file, folder, pct => {
          const bar   = previewEl.querySelector('.upload-progress__bar');
          const label = previewEl.querySelector('.upload-progress__label');
          if (bar)   bar.style.width     = pct + '%';
          if (label) label.textContent   = `Uploading ${pct}%`;
        });

        targetInput.value = url;
        targetInput.dispatchEvent(new Event('input'));   // triggers preview & dirty
        showToast('Image uploaded!', 'success');
        adminTrack('admin_cloudinary_upload_ok', { folder: String(folder).slice(0, 60) });
      } catch (err) {
        previewEl.innerHTML = `<span class="url-preview-err">${esc(err.message)}</span>`;
        showToast('Upload failed: ' + err.message, 'error');
        adminTrack('admin_cloudinary_upload_fail', { message: err.message || 'error' });
      }
    });

    fileInput.click();
  }

  /** Insert Cloudinary delivery-side transformations into a URL for preview/display. */
  function cldOptimize(url, width) {
    if (!url || !url.includes('res.cloudinary.com')) return url;
    return url.replace('/upload/', `/upload/w_${width},c_limit,q_auto,f_auto/`);
  }

  /* ── STATE ──────────────────────────────────────────────── */
  let quantityMetrics = [];       // from restaurants.json (loaded only after sign-in)
  let currentRestaurant = null;   // minimal { id } then full from API menu payload
  let sessionSuperAdmin = false;
  let scopedRestaurantIds = [];
  /** Map restaurantId → { restaurantId, nameEn, nameBg } from login /api/auth/me */
  let scopedRestaurantSummaries = new Map();
  let activeWorkspaceId = null;
  let menuData        = null;     // the full { restaurant: {...} } object
  let isDirty         = false;
  let editorSessionStart = 0;

  /** Firebase / GA4 — all admin events include restaurant_id when in editor. */
  function adminTrack(name, params = {}) {
    const rid = (currentRestaurant && currentRestaurant.id) ? String(currentRestaurant.id).slice(0, 40) : '';
    const merged = { restaurant_id: rid, ...params };
    for (const k of Object.keys(merged)) {
      if (merged[k] === undefined) delete merged[k];
      const v = merged[k];
      if (typeof v === 'string' && v.length > 100) merged[k] = v.slice(0, 100);
    }
    if (typeof window.trackEvent === 'function') window.trackEvent(name, merged);
  }

  let adminEditDebounce = null;

  /* ── DOM REFS ───────────────────────────────────────────── */
  const usernameInput  = document.getElementById('usernameInput');
  const sharedPasswordInput  = document.getElementById('sharedPasswordInput');
  const sharedPasswordToggle = document.getElementById('sharedPasswordToggle');
  const authScreen   = document.getElementById('authScreen');
  const editorScreen = document.getElementById('editorScreen');
  const authGrid     = document.getElementById('authGrid');
  const authCredentialsBlock = document.getElementById('authCredentialsBlock');
  const postAuthPanel = document.getElementById('postAuthPanel');
  const postAuthHint = document.getElementById('postAuthHint');
  const superOnlyHint = document.getElementById('superOnlyHint');
  const venueTabStrip = document.getElementById('venueTabStrip');
  const superOpsLink = document.getElementById('superOpsLink');
  const logsDashboardLink = document.getElementById('logsDashboardLink');
  const authSignOutBtn = document.getElementById('authSignOutBtn');
  const authSignInBtn = document.getElementById('authSignInBtn');
  const editorVenueStrip = document.getElementById('editorVenueStrip');
  const authErrorEl      = document.getElementById('authError');
  const editorTitle  = document.getElementById('editorTitle');
  const previewLink  = document.getElementById('previewLink');
  const saveBtn      = document.getElementById('saveBtn');
  const dirtyBadge   = document.getElementById('dirtyBadge');
  const categoriesList = document.getElementById('categoriesList');
  const toast        = document.getElementById('toast');
  const modalBackdrop = document.getElementById('modalBackdrop');
  const modalMsg     = document.getElementById('modalMsg');
  const modalConfirm = document.getElementById('modalConfirm');
  const modalCancel  = document.getElementById('modalCancel');
  const adminLangToggleAuth = document.getElementById('adminLangToggleAuth');
  const adminLangToggleEditor = document.getElementById('adminLangToggleEditor');

  function reorderPair(parent, firstId, secondId) {
    const first = document.getElementById(firstId);
    const second = document.getElementById(secondId);
    if (!parent || !first || !second) return;
    if (isBgFirst()) {
      parent.appendChild(second);
      parent.appendChild(first);
    } else {
      parent.appendChild(first);
      parent.appendChild(second);
    }
  }

  function applyAdminLang(lang, rerender = true) {
    adminLang = (lang === 'bg') ? 'bg' : 'en';
    localStorage.setItem(ADMIN_LANG_KEY, adminLang);
    document.documentElement.lang = adminLang;
    const next = adminLang === 'bg' ? 'EN' : 'BG';
    if (adminLangToggleAuth) adminLangToggleAuth.textContent = next;
    if (adminLangToggleEditor) adminLangToggleEditor.textContent = next;
    applyStaticTranslations();

    const nameSection = document.getElementById('infoNameEnRow')?.parentElement;
    const descSection = document.getElementById('infoDescEnRow')?.parentElement;
    reorderPair(nameSection, 'infoNameEnRow', 'infoNameBgRow');
    reorderPair(descSection, 'infoDescEnRow', 'infoDescBgRow');

    if (rerender && menuData && !editorScreen.classList.contains('hidden')) {
      renderCategories(menuData.restaurant.menu.categories);
    }
    if (rerender && scopedRestaurantIds.length > 1) {
      refreshWorkspaceTabLabels();
    }
  }

  function applyStaticTranslations() {
    const setText = (id, key) => {
      const el = document.getElementById(id);
      if (el) el.textContent = tr(key);
    };
    const authBack = document.getElementById('authBackLink');
    if (authBack) {
      const tBack = tr('backToSite');
      authBack.setAttribute('title', tBack);
      authBack.setAttribute('aria-label', tBack);
    }
    setText('authTitle', 'signInTitle');
    setText('authSub', 'authSub');
    setText('authSignInBtn', 'signIn');
    setText('authError', 'incorrectPassword');
    const logo = document.getElementById('authLogoText');
    if (logo) logo.textContent = adminLang === 'bg' ? 'Съдържание' : 'Content';
    setText('superOpsLink', 'operationsLink');
    setText('logsDashboardLink', 'logsDashboardLink');
    setText('authSignOutBtn', 'signOut');
    // section headings
    const nameTitle = document.getElementById('infoSectionNameTitle'); if (nameTitle) nameTitle.textContent = adminLang === 'bg' ? 'Имена' : 'Name';
    const descTitle = document.getElementById('infoSectionDescTitle'); if (descTitle) descTitle.textContent = adminLang === 'bg' ? 'Слоган / Описание' : 'Tagline / Description';
    const appTitle  = document.getElementById('infoSectionAppearanceTitle'); if (appTitle) appTitle.textContent = adminLang === 'bg' ? 'Визия' : 'Appearance';
    const mediaTitle= document.getElementById('infoSectionMediaTitle'); if (mediaTitle) mediaTitle.textContent = adminLang === 'bg' ? 'Медия' : 'Media';

    setText('cfgSectionDisplayTitle', 'cfgDisplayTitle');
    setText('cfgSectionDisplayDesc', 'cfgDisplayDesc');
    setText('cfgSectionCurrencyTitle', 'cfgCurrencyTitle');
    setText('cfgSectionCurrencyDesc', 'cfgCurrencyDesc');
    setText('cfgCurrencyMainLabel', 'main');
    setText('cfgCurrencyDisplayLabel', 'display');
    setText('cfgCurrencyAddHint', 'addCurrencies');
    setText('cfgSectionTimeTitle', 'cfgTimeTitle');
    setText('cfgSectionTimeDesc', 'cfgTimeDesc');
    setText('categoriesToolbarHint', 'categoriesToolbarHint');
    setText('addCategoryBtn', 'addCategory');

    const preview = document.getElementById('previewLink'); if (preview) preview.textContent = tr('preview');
    const saveBtnEl = document.getElementById('saveBtn'); if (saveBtnEl && saveBtnEl.textContent !== 'Saving…' && saveBtnEl.textContent !== 'Запазване…') saveBtnEl.textContent = tr('save');
    const dirty = document.getElementById('dirtyBadge'); if (dirty) dirty.textContent = tr('unsaved');

    document.querySelectorAll('.editor-nav__item').forEach(item => {
      const lbl = item.querySelector('.editor-nav__label');
      if (!lbl) return;
      if (item.dataset.tab === 'info')       lbl.textContent = tr('editorRestaurantTab');
      if (item.dataset.tab === 'config')     lbl.textContent = tr('editorSettingsTab');
      if (item.dataset.tab === 'categories') lbl.textContent = tr('editorMenuTab');
      if (item.dataset.tab === 'qr')         lbl.textContent = tr('editorQrTab');
    });

    // Info bilingual row labels
    const setRowLabel = (rowId, text) => {
      const row = document.getElementById(rowId);
      const label = row?.querySelector('.field-label');
      if (label) label.textContent = text;
    };
    setRowLabel('infoNameEnRow', tr('nameEnglish'));
    setRowLabel('infoNameBgRow', tr('nameBulgarian'));
    setRowLabel('infoDescEnRow', tr('descEnglish'));
    setRowLabel('infoDescBgRow', tr('descBulgarian'));
  }

  /* ── TOAST ──────────────────────────────────────────────── */
  let toastTimer;
  function showToast(msg, type = 'success') {
    toast.textContent = msg;
    toast.className = `toast ${type}`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.className = 'toast hidden'; }, 3000);
  }

  /* ── CONFIRM MODAL ──────────────────────────────────────── */
  function confirm(msg) {
    return new Promise(resolve => {
      modalMsg.textContent = msg;
      modalBackdrop.classList.remove('hidden');
      const cleanup = (val) => {
        modalBackdrop.classList.add('hidden');
        modalConfirm.removeEventListener('click', onOk);
        modalCancel.removeEventListener('click', onCancel);
        resolve(val);
      };
      const onOk     = () => cleanup(true);
      const onCancel = () => cleanup(false);
      modalConfirm.addEventListener('click', onOk);
      modalCancel.addEventListener('click', onCancel);
    });
  }

  /* ── DIRTY STATE ────────────────────────────────────────── */
  function setDirty(val) {
    isDirty = val;
    dirtyBadge.classList.toggle('hidden', !val);
    saveBtn.disabled = false;
  }

  /* ── QUANTITY METRICS (after sign-in only; no venue list for auth UI) ── */
  async function loadQuantityMetricsOnly() {
    try {
      const res = await fetch('../resources/restaurants.json');
      if (!res.ok) throw new Error();
      const data = await res.json();
      quantityMetrics = data.quantity_metrics || [];
    } catch {
      quantityMetrics = [];
    }
  }

  function applyRestaurantSummariesFromApi(summaries) {
    scopedRestaurantSummaries = new Map();
    if (!Array.isArray(summaries)) return;
    summaries.forEach(s => {
      if (s && s.restaurantId) scopedRestaurantSummaries.set(String(s.restaurantId), s);
    });
  }

  /** Tab label: localized menu name, or venue id if no title in DB. */
  function workspaceDisplayNameForId(rid) {
    const s = scopedRestaurantSummaries.get(rid);
    if (!s) return rid;
    const en = (s.nameEn || '').trim();
    const bg = (s.nameBg || '').trim();
    if (adminLang === 'bg') {
      if (bg) return bg;
      if (en) return en;
    } else {
      if (en) return en;
      if (bg) return bg;
    }
    return rid;
  }

  function refreshWorkspaceTabLabels() {
    if (venueTabStrip) {
      venueTabStrip.classList.toggle('hidden', scopedRestaurantIds.length === 0);
      if (scopedRestaurantIds.length) {
        renderVenueTabs(venueTabStrip, activeWorkspaceId, async r => {
          await openEditorForRestaurantId(r);
        });
      }
    }
    renderEditorVenueStrip();
  }

  function renderVenueTabs(container, activeId, onPick) {
    if (!container) return;
    container.innerHTML = '';
    scopedRestaurantIds.forEach(rid => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'venue-tab' + (rid === activeId ? ' venue-tab--active' : '');
      btn.textContent = workspaceDisplayNameForId(rid);
      btn.title = rid;
      btn.setAttribute('aria-selected', rid === activeId ? 'true' : 'false');
      btn.addEventListener('click', () => onPick(rid));
      container.appendChild(btn);
    });
  }

  function renderEditorVenueStrip() {
    if (!editorVenueStrip) return;
    if (scopedRestaurantIds.length <= 1) {
      editorVenueStrip.classList.add('hidden');
      return;
    }
    editorVenueStrip.classList.remove('hidden');
    renderVenueTabs(editorVenueStrip, activeWorkspaceId, async rid => {
      if (rid === activeWorkspaceId) return;
      if (isDirty) {
        const ok = await confirm(
          adminLang === 'bg'
            ? 'Има незаписани промени. Да превключим без запазване?'
            : 'You have unsaved changes. Switch workspace without saving?'
        );
        if (!ok) return;
      }
      setDirty(false);
      activeWorkspaceId = rid;
      currentRestaurant = { id: rid };
      await loadAndOpenEditor();
    });
  }

  function showCredentialsUi() {
    authCredentialsBlock?.classList.remove('hidden');
    postAuthPanel?.classList.add('hidden');
  }

  function showPostAuthUi() {
    authCredentialsBlock?.classList.add('hidden');
    postAuthPanel?.classList.remove('hidden');
    if (superOpsLink) superOpsLink.classList.toggle('hidden', !sessionSuperAdmin);
    if (logsDashboardLink) {
      logsDashboardLink.classList.toggle('hidden', !sessionSuperAdmin);
      logsDashboardLink.href = 'logs.html';
    }
    if (superOnlyHint) {
      superOnlyHint.classList.toggle('hidden', scopedRestaurantIds.length > 0);
      superOnlyHint.textContent = tr('superOnlyHint');
    }
    if (postAuthHint) {
      postAuthHint.classList.toggle('hidden', scopedRestaurantIds.length === 0);
      postAuthHint.textContent = tr('chooseWorkspaceHint');
    }
    if (venueTabStrip) {
      venueTabStrip.classList.toggle('hidden', scopedRestaurantIds.length === 0);
      renderVenueTabs(venueTabStrip, activeWorkspaceId, async rid => {
        await openEditorForRestaurantId(rid);
      });
    }
  }

  async function signOutSession() {
    const apiBase = getMenuApiBase();
    if (apiBase) {
      try {
        await fetch(`${apiBase}/api/auth/logout`, { method: 'POST', credentials: 'include' });
      } catch (_) {
        /* ignore */
      }
    }
    clearAuthToken();
    sessionSuperAdmin = false;
    scopedRestaurantIds = [];
    scopedRestaurantSummaries = new Map();
    activeWorkspaceId = null;
    menuData = null;
    currentRestaurant = null;
    showCredentialsUi();
    if (authErrorEl) authErrorEl.style.display = 'none';
  }

  async function openEditorForRestaurantId(rid) {
    activeWorkspaceId = rid;
    currentRestaurant = { id: rid };
    _resetLayoutPanel();
    await loadAndOpenEditor();
  }

  async function restoreSessionIfPossible() {
    const t = getAuthToken();
    if (!t) return false;
    const base = getMenuApiBase();
    if (!base) return false;
    try {
      const res = await fetch(`${base}/api/auth/me`, { headers: { Authorization: 'Bearer ' + t } });
      if (!res.ok) {
        clearAuthToken();
        return false;
      }
      const me = await res.json();
      scopedRestaurantIds = Array.isArray(me.restaurants) ? me.restaurants : [];
      applyRestaurantSummariesFromApi(me.restaurantSummaries);
      sessionSuperAdmin = !!me.superAdmin;
      try {
        if (sessionSuperAdmin && t) localStorage.setItem(SUPER_JWT_MIRROR_KEY, t);
        else localStorage.removeItem(SUPER_JWT_MIRROR_KEY);
      } catch (_) {
        /* ignore */
      }
      await loadQuantityMetricsOnly();
      showPostAuthUi();
      return true;
    } catch {
      clearAuthToken();
      return false;
    }
  }

  function normalizeCurrencyConfig(currencies = {}, restaurantEntry = null) {
    const support = getCurrencySupport(restaurantEntry);
    const supportedCodes = new Set(support.map(c => c.code));
    const ref = String(restaurantEntry?.currency_reference || 'EUR').toUpperCase();

    let base = String(currencies.base || ref || 'EUR').toUpperCase();
    if (!supportedCodes.has(base)) {
      const fallback = support.find(c => c.code === ref)?.code || support[0]?.code || 'EUR';
      base = fallback;
    }

    let display = (Array.isArray(currencies.display) && currencies.display.length)
      ? currencies.display.map(x => String(x).toUpperCase()).filter(Boolean)
      : [base, ...getCurrencySupport(restaurantEntry).map(c => c.code).filter(code => code !== base)];

    if (!display.includes(base)) display.unshift(base);
    display = [...new Set(display)].filter(code => supportedCodes.has(code));
    if (!display.length) display = [base];

    return { base, display };
  }

  function renderCurrencyConfig(currencyCfg) {
    const mainChipsEl = document.getElementById('cfgCurrencyMainChips');
    const displayEl   = document.getElementById('cfgCurrencyDisplayChips');
    const availEl     = document.getElementById('cfgCurrencyAvailableChips');
    if (!mainChipsEl || !displayEl || !availEl) return;

    const support = getCurrencySupport(currentRestaurant);
    const supportByCode = new Map(support.map(c => [c.code, c]));

    // Ensure normalized (and mutate the object in-place)
    const normalized = normalizeCurrencyConfig(currencyCfg || {}, currentRestaurant);
    currencyCfg.base = normalized.base;
    currencyCfg.display = normalized.display;

    mainChipsEl.innerHTML = '';
    support.forEach(meta => {
      const chip = document.createElement('div');
      chip.className = `item-tag-chip currency-chip${meta.code === currencyCfg.base ? ' currency-chip--main' : ''}`;
      chip.innerHTML = `
        <span class="item-tag-chip__en">${esc(meta.code)}</span>
        ${meta.symbol && meta.symbol !== meta.code ? `<span class="item-tag-chip__bg">(${esc(meta.symbol)})</span>` : ''}
        ${meta.code === currencyCfg.base ? `<span class="currency-chip__main-badge">${esc(tr('mainBadge'))}</span>` : ''}
      `;
      chip.title = meta.code === currencyCfg.base
        ? (adminLang === 'bg' ? 'Основна валута' : 'Main currency')
        : (adminLang === 'bg' ? 'Задай като основна валута' : 'Set as main currency');
      chip.addEventListener('click', () => {
        currencyCfg.base = meta.code;
        if (!currencyCfg.display.includes(currencyCfg.base)) currencyCfg.display.unshift(currencyCfg.base);
        currencyCfg.display = [currencyCfg.base, ...currencyCfg.display.filter(c => c !== currencyCfg.base)];
        renderCurrencyConfig(currencyCfg);
        // Refresh item headers so the price symbol matches the new base.
        renderCategories(menuData.restaurant.menu.categories);
        setDirty(true);
      });
      mainChipsEl.appendChild(chip);
    });

    displayEl.innerHTML = '';
    currencyCfg.display.forEach((code, idx) => {
      const meta = supportByCode.get(code) || { code, symbol: code };
      const chip = document.createElement('div');
      chip.className = `item-tag-chip currency-chip${code === currencyCfg.base ? ' currency-chip--main' : ''}`;
      chip.dataset.code = code;

      chip.innerHTML = `
        <span class="item-tag-chip__en">${esc(meta.code)}</span>
        ${meta.symbol ? `<span class="item-tag-chip__bg">(${esc(meta.symbol)})</span>` : ''}
        ${code === currencyCfg.base ? `<span class="currency-chip__main-badge">${esc(tr('mainBadge'))}</span>` : ''}
        <span class="currency-chip__controls">
          ${idx > 0 ? `<span class="currency-chip__ctl" data-action="up" title="Move up">↑</span>` : ''}
          ${idx < currencyCfg.display.length - 1 ? `<span class="currency-chip__ctl" data-action="down" title="Move down">↓</span>` : ''}
          ${code !== currencyCfg.base ? `<span class="currency-chip__ctl currency-chip__ctl--remove" data-action="remove" title="Remove">×</span>` : ''}
        </span>
      `;

      chip.addEventListener('click', e => {
        const ctl = e.target.closest('.currency-chip__ctl');
        if (!ctl) return;
        const action = ctl.getAttribute('data-action');
        const currentIdx = currencyCfg.display.indexOf(code);
        if (currentIdx < 0) return;

        if (action === 'up' && currentIdx > 0) {
          const tmp = currencyCfg.display[currentIdx - 1];
          currencyCfg.display[currentIdx - 1] = currencyCfg.display[currentIdx];
          currencyCfg.display[currentIdx] = tmp;
        } else if (action === 'down' && currentIdx < currencyCfg.display.length - 1) {
          const tmp = currencyCfg.display[currentIdx + 1];
          currencyCfg.display[currentIdx + 1] = currencyCfg.display[currentIdx];
          currencyCfg.display[currentIdx] = tmp;
        } else if (action === 'remove' && code !== currencyCfg.base) {
          currencyCfg.display = currencyCfg.display.filter(c => c !== code);
          if (!currencyCfg.display.includes(currencyCfg.base)) currencyCfg.display.unshift(currencyCfg.base);
        }

        renderCurrencyConfig(currencyCfg);
        setDirty(true);
      });

      displayEl.appendChild(chip);
    });

    // Available chips (not in display) - click adds at end.
    availEl.innerHTML = '';
    support.filter(meta => !currencyCfg.display.includes(meta.code)).forEach(meta => {
      const chip = document.createElement('div');
      chip.className = `item-tag-chip currency-chip`;
      chip.innerHTML = `
        <span class="item-tag-chip__en">+ ${esc(meta.code)}</span>
        ${meta.symbol && meta.symbol !== meta.code ? `<span class="item-tag-chip__bg">(${esc(meta.symbol)})</span>` : ''}
      `;
      chip.title = 'Add to displayed currencies';
      chip.addEventListener('click', () => {
        currencyCfg.display.push(meta.code);
        renderCurrencyConfig(currencyCfg);
        setDirty(true);
      });
      availEl.appendChild(chip);
    });
  }

  /* ── LOGIN FIELD TOGGLES ─────────────────────────────────── */
  sharedPasswordToggle?.addEventListener('click', () => {
    const isHidden = sharedPasswordInput.type === 'password';
    sharedPasswordInput.type  = isHidden ? 'text' : 'password';
    sharedPasswordToggle.title = isHidden ? 'Hide password' : 'Show password';
  });
  sharedPasswordInput?.addEventListener('keydown', e => {
    if (e.key === 'Enter') authSignInBtn?.click();
  });
  usernameInput?.addEventListener('keydown', e => {
    if (e.key === 'Enter') authSignInBtn?.click();
  });

  /* ── AUTHENTICATE (JWT via backend) ──────────────────────── */
  async function handleSignIn(triggerBtn) {
    const username = usernameInput.value.trim();
    const pw = sharedPasswordInput.value.trim();

    if (!username) {
      usernameInput.focus();
      usernameInput.classList.add('field-error');
      setTimeout(() => usernameInput.classList.remove('field-error'), 1200);
      showToast(adminLang === 'bg' ? 'Въведи потребителско име.' : 'Please enter your username.', 'error');
      return;
    }
    if (!pw) {
      sharedPasswordInput.focus();
      return;
    }

    const base = getMenuApiBase();
    if (!base) {
      showToast(
        adminLang === 'bg'
          ? 'Задай URL на API: meta menu-api-base или window.__MENU_API_BASE__ (портът на статичния сървър не е API).'
          : 'Set the Menu API URL: <meta name="menu-api-base"> or window.__MENU_API_BASE__ (static file port is not the API).',
        'error'
      );
      return;
    }

    if (authErrorEl) authErrorEl.style.display = 'none';
    if (triggerBtn) triggerBtn.disabled = true;

    let loginRes;
    try {
      loginRes = await fetch(`${base}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password: pw }),
        /* Cross-origin: allows HttpOnly dashboard cookie on API host; telemetry UI uses Bearer + logs.html. */
        credentials: 'include'
      });
    } catch (err) {
      showToast((adminLang === 'bg' ? 'Мрежова грешка: ' : 'Network error: ') + (err.message || ''), 'error');
      if (triggerBtn) triggerBtn.disabled = false;
      return;
    }

    if (!loginRes.ok) {
      clearAuthToken();
      adminTrack('admin_auth_fail', {});
      if (authErrorEl) {
        authErrorEl.style.display = 'block';
        authErrorEl.textContent = adminLang === 'bg'
          ? 'Невалидно потребителско име или парола.'
          : 'Invalid username or password.';
      }
      sharedPasswordInput.focus();
      if (triggerBtn) triggerBtn.disabled = false;
      return;
    }

    const body = await loginRes.json();
    const token = body.accessToken;
    const allowed = Array.isArray(body.restaurants) ? body.restaurants : [];
    if (!token) {
      showToast('Login response missing token.', 'error');
      if (triggerBtn) triggerBtn.disabled = false;
      return;
    }

    sessionSuperAdmin = !!body.superAdmin;
    scopedRestaurantIds = allowed;
    applyRestaurantSummariesFromApi(body.restaurantSummaries);
    setAuthToken(token);
    try {
      if (body.superAdmin) localStorage.setItem(SUPER_JWT_MIRROR_KEY, token);
      else localStorage.removeItem(SUPER_JWT_MIRROR_KEY);
    } catch (_) {
      /* ignore */
    }
    await loadQuantityMetricsOnly();

    if (!scopedRestaurantIds.length && !sessionSuperAdmin) {
      clearAuthToken();
      adminTrack('admin_auth_fail', { reason: 'no_restaurant_scope' });
      if (authErrorEl) {
        authErrorEl.style.display = 'block';
        authErrorEl.textContent = adminLang === 'bg'
          ? 'Няма свързани обекти за този акаунт.'
          : 'No workspaces are linked to this account.';
      }
      if (triggerBtn) triggerBtn.disabled = false;
      return;
    }

    adminTrack('admin_auth_ok', { venue_count: scopedRestaurantIds.length, super: sessionSuperAdmin ? 1 : 0 });

    if (!scopedRestaurantIds.length && sessionSuperAdmin) {
      showPostAuthUi();
      if (triggerBtn) triggerBtn.disabled = false;
      return;
    }

    if (scopedRestaurantIds.length === 1) {
      await openEditorForRestaurantId(scopedRestaurantIds[0]);
      if (triggerBtn) triggerBtn.disabled = false;
      return;
    }

    showPostAuthUi();
    if (triggerBtn) triggerBtn.disabled = false;
  }

  /**
   * API (mt-server) persists menu items as string `quantity` + string `unit` (metric code, e.g. grams).
   * This admin UI edits `item.quantity = { value, metric }` for compatibility with the public menu (restaurant.js).
   * Convert API → editor shape after load, and editor → API shape in buildMenuPayloadForApi() before PUT.
   */
  function resolveMetricCodeFromApi(rawU) {
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

  function normalizeItemQuantityFromApi(item) {
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

    const metric = resolveMetricCodeFromApi(rawU);

    delete item.quantity;
    delete item.unit;

    if (value != null && value !== '' && !Number.isNaN(value) && value !== 0) {
      item.quantity = { value };
      if (metric) item.quantity.metric = metric;
    } else if (metric) {
      item.quantity = { metric };
    }
  }

  function normalizeAllMenuItemsQuantityFromApi(menuData) {
    const cats = menuData && menuData.restaurant && menuData.restaurant.menu && menuData.restaurant.menu.categories;
    if (!cats) return;
    cats.forEach(cat => (cat.items || []).forEach(normalizeItemQuantityFromApi));
  }

  function formatQuantityForApi(n) {
    if (n == null || Number.isNaN(Number(n))) return '';
    const num = Number(n);
    if (Math.abs(num - Math.round(num)) < 1e-9) return String(Math.round(num));
    let s = String(num);
    s = s.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
    return s;
  }

  function buildMenuPayloadForApi(menuData) {
    const payload = JSON.parse(JSON.stringify(menuData));
    const cats = payload && payload.restaurant && payload.restaurant.menu && payload.restaurant.menu.categories;
    if (!cats) return payload;
    cats.forEach(cat => {
      (cat.items || []).forEach(item => {
        const q = item.quantity;
        if (q && typeof q === 'object' && !Array.isArray(q) && ('value' in q || 'metric' in q)) {
          const val = q.value;
          const metric = q.metric != null ? String(q.metric).trim() : '';
          delete item.quantity;
          delete item.unit;
          if (val != null && val !== '' && !Number.isNaN(Number(val)) && Number(val) !== 0) {
            item.quantity = formatQuantityForApi(Number(val));
          }
          if (metric) {
            item.unit = metric;
          }
        }
      });
    });
    return payload;
  }

  /* ── LOAD MENU FROM BACKEND (JPA) ───────────────────────── */
  async function loadAndOpenEditor() {
    saveBtn.disabled = true;
    const r = currentRestaurant;
    const base = getMenuApiBase();
    if (!base) {
      showToast('Menu API base not configured (meta menu-api-base or __MENU_API_BASE__).', 'error');
      saveBtn.disabled = false;
      return;
    }

    try {
      const res = await fetch(`${base}/api/public/menu/${encodeURIComponent(r.id)}`);
      if (res.status === 404) {
        showToast(
          adminLang === 'bg'
            ? 'Няма публикувано меню в базата. Запази първо от админ или импортирай.'
            : 'No menu in database yet. Save once from admin or import data.',
          'error'
        );
        saveBtn.disabled = false;
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const wrapper = await res.json();
      menuData = wrapper.record;
      if (!menuData || !menuData.restaurant) throw new Error('Empty menu payload');
      currentRestaurant = menuData.restaurant;
      normalizeAllMenuItemsQuantityFromApi(menuData);
      openEditor();
    } catch (err) {
      adminTrack('admin_menu_load_fail', {
        restaurant_id: String(r.id).slice(0, 40),
        message:         err.message || 'error'
      });
      showToast('Failed to load menu: ' + err.message, 'error');
    } finally {
      saveBtn.disabled = false;
    }
  }

  function getPublicMenuUrl() {
    if (!currentRestaurant) return '';
    try {
      return new URL('../' + encodeURI(currentRestaurant.id) + '/', window.location.href).href;
    } catch (_) {
      return '';
    }
  }

  /* ── OPEN EDITOR ─────────────────────────────────────────── */
  function openEditor() {
    authScreen.classList.add('hidden');
    editorScreen.classList.remove('hidden');
    window.scrollTo(0, 0);
    renderEditorVenueStrip();

    const r = menuData.restaurant;
    editorTitle.textContent = 'Editing: ' + (r.name.en || r.id);
    previewLink.href = '../' + r.id + '/';
    setDirty(false);
    editorSessionStart = Date.now();
    adminTrack('admin_editor_open', {});

    populateInfo(r);
    populateConfig(r.menu.config);
    renderCategories(r.menu.categories);

    if (window.AdminQrFlyers) {
      window.AdminQrFlyers.init({
        getRestaurant: () => (menuData && menuData.restaurant) || {},
        getMenuUrl:    getPublicMenuUrl,
        uploadSheetBackground: (targetInput, previewEl) => {
          const rid = currentRestaurant?.id || 'general';
          triggerImageUpload(targetInput, previewEl, `restaurant_menu/${rid}/qr_media`);
        }
      });
    }

    // Show Layout & Reservations tab only for super admins
    const layoutTab = document.getElementById('layoutTab');
    if (layoutTab) layoutTab.classList.toggle('hidden', !sessionSuperAdmin);

    if (sessionSuperAdmin) {
      _initLayoutPanel();
    }
  }

  /* ── BACK BUTTON ─────────────────────────────────────────── */
  document.getElementById('backBtn').addEventListener('click', async () => {
    if (isDirty) {
      const ok = await confirm('You have unsaved changes. Leave without saving?');
      if (!ok) return;
    }
    if (editorSessionStart) {
      adminTrack('admin_editor_close', {
        duration_sec: Math.round((Date.now() - editorSessionStart) / 1000),
        had_unsaved:  isDirty ? 1 : 0
      });
      editorSessionStart = 0;
    }
    editorScreen.classList.add('hidden');
    authScreen.classList.remove('hidden');
    menuData = null;
    currentRestaurant = null;
    setDirty(false);
    showPostAuthUi();
    document.querySelectorAll('.editor-nav__item').forEach(t => {
      t.classList.toggle('active', t.dataset.tab === 'info');
    });
    document.querySelectorAll('.editor-panel').forEach(p => {
      const on = p.id === 'panel-info';
      p.classList.toggle('active', on);
      p.classList.toggle('hidden', !on);
    });
  });

  /* ── TABS ────────────────────────────────────────────────── */
  function switchTab(tabId) {
    document.querySelectorAll('.editor-nav__item').forEach(t => t.classList.toggle('active', t.dataset.tab === tabId));
    document.querySelectorAll('.editor-panel').forEach(p => {
      const active = p.id === 'panel-' + tabId;
      p.classList.toggle('active', active);
      p.classList.toggle('hidden', !active);
    });
    adminTrack('admin_tab_view', { tab: String(tabId).slice(0, 40) });
    if (tabId === 'qr' && window.AdminQrFlyers) window.AdminQrFlyers.refresh();
    if (tabId === 'layout' && sessionSuperAdmin) _initLayoutPanel();
  }

  /* ── LAYOUT & RESERVATIONS (super-admin) ─────────────────── */
  let _layoutPanelInit = false;

  function _initLayoutPanel() {
    if (_layoutPanelInit) return;
    _layoutPanelInit = true;

    const rid  = currentRestaurant?.id || '';
    const base = getMenuApiBase();

    // Public reserve link
    const reserveLink = document.getElementById('reservePublicLink');
    if (reserveLink) {
      try {
        reserveLink.href = new URL(`../reserve/?r=${encodeURIComponent(rid)}`, window.location.href).href;
      } catch (_) {}
    }

    // Sub-tab switching
    const subTabBar = document.getElementById('lfSubTabBar');
    const editorHost = document.getElementById('lfEditorHost');
    const resHost    = document.getElementById('lfReservationsHost');
    if (subTabBar) {
      subTabBar.querySelectorAll('[data-subtab]').forEach(btn => {
        btn.addEventListener('click', () => {
          subTabBar.querySelectorAll('[data-subtab]').forEach(b => b.classList.remove('is-active'));
          btn.classList.add('is-active');
          const st = btn.dataset.subtab;
          if (editorHost) editorHost.style.display = st === 'editor' ? '' : 'none';
          if (resHost)    resHost.style.display    = st === 'reservations' ? '' : 'none';
          if (st === 'reservations') _loadReservations();
        });
      });
    }

    // Init layout editor
    if (window.LayoutEditor && rid && base) {
      window.LayoutEditor.init({
        container:    editorHost,
        apiBase:      base,
        restaurantId: rid,
        jwt:          getAuthToken(),
      });
    }

    // Reservations date input + load button
    const dateInput = document.getElementById('admResDate');
    if (dateInput) {
      dateInput.value = new Date().toISOString().slice(0, 10);
    }
    const loadBtn = document.getElementById('admResLoad');
    if (loadBtn) loadBtn.addEventListener('click', _loadReservations);
  }

  function _resetLayoutPanel() {
    _layoutPanelInit = false;
    const editorHost = document.getElementById('lfEditorHost');
    if (editorHost) editorHost.innerHTML = '';
  }

  async function _loadReservations() {
    const rid  = currentRestaurant?.id || '';
    const base = getMenuApiBase();
    const date = document.getElementById('admResDate')?.value || new Date().toISOString().slice(0, 10);
    const tbody = document.getElementById('admResTbody');
    const empty = document.getElementById('admResEmpty');
    if (!tbody || !rid || !base) return;
    tbody.innerHTML = '<tr><td colspan="7" style="padding:14px;text-align:center;color:var(--color-text-muted)">Loading…</td></tr>';
    if (empty) empty.style.display = 'none';
    try {
      const res = await fetch(
        `${base}/api/admin/reservations/${encodeURIComponent(rid)}?date=${date}`,
        { headers: { Authorization: 'Bearer ' + getAuthToken() } }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const list = await res.json();
      if (!list.length) {
        tbody.innerHTML = '';
        if (empty) empty.style.display = '';
        return;
      }
      const STATUS_NEXT = {
        PENDING:   'CONFIRMED',
        CONFIRMED: 'SEATED',
        SEATED:    'COMPLETED',
      };
      tbody.innerHTML = list.map(r => {
        const time  = r.reservedTime ? r.reservedTime.slice(0, 5) : '—';
        const badge = r.status.toLowerCase().replace('_', '-');
        const nextS = STATUS_NEXT[r.status];
        const actions = nextS
          ? `<button class="adm-res-action" data-id="${r.id}" data-status="${nextS}">${_statusLabel(nextS)}</button> `
          : '';
        const cancelAction = r.status !== 'CANCELLED' && r.status !== 'COMPLETED'
          ? `<button class="adm-res-action" data-id="${r.id}" data-status="CANCELLED" style="color:#dc2626">Cancel</button>`
          : '';
        return `<tr>
          <td>${time}</td>
          <td>${_esc(r.tableId)}</td>
          <td>${_esc(r.guestName)}</td>
          <td>${r.partySize}</td>
          <td>${_esc(r.guestContact || '—')}</td>
          <td><span class="adm-res-badge adm-res-badge--${badge}">${r.status.replace('_', ' ')}</span></td>
          <td>${actions}${cancelAction}</td>
        </tr>`;
      }).join('');

      tbody.querySelectorAll('[data-id][data-status]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id  = btn.dataset.id;
          const st  = btn.dataset.status;
          btn.disabled = true;
          try {
            const upd = await fetch(
              `${base}/api/admin/reservations/${encodeURIComponent(rid)}/${id}`,
              {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + getAuthToken() },
                body: JSON.stringify({ status: st }),
              }
            );
            if (!upd.ok) throw new Error(`HTTP ${upd.status}`);
            _loadReservations();
          } catch (err) {
            showToast('Failed: ' + err.message, 'error');
            btn.disabled = false;
          }
        });
      });
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="7" style="color:#dc2626;padding:14px">${_esc(err.message)}</td></tr>`;
    }
  }

  function _statusLabel(s) {
    return { CONFIRMED: 'Confirm', SEATED: 'Seat', COMPLETED: 'Complete' }[s] || s;
  }

  function _esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* ── URL PREVIEW HELPER ──────────────────────────────────── */
  function resolveUrl(val) {
    /* A full URL is used as-is; a bare filename is resolved relative to
       the current restaurant's resource folder so the admin can preview it. */
    if (!val) return null;
    if (/^https?:\/\//i.test(val) || val.startsWith('/')) return val;
    return currentRestaurant
      ? `../resources/${currentRestaurant.id}/${val}`
      : null;
  }

  function showPreview(previewEl, rawVal) {
    const src = resolveUrl(rawVal);
    if (!src) { previewEl.innerHTML = ''; return; }
    // Use Cloudinary delivery optimization for Cloudinary URLs
    const displaySrc = cldOptimize(src, 300);
    previewEl.innerHTML = `<img src="${esc(displaySrc)}" alt="" onerror="this.parentElement.innerHTML='<span class=\\'url-preview-err\\'>Image not found</span>'" />`;
  }

  /**
   * Bind a URL text input to a preview element, and optionally attach an upload button.
   * @param {string} inputId      id of the text <input>
   * @param {string} previewId    id of the preview <div>
   * @param {string} [uploadBtnId]  id of the upload <button> (optional)
   * @param {string} [folder]     Cloudinary folder for uploads (optional)
   */
  function bindUrlField(inputId, previewId, uploadBtnId, folder) {
    const input     = document.getElementById(inputId);
    const preview   = document.getElementById(previewId);
    const uploadBtn = uploadBtnId ? document.getElementById(uploadBtnId) : null;

    function refresh() {
      showPreview(preview, input.value.trim());
      setDirty(true);
    }

    input.addEventListener('input', refresh);
    if (input.value) showPreview(preview, input.value.trim());

    if (uploadBtn) {
      const uploadFolder = folder ||
        (currentRestaurant ? `restaurant_menu/${currentRestaurant.id}` : 'restaurant_menu');
      uploadBtn.addEventListener('click', () => triggerImageUpload(input, preview, uploadFolder));
    }
  }

  /* ── POPULATE INFO ───────────────────────────────────────── */
  function populateInfo(r) {
    document.getElementById('infoNameEn').value  = r.name.en || '';
    document.getElementById('infoNameBg').value  = r.name.bg || '';
    document.getElementById('infoDescEn').value  = r.description.en || '';
    document.getElementById('infoDescBg').value  = r.description.bg || '';
    document.getElementById('infoTheme').value   = r.menu.theme || 'classic';
    document.getElementById('infoLang').value    = r.default_language || 'en';
    document.getElementById('infoLogo').value    = r.logo || '';
    document.getElementById('infoImage').value   = r.image || '';
    document.getElementById('infoBgImage').value = r.background_image || '';

    ['infoNameEn','infoNameBg','infoDescEn','infoDescBg','infoTheme','infoLang'].forEach(id => {
      document.getElementById(id).addEventListener('input', () => setDirty(true));
    });

    const rid = currentRestaurant?.id || 'general';
    bindUrlField('infoLogo',    'infoLogoPreview',    'infoLogoUpload',    `restaurant_menu/${rid}`);
    bindUrlField('infoImage',   'infoImagePreview',   'infoImageUpload',   `restaurant_menu/${rid}`);
    bindUrlField('infoBgImage', 'infoBgImagePreview', 'infoBgImageUpload', `restaurant_menu/${rid}`);
  }

  /* ── POPULATE CONFIG ─────────────────────────────────────── */
  function populateConfig(cfg) {
    document.getElementById('cfgPrice').checked       = cfg.show_price !== false;
    document.getElementById('cfgDesc').checked        = cfg.show_description !== false;
    document.getElementById('cfgTags').checked        = cfg.show_tags !== false;
    document.getElementById('cfgIngredients').checked = cfg.show_ingredients === true;
    document.getElementById('cfgAllergens').checked   = cfg.show_allergens === true;

    const tzEl = document.getElementById('cfgTimezone');
    if (tzEl) {
      tzEl.value = cfg.timezone || 'Europe/Sofia';
      if (!tzEl.value) tzEl.value = 'Europe/Sofia'; // fallback if not in list
    }
    ['cfgPrice','cfgDesc','cfgTags','cfgIngredients','cfgAllergens','cfgTimezone']
      .forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('change', () => setDirty(true));
      });

    if (!cfg.currencies) cfg.currencies = {};
    cfg.currencies = normalizeCurrencyConfig(cfg.currencies, currentRestaurant);
    renderCurrencyConfig(cfg.currencies);
  }

  /* ── CATEGORIES ──────────────────────────────────────────── */
  function renderCategories(categories) {
    categoriesList.innerHTML = '';
    categories.forEach((cat, catIdx) => {
      categoriesList.appendChild(buildCategoryBlock(cat, catIdx, categories));
    });
    initCategoryDrag();
  }

  /* ── DRAG-TO-REORDER (pointer events — works on desktop & touch) ── */
  function initCategoryDrag() {
    // Guard: only bind once per render; we rebind fresh each renderCategories call
    let drag = null; // { block, placeholder, catIdx, blockOffsetY }

    function onMove(e) {
      if (!drag) return;
      e.preventDefault();
      const { block, placeholder, blockOffsetY } = drag;

      block.style.top = (e.clientY - blockOffsetY) + 'px';

      // Find the sibling to insert placeholder before
      const siblings = [...categoriesList.querySelectorAll('.category-block:not(.cat-dragging)')];
      let insertBefore = null;
      for (const sib of siblings) {
        const r = sib.getBoundingClientRect();
        if (e.clientY < r.top + r.height / 2) { insertBefore = sib; break; }
      }
      if (insertBefore) {
        if (placeholder.nextSibling !== insertBefore) categoriesList.insertBefore(placeholder, insertBefore);
      } else {
        if (categoriesList.lastElementChild !== placeholder) categoriesList.appendChild(placeholder);
      }
    }

    function onUp() {
      if (!drag) return;
      document.removeEventListener('pointermove', onMove);

      const { block, placeholder, catIdx } = drag;
      drag = null;

      // Determine new index by counting category-blocks before placeholder
      const children = [...categoriesList.children];
      const phIdx = children.indexOf(placeholder);
      let newCatIdx = 0;
      for (let i = 0; i < phIdx; i++) {
        if (children[i].classList && children[i].classList.contains('category-block')) newCatIdx++;
      }

      // Restore block into list before placeholder, then remove placeholder
      block.classList.remove('cat-dragging');
      block.style.cssText = '';
      categoriesList.insertBefore(block, placeholder);
      placeholder.remove();

      if (newCatIdx !== catIdx) {
        const arr = menuData.restaurant.menu.categories;
        const [moved] = arr.splice(catIdx, 1);
        arr.splice(newCatIdx, 0, moved);
        renderCategories(arr);
        setDirty(true);
        adminTrack('admin_category_reorder', { from: catIdx, to: newCatIdx });
      }
    }

    categoriesList.addEventListener('pointerdown', e => {
      const handle = e.target.closest('.category-block__drag');
      if (!handle) return;
      const block = handle.closest('.category-block');
      if (!block) return;

      e.preventDefault();
      const catIdx = +block.dataset.catIdx;
      const rect = block.getBoundingClientRect();

      // Placeholder keeps the space
      const placeholder = document.createElement('div');
      placeholder.className = 'cat-drag-placeholder';
      placeholder.style.height = rect.height + 'px';
      block.parentNode.insertBefore(placeholder, block.nextSibling);

      // Lift block: fix-position it over its current location and move to body
      block.classList.add('cat-dragging');
      block.style.position = 'fixed';
      block.style.left = rect.left + 'px';
      block.style.top  = rect.top  + 'px';
      block.style.width = rect.width + 'px';
      block.style.zIndex = '9999';
      block.style.pointerEvents = 'none';
      document.body.appendChild(block);

      drag = { block, placeholder, catIdx, blockOffsetY: e.clientY - rect.top };

      document.addEventListener('pointermove', onMove, { passive: false });
      document.addEventListener('pointerup',   onUp,  { once: true });
      document.addEventListener('pointercancel', onUp, { once: true });
    }, { passive: false });
  }

  function buildCategoryBlock(cat, catIdx, categories) {
    const block = document.createElement('div');
    block.className = 'category-block';
    block.dataset.catIdx = catIdx;

    const itemCount = cat.items ? cat.items.length : 0;
    const categoryNameFields = isBgFirst()
      ? `
          <div class="category-name-field">
            <label>${esc(tr('categoryBulgarian'))}</label>
            <input class="cat-name-bg" type="text" value="${esc(cat.name.bg || '')}" placeholder="${esc(tr('categoryBgPh'))}" />
          </div>
          <div class="category-name-field">
            <label>${esc(tr('categoryEnglish'))}</label>
            <input class="cat-name-en" type="text" value="${esc(cat.name.en || '')}" placeholder="${esc(tr('categoryEnPh'))}" />
          </div>
        `
      : `
          <div class="category-name-field">
            <label>${esc(tr('categoryEnglish'))}</label>
            <input class="cat-name-en" type="text" value="${esc(cat.name.en || '')}" placeholder="${esc(tr('categoryEnPh'))}" />
          </div>
          <div class="category-name-field">
            <label>${esc(tr('categoryBulgarian'))}</label>
            <input class="cat-name-bg" type="text" value="${esc(cat.name.bg || '')}" placeholder="${esc(tr('categoryBgPh'))}" />
          </div>
        `;
    block.innerHTML = `
      <div class="category-block__header">
        <span class="category-block__drag" title="Drag to reorder">⠿</span>
        <span class="category-block__name">${esc(cat.name.en || cat.id)}</span>
        <span class="category-block__count">${itemCount} ${adminLang === 'bg' ? 'продукта' : `item${itemCount !== 1 ? 's' : ''}`}</span>
        <div class="category-block__actions">
          <button class="cat-btn cat-btn--up" title="Move up">↑</button>
          <button class="cat-btn cat-btn--down" title="Move down">↓</button>
          <button class="cat-btn cat-btn--danger cat-btn--del" title="${adminLang === 'bg' ? 'Изтрий категория' : 'Delete category'}">${adminLang === 'bg' ? 'Изтрий' : 'Delete'}</button>
        </div>
        <span class="category-block__chevron">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 5l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </span>
      </div>
      <div class="category-block__body"><div class="category-block__body-inner">
        <div class="category-name-fields">
          ${categoryNameFields}
        </div>
        <div class="cat-schedule-section">
          <label class="cat-schedule-toggle">
            <input type="checkbox" class="cat-schedule-cb" ${cat.schedule && cat.schedule.enabled ? 'checked' : ''} />
            <span class="toggle-switch"></span>
            <span class="cat-schedule-label">${adminLang === 'bg' ? 'Времева секция' : 'Timed section'}</span>
          </label>
          <div class="cat-schedule-fields${cat.schedule && cat.schedule.enabled ? '' : ' hidden'}">
            <div class="cat-schedule-times">
              <div class="cat-schedule-time-field">
                <label>${adminLang === 'bg' ? 'От' : 'From'}</label>
                <input type="time" class="cat-schedule-start field-input" value="${esc((cat.schedule && cat.schedule.start_time) || '12:00')}" />
              </div>
              <div class="cat-schedule-time-field">
                <label>${adminLang === 'bg' ? 'До' : 'To'}</label>
                <input type="time" class="cat-schedule-end field-input" value="${esc((cat.schedule && cat.schedule.end_time) || '14:00')}" />
              </div>
            </div>
            <div class="cat-schedule-behavior">
              <span class="cat-schedule-behavior-label">${adminLang === 'bg' ? 'Поведение' : 'Behaviour'}</span>
              <label class="cat-behavior-row">
                <input type="checkbox" class="cat-schedule-cb cat-schedule-active-top"
                  ${(cat.schedule && cat.schedule.move_active_top !== false) ? 'checked' : ''} />
                <span class="toggle-switch"></span>
                <span>${adminLang === 'bg' ? 'Премести най-горе, когато е активна' : 'Move to top when currently active'}</span>
              </label>
              <label class="cat-behavior-row">
                <input type="checkbox" class="cat-schedule-cb cat-schedule-inactive-bottom"
                  ${(cat.schedule && cat.schedule.move_inactive_bottom !== false) ? 'checked' : ''} />
                <span class="toggle-switch"></span>
                <span>${adminLang === 'bg' ? 'Премести най-долу, когато е неактивна' : 'Move to bottom when currently inactive'}</span>
              </label>
            </div>
            <span class="cat-schedule-status"></span>
          </div>
        </div>
        <div class="category-items-section">
          <div class="category-items-section__head">
            <span class="category-items-section__title">${esc(tr('itemsSectionTitle'))}</span>
            <span class="category-items-section__hint">${esc(tr('itemsSectionHint'))}</span>
          </div>
          <div class="items-list" id="items-${catIdx}"></div>
          <button class="btn-add-item">${adminLang === 'bg' ? '+ Добави продукт' : '+ Add item'}</button>
        </div>
      </div></div>
    `;

    // Expand/collapse
    const header = block.querySelector('.category-block__header');
    header.addEventListener('click', e => {
      if (e.target.closest('.category-block__actions')) return;
      block.classList.toggle('open');
    });

    // Name change
    block.querySelector('.cat-name-en').addEventListener('input', e => {
      cat.name.en = e.target.value;
      block.querySelector('.category-block__name').textContent = e.target.value || cat.id;
      setDirty(true);
    });
    block.querySelector('.cat-name-bg').addEventListener('input', e => {
      cat.name.bg = e.target.value;
      setDirty(true);
    });

    // Schedule toggle
    (function wireSchedule() {
      const scheduleCb  = block.querySelector('.cat-schedule-cb');
      const schedFields = block.querySelector('.cat-schedule-fields');
      const startInput  = block.querySelector('.cat-schedule-start');
      const endInput    = block.querySelector('.cat-schedule-end');
      const statusEl    = block.querySelector('.cat-schedule-status');

      function timeSectionIsActive(sched) {
        if (!sched || !sched.enabled) return null;
        const tz  = (menuData.restaurant.menu.config || {}).timezone || 'Europe/Sofia';
        try {
          const now = new Date();
          const ts  = now.toLocaleTimeString('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false });
          const [ch, cm] = ts.split(':').map(Number);
          const cur  = ch * 60 + cm;
          const [sh, sm] = (sched.start_time || '12:00').split(':').map(Number);
          const [eh, em] = (sched.end_time   || '14:00').split(':').map(Number);
          const start = sh * 60 + sm, end = eh * 60 + em;
          return end > start ? (cur >= start && cur < end) : (cur >= start || cur < end);
        } catch { return null; }
      }

      function updateStatus() {
        if (!cat.schedule || !cat.schedule.enabled) { statusEl.textContent = ''; return; }
        const active = timeSectionIsActive(cat.schedule);
        const s = cat.schedule.start_time || '', e = cat.schedule.end_time || '';
        statusEl.textContent = active ? `✓ Currently active (${s}–${e})` : `○ Inactive now (${s}–${e})`;
        statusEl.dataset.active = active ? '1' : '0';
      }

      const activeTopCb      = block.querySelector('.cat-schedule-active-top');
      const inactiveBottomCb = block.querySelector('.cat-schedule-inactive-bottom');

      scheduleCb.addEventListener('change', () => {
        if (!cat.schedule) cat.schedule = { start_time: '12:00', end_time: '14:00' };
        cat.schedule.enabled = scheduleCb.checked;
        schedFields.classList.toggle('hidden', !scheduleCb.checked);
        updateStatus();
        setDirty(true);
      });
      startInput.addEventListener('change', () => {
        if (!cat.schedule) cat.schedule = { enabled: true };
        cat.schedule.start_time = startInput.value;
        updateStatus();
        setDirty(true);
      });
      endInput.addEventListener('change', () => {
        if (!cat.schedule) cat.schedule = { enabled: true };
        cat.schedule.end_time = endInput.value;
        updateStatus();
        setDirty(true);
      });
      if (activeTopCb) {
        activeTopCb.addEventListener('change', () => {
          if (!cat.schedule) cat.schedule = { enabled: true };
          cat.schedule.move_active_top = activeTopCb.checked;
          setDirty(true);
        });
      }
      if (inactiveBottomCb) {
        inactiveBottomCb.addEventListener('change', () => {
          if (!cat.schedule) cat.schedule = { enabled: true };
          cat.schedule.move_inactive_bottom = inactiveBottomCb.checked;
          setDirty(true);
        });
      }
      updateStatus();
    })();

    // Move up
    block.querySelector('.cat-btn--up').addEventListener('click', e => {
      e.stopPropagation();
      if (catIdx === 0) return;
      const arr = menuData.restaurant.menu.categories;
      [arr[catIdx - 1], arr[catIdx]] = [arr[catIdx], arr[catIdx - 1]];
      renderCategories(arr);
      setDirty(true);
    });

    // Move down
    block.querySelector('.cat-btn--down').addEventListener('click', e => {
      e.stopPropagation();
      const arr = menuData.restaurant.menu.categories;
      if (catIdx === arr.length - 1) return;
      [arr[catIdx], arr[catIdx + 1]] = [arr[catIdx + 1], arr[catIdx]];
      renderCategories(arr);
      setDirty(true);
    });

    // Delete category
    block.querySelector('.cat-btn--del').addEventListener('click', async e => {
      e.stopPropagation();
      const ok = await confirm(`Delete category "${cat.name.en}"? All ${itemCount} items will be removed.`);
      if (!ok) return;
      adminTrack('admin_category_delete', { category: String(cat.name.en || cat.id).slice(0, 80) });
      menuData.restaurant.menu.categories.splice(catIdx, 1);
      renderCategories(menuData.restaurant.menu.categories);
      setDirty(true);
    });

    // Add item
    block.querySelector('.btn-add-item').addEventListener('click', () => {
      if (!cat.items) cat.items = [];
      cat.items.push({ name: { en: '', bg: '' }, description: { en: '', bg: '' }, price: 0, tags: [], availability: true, image: undefined });
      refreshItemsList(block, cat, catIdx);
      setDirty(true);
      // Open the new item
      const itemsEl = block.querySelector(`#items-${catIdx}`);
      const last = itemsEl.lastElementChild;
      if (last) last.classList.add('open');
    });

    // Render items
    refreshItemsList(block, cat, catIdx);

    return block;
  }

  function refreshItemsList(catBlock, cat, catIdx) {
    const itemsEl = catBlock.querySelector(`#items-${catIdx}`);
    itemsEl.innerHTML = '';
    catBlock.querySelector('.category-block__count').textContent =
      `${cat.items.length} ${adminLang === 'bg' ? 'продукта' : `item${cat.items.length !== 1 ? 's' : ''}`}`;
    cat.items.forEach((item, itemIdx) => {
      itemsEl.appendChild(buildItemBlock(item, itemIdx, cat, catIdx, catBlock));
    });
    bindItemListDrag(itemsEl, cat, catIdx, catBlock);
  }

  /** Pointer drag-to-reorder within one category’s items (same pattern as categories). */
  function bindItemListDrag(itemsEl, cat, catIdx, catBlock) {
    if (catBlock._itemDragAbort) {
      catBlock._itemDragAbort.abort();
    }
    catBlock._itemDragAbort = new AbortController();
    const { signal } = catBlock._itemDragAbort;

    let drag = null;

    function onMove(e) {
      if (!drag) return;
      e.preventDefault();
      const { block, placeholder, blockOffsetY } = drag;
      block.style.top = (e.clientY - blockOffsetY) + 'px';

      const siblings = [...itemsEl.querySelectorAll('.item-block:not(.item-dragging)')];
      let insertBefore = null;
      for (const sib of siblings) {
        const r = sib.getBoundingClientRect();
        if (e.clientY < r.top + r.height / 2) {
          insertBefore = sib;
          break;
        }
      }
      if (insertBefore) {
        if (placeholder.nextSibling !== insertBefore) itemsEl.insertBefore(placeholder, insertBefore);
      } else if (itemsEl.lastElementChild !== placeholder) {
        itemsEl.appendChild(placeholder);
      }
    }

    function onUp() {
      if (!drag) return;
      document.removeEventListener('pointermove', onMove);

      const { block, placeholder, itemIdx } = drag;
      drag = null;

      const children = [...itemsEl.children];
      const phIdx = children.indexOf(placeholder);
      let newItemIdx = 0;
      for (let i = 0; i < phIdx; i++) {
        if (children[i].classList && children[i].classList.contains('item-block')) newItemIdx++;
      }

      block.classList.remove('item-dragging');
      block.style.cssText = '';
      itemsEl.insertBefore(block, placeholder);
      placeholder.remove();

      if (newItemIdx !== itemIdx) {
        const [moved] = cat.items.splice(itemIdx, 1);
        cat.items.splice(newItemIdx, 0, moved);
        refreshItemsList(catBlock, cat, catIdx);
        setDirty(true);
        adminTrack('admin_item_reorder', { catIdx, from: itemIdx, to: newItemIdx });
      }
    }

    itemsEl.addEventListener(
      'pointerdown',
      e => {
        const handle = e.target.closest('.item-block__drag');
        if (!handle) return;
        const block = handle.closest('.item-block');
        if (!block || !itemsEl.contains(block)) return;
        e.preventDefault();
        e.stopPropagation();
        const itemIdx = +block.dataset.itemIdx;
        if (Number.isNaN(itemIdx)) return;

        const rect = block.getBoundingClientRect();
        const placeholder = document.createElement('div');
        placeholder.className = 'item-drag-placeholder';
        placeholder.style.height = rect.height + 'px';
        block.parentNode.insertBefore(placeholder, block.nextSibling);

        block.classList.add('item-dragging');
        block.style.position = 'fixed';
        block.style.left = rect.left + 'px';
        block.style.top = rect.top + 'px';
        block.style.width = rect.width + 'px';
        block.style.zIndex = '9999';
        block.style.pointerEvents = 'none';
        document.body.appendChild(block);

        drag = { block, placeholder, itemIdx, blockOffsetY: e.clientY - rect.top };

        document.addEventListener('pointermove', onMove, { passive: false });
        document.addEventListener('pointerup', onUp, { once: true });
        document.addEventListener('pointercancel', onUp, { once: true });
      },
      { capture: true, signal, passive: false }
    );
  }

  /* ── ENUM DICTIONARY HELPERS ─────────────────────────────── */

  /**
   * Returns the menu.enums object, creating it if absent.
   */
  function getEnums() {
    const menu = menuData.restaurant.menu;
    if (!menu.enums) menu.enums = { tags: [], ingredients: [], allergens: [] };
    if (!menu.enums.tags) menu.enums.tags = [];
    if (!menu.enums.ingredients) menu.enums.ingredients = [];
    if (!menu.enums.allergens) menu.enums.allergens = [];
    return menu.enums;
  }

  /**
   * Counts how many items across all categories use each enum entry.
   * Returns Map<en_value, count>.
   */
  function countEnumUsage(field) {
    const counts = new Map();
    (menuData.restaurant.menu.categories || []).forEach(cat => {
      (cat.items || []).forEach(item => {
        ((item[field]) || []).forEach(e => {
          const key = (e.en || '').toLowerCase();
          if (key) counts.set(key, (counts.get(key) || 0) + 1);
        });
      });
    });
    return counts;
  }

  /**
   * Returns the enum dictionary for `field` sorted by frequency desc, then alpha.
   * Merges dictionary entries with any values found on items (so nothing is lost).
   */
  function getSortedEnums(field) {
    const enums  = getEnums();
    const dict   = enums[field] || [];
    const counts = countEnumUsage(field);

    // Collect all known entries (dict + any on items not yet in dict)
    const seen = new Map(); // key = en.toLowerCase() → {en, bg}
    dict.forEach(e => { if (e.en) seen.set(e.en.toLowerCase(), e); });
    (menuData.restaurant.menu.categories || []).forEach(cat => {
      (cat.items || []).forEach(item => {
        ((item[field]) || []).forEach(e => {
          const k = (e.en || '').toLowerCase();
          if (k && !seen.has(k)) seen.set(k, e);
        });
      });
    });

    return [...seen.values()].sort((a, b) => {
      const ca = counts.get((a.en || '').toLowerCase()) || 0;
      const cb = counts.get((b.en || '').toLowerCase()) || 0;
      if (cb !== ca) return cb - ca;          // frequency desc
      return (a.en || '').localeCompare(b.en || '');  // alpha asc
    });
  }

  /**
   * Adds an entry to the enum dictionary if it doesn't already exist.
   * Returns the canonical {en, bg} entry.
   */
  function ensureInDict(field, entry) {
    const enums = getEnums();
    const dict  = enums[field];
    const key   = (entry.en || '').toLowerCase();
    const existing = dict.find(e => (e.en || '').toLowerCase() === key);
    if (!existing) {
      dict.push({ en: entry.en, bg: entry.bg || entry.en });
      return entry;
    }
    // Backfill missing translation
    if (!existing.bg && entry.bg) existing.bg = entry.bg;
    return existing;
  }

  /**
   * Searches the dictionary for `query` (matches en or bg, case-insensitive contains).
   * Returns sorted results.
   */
  function searchEnums(field, query) {
    const q = query.toLowerCase().trim();
    if (!q) return getSortedEnums(field);
    return getSortedEnums(field).filter(e =>
      (e.en || '').toLowerCase().includes(q) ||
      (e.bg || '').toLowerCase().includes(q)
    );
  }

  /* ── ENUM COMBOBOX WIDGET ─────────────────────────────────── */

  /**
   * Wires up the smart autocomplete combobox for tags or ingredients on an item block.
   * field: 'tags' | 'ingredients'
   *
   * UX flow:
   *  - Typing shows a dropdown of matching dict entries (search in EN or BG).
   *  - Selecting an existing entry adds it immediately (both langs auto-filled).
   *  - Typing something not in the dict reveals a second BG input so the user
   *    can optionally provide the translation before hitting "+ Add".
   */
  function wireEnumCombobox(block, field, item, catIdx, itemIdx) {
    const combobox = block.querySelector(`.enum-combobox[data-enum="${field}"]`);
    if (!combobox) return;

    const input    = combobox.querySelector('.enum-combobox__input');
    const addBtn   = combobox.querySelector('.enum-combobox__add-btn');
    const dropdown = combobox.querySelector('.enum-combobox__dropdown');
    // BG translation row — shown only for brand-new entries
    const bgRow    = combobox.querySelector('.enum-combobox__bg-row');
    const bgInput  = combobox.querySelector('.enum-combobox__bg-input');

    let highlightIdx  = -1;
    let isNewEntry    = false; // true when typed text doesn't match any dict entry

    function setNewEntryMode(on) {
      isNewEntry = on;
      if (bgRow) bgRow.classList.toggle('hidden', !on);
      if (!on && bgInput) bgInput.value = '';
    }

    function renderDropdown(results) {
      dropdown.innerHTML = '';
      if (!results.length) {
        dropdown.classList.add('hidden');
        return;
      }
      results.forEach((entry, i) => {
        const li = document.createElement('li');
        li.className = 'enum-dd__item';
        li.dataset.idx = i;
        const alreadyAdded = (item[field] || []).some(
          e => (e.en || '').toLowerCase() === (entry.en || '').toLowerCase()
        );
        li.innerHTML = `
          <span class="enum-dd__en">${esc(entry.en)}</span>
          ${entry.bg && entry.bg !== entry.en ? `<span class="enum-dd__bg">${esc(entry.bg)}</span>` : ''}
          ${alreadyAdded ? '<span class="enum-dd__badge">added</span>' : ''}
        `;
        if (alreadyAdded) li.classList.add('enum-dd__item--added');
        li.addEventListener('mousedown', e => {
          e.preventDefault(); // don't blur input
          selectEntry(entry);
        });
        dropdown.appendChild(li);
      });
      dropdown.classList.remove('hidden');
      highlightIdx = -1;
    }

    function updateHighlight(newIdx) {
      const items = dropdown.querySelectorAll('.enum-dd__item');
      items.forEach((li, i) => li.classList.toggle('enum-dd__item--focused', i === newIdx));
      highlightIdx = newIdx;
    }

    function selectEntry(entry) {
      if (!item[field]) item[field] = [];
      const already = item[field].some(
        e => (e.en || '').toLowerCase() === (entry.en || '').toLowerCase()
      );
      if (already) { input.value = ''; setNewEntryMode(false); closeDropdown(); return; }

      // Ensure in dict and get canonical entry (may backfill bg)
      const canonical = ensureInDict(field, entry);
      item[field].push({ en: canonical.en, bg: canonical.bg || canonical.en });
      input.value = '';
      setNewEntryMode(false);
      closeDropdown();
      if (field === 'tags') {
        renderItemTags(block, item, catIdx, itemIdx);
        adminTrack('admin_tag_add', { tag_en: canonical.en.slice(0, 60) });
      } else {
        renderItemIngredients(block, item, catIdx, itemIdx);
        adminTrack('admin_ingredient_add', { ingredient_en: canonical.en.slice(0, 60) });
      }
      setDirty(true);
    }

    function addFromInput() {
      const raw = input.value.trim();
      if (!raw) return;
      // Check if it matches an existing dict entry (either lang)
      const match = getSortedEnums(field).find(e =>
        (e.en || '').toLowerCase() === raw.toLowerCase() ||
        (e.bg || '').toLowerCase() === raw.toLowerCase()
      );
      if (match) {
        selectEntry(match);
      } else {
        // New entry — use bgInput value if provided
        const bgVal = bgInput ? bgInput.value.trim() : '';
        selectEntry({ en: raw, bg: bgVal });
      }
    }

    function closeDropdown() {
      dropdown.classList.add('hidden');
      dropdown.innerHTML = '';
      highlightIdx = -1;
    }

    input.addEventListener('input', () => {
      const raw = input.value.trim();
      const results = searchEnums(field, raw);
      renderDropdown(results);

      // Show BG input only when text is non-empty AND not an exact dict match
      if (raw) {
        const exactMatch = getSortedEnums(field).some(
          e => (e.en || '').toLowerCase() === raw.toLowerCase() ||
               (e.bg || '').toLowerCase() === raw.toLowerCase()
        );
        setNewEntryMode(!exactMatch);
      } else {
        setNewEntryMode(false);
      }
    });

    input.addEventListener('focus', () => {
      const results = searchEnums(field, input.value);
      renderDropdown(results);
    });

    input.addEventListener('keydown', e => {
      const items = dropdown.querySelectorAll('.enum-dd__item');
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        updateHighlight(Math.min(highlightIdx + 1, items.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        updateHighlight(Math.max(highlightIdx - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (highlightIdx >= 0 && items[highlightIdx]) {
          items[highlightIdx].dispatchEvent(new MouseEvent('mousedown'));
        } else {
          addFromInput();
        }
      } else if (e.key === 'Escape') {
        closeDropdown();
      }
    });

    input.addEventListener('blur', () => {
      // Small delay so mousedown on dropdown item fires first
      setTimeout(closeDropdown, 150);
    });

    if (bgInput) {
      bgInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); addFromInput(); }
      });
    }

    addBtn.addEventListener('click', addFromInput);
  }

  /* ── ENUM NATIVE SELECT WIDGET ─────────────────────────────── */
  function wireEnumNativeSelect(block, field, item, catIdx, itemIdx) {
    const widget = block.querySelector(`.enum-native[data-enum="${field}"]`);
    if (!widget) return;

    const select         = widget.querySelector('.enum-native__select');
    const addSelectedBtn = widget.querySelector('.enum-native__add-selected');
    const newEnInput     = widget.querySelector('.enum-native__new-en');
    const newBgInput     = widget.querySelector('.enum-native__new-bg');
    const addNewBtn      = widget.querySelector('.enum-native__add-new');

    if (!select || !addSelectedBtn || !newEnInput || !addNewBtn) return;

    function placeholderText() {
      if (field === 'tags') return tr('selectTag');
      if (field === 'ingredients') return tr('selectIngredient');
      if (field === 'allergens') return tr('selectAllergen');
      return adminLang === 'bg' ? 'Избери…' : 'Select…';
    }

    function populateSelect() {
      const prev = select.value;
      const entries = getSortedEnums(field);
      select.innerHTML = '';

      const ph = document.createElement('option');
      ph.value = '';
      ph.textContent = placeholderText();
      select.appendChild(ph);

      entries.forEach(entry => {
        const en = String(entry.en || '').trim();
        if (!en) return;
        const bg = String(entry.bg || entry.en || '').trim() || en;
        const opt = document.createElement('option');
        opt.value = en;
        opt.dataset.bg = bg;
        opt.textContent = (bg && bg !== en) ? `${en} / ${bg}` : en;
        select.appendChild(opt);
      });

      if (prev) select.value = prev;
    }

    function addToItem(entry) {
      if (!entry) return;
      const en = String(entry.en || '').trim();
      if (!en) return;
      const bg = entry.bg ? String(entry.bg).trim() : '';

      if (!item[field]) item[field] = [];
      const exists = item[field].some(e =>
        String(e.en || '').toLowerCase() === en.toLowerCase()
      );
      if (exists) return;

      const canonical = ensureInDict(field, { en, bg: bg || undefined });
      item[field].push({ en: canonical.en, bg: canonical.bg || canonical.en });

      if (field === 'tags') {
        renderItemTags(block, item, catIdx, itemIdx);
        adminTrack('admin_tag_add', { tag_en: canonical.en.slice(0, 60) });
      } else if (field === 'ingredients') {
        renderItemIngredients(block, item, catIdx, itemIdx);
        adminTrack('admin_ingredient_add', { ingredient_en: canonical.en.slice(0, 60) });
      } else if (field === 'allergens') {
        renderItemAllergens(block, item, catIdx, itemIdx);
        adminTrack('admin_allergen_add', { allergen_en: canonical.en.slice(0, 60) });
      }

      setDirty(true);
      populateSelect();

      // Clear inputs
      select.value = '';
      newEnInput.value = '';
      if (newBgInput) newBgInput.value = '';
    }

    function addSelected() {
      const en = select.value;
      if (!en) return;
      const opt = select.selectedOptions && select.selectedOptions[0];
      const bg = opt ? (opt.dataset.bg || en) : en;
      addToItem({ en, bg });
    }

    function addNew() {
      const en = newEnInput.value.trim();
      if (!en) return;
      const bg = newBgInput ? newBgInput.value.trim() : '';
      addToItem({ en, bg });
    }

    addSelectedBtn.addEventListener('click', addSelected);
    addNewBtn.addEventListener('click', addNew);
    newEnInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        addNew();
      }
    });

    populateSelect();
  }

  /* ── RENDER ITEM TAGS ─────────────────────────────────────── */
  function buildEnumChip(entry, onRemove) {
    const chip = document.createElement('span');
    chip.className = 'item-tag-chip';
    chip.innerHTML = `
      <span class="item-tag-chip__en">${esc(entry.en)}</span>
      ${entry.bg && entry.bg !== entry.en ? `<span class="item-tag-chip__bg">/ ${esc(entry.bg)}</span>` : ''}
      <button class="item-tag-chip__del" type="button" title="Remove">×</button>
    `;
    chip.querySelector('.item-tag-chip__del').addEventListener('click', e => {
      e.stopPropagation();
      onRemove();
    });
    return chip;
  }

  function buildItemBlock(item, itemIdx, cat, catIdx, catBlock) {
    const block = document.createElement('div');
    block.className = 'item-block';
    block.dataset.itemIdx = String(itemIdx);
    block.dataset.catIdx = String(catIdx);

    const price   = typeof item.price === 'number' ? item.price.toFixed(2) : '0.00';
    const currencyCfg = normalizeCurrencyConfig(menuData.restaurant.menu.config?.currencies || {}, currentRestaurant);
    const baseSymbol = currencyMeta(currencyCfg.base, currentRestaurant).symbol || currencyCfg.base;
    const nameTxt = item.name.en || 'New item';

    // Generate quantity metric options
    const metricsOptions = quantityMetrics.map(m =>
      `<option value="${esc(m.code)}" ${item.quantity?.metric === m.code ? 'selected' : ''}>${esc((m.description && (m.description[adminLang] || m.description.en)) || m.code)} (${esc((m.label && (m.label[adminLang] || m.label.en)) || m.code)})</option>`
    ).join('');

    const nameFirstIsBg = isBgFirst();
    const nameFields = nameFirstIsBg
      ? `
            <div class="item-field-row">
              <label>${esc(tr('nameBulgarian'))}</label>
              <input class="item-name-bg" type="text" value="${esc(item.name.bg || '')}" placeholder="${esc(tr('itemBgNamePh'))}" />
            </div>
            <div class="item-field-row">
              <label>${esc(tr('nameEnglish'))}</label>
              <input class="item-name-en" type="text" value="${esc(item.name.en || '')}" placeholder="${esc(tr('itemNamePh'))}" />
            </div>
      `
      : `
            <div class="item-field-row">
              <label>${esc(tr('nameEnglish'))}</label>
              <input class="item-name-en" type="text" value="${esc(item.name.en || '')}" placeholder="${esc(tr('itemNamePh'))}" />
            </div>
            <div class="item-field-row">
              <label>${esc(tr('nameBulgarian'))}</label>
              <input class="item-name-bg" type="text" value="${esc(item.name.bg || '')}" placeholder="${esc(tr('itemBgNamePh'))}" />
            </div>
      `;
    const descFields = nameFirstIsBg
      ? `
            <div class="item-field-row">
              <label>${esc(tr('descBulgarian'))}</label>
              <textarea class="item-desc-bg" placeholder="${esc(tr('itemBgDescPh'))}">${esc(item.description ? item.description.bg || '' : '')}</textarea>
            </div>
            <div class="item-field-row">
              <label>${esc(tr('descEnglish'))}</label>
              <textarea class="item-desc-en" placeholder="${esc(tr('itemDescPh'))}">${esc(item.description ? item.description.en || '' : '')}</textarea>
            </div>
      `
      : `
            <div class="item-field-row">
              <label>${esc(tr('descEnglish'))}</label>
              <textarea class="item-desc-en" placeholder="${esc(tr('itemDescPh'))}">${esc(item.description ? item.description.en || '' : '')}</textarea>
            </div>
            <div class="item-field-row">
              <label>${esc(tr('descBulgarian'))}</label>
              <textarea class="item-desc-bg" placeholder="${esc(tr('itemBgDescPh'))}">${esc(item.description ? item.description.bg || '' : '')}</textarea>
            </div>
      `;

    block.innerHTML = `
      <div class="item-block__header">
        <span class="item-block__drag" title="${adminLang === 'bg' ? 'Плъзни за подредба' : 'Drag to reorder'}">⠿</span>
        <span class="item-block__name">${esc(nameTxt)}</span>
        <span class="item-block__price">${price}${esc(baseSymbol)}</span>
        <span class="item-availability${item.availability ? '' : ' unavailable'}" title="${item.availability ? 'Available' : 'Unavailable'}"></span>
        <span class="item-block__chevron">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 4l4 4 4-4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </span>
      </div>
      <div class="item-block__body"><div class="item-block__body-inner">
        <div class="item-fields">
          <div class="item-field-2col">
            ${nameFields}
          </div>
          <div class="item-field-2col">
            ${descFields}
          </div>
          <div class="item-field-price-row">
            <div class="item-field-row">
              <label>Price (${esc(baseSymbol)})</label>
              <input class="item-price" type="number" min="0" step="0.01" value="${price}" />
            </div>
            <div class="item-avail-toggle">
              <input type="checkbox" class="item-avail-cb" id="avail-${catIdx}-${itemIdx}" ${item.availability ? 'checked' : ''} />
              <label for="avail-${catIdx}-${itemIdx}">Available</label>
            </div>
          </div>
          <div class="item-field-quantity-row">
            <div class="item-field-row">
              <label>${esc(tr('quantity'))}</label>
              <input class="item-quantity-value" type="number" min="0" step="0.1" value="${item.quantity?.value || ''}" placeholder="${esc(tr('quantityPh'))}" />
            </div>
            <div class="item-field-row">
              <label>${esc(tr('unit'))}</label>
              <select class="item-quantity-metric">
                <option value="">None</option>
                ${metricsOptions}
              </select>
            </div>
          </div>
          <div class="item-field-row">
            <label>Tags</label>
            <div class="item-tags-wrap">
              <div class="item-tags-list" id="tags-${catIdx}-${itemIdx}"></div>
              <div class="enum-native" data-enum="tags" data-cat="${catIdx}" data-item="${itemIdx}">
                <div class="enum-native__row">
                  <select class="enum-native__select" aria-label="Select tag"></select>
                  <button class="enum-native__add-selected" type="button">+ Add</button>
                </div>
                <div class="enum-native__row">
                  <input type="text" class="enum-native__new-en" placeholder="New tag (EN)" autocomplete="off" />
                </div>
                <div class="enum-native__row">
                  <input type="text" class="enum-native__new-bg" placeholder="BG translation (optional)" autocomplete="off" />
                </div>
                <div class="enum-native__row">
                  <button class="enum-native__add-new" type="button">Add new</button>
                </div>
              </div>
            </div>
          </div>
          <div class="item-field-row">
            <label>Ingredients</label>
            <div class="item-tags-wrap">
              <div class="item-tags-list" id="ingredients-${catIdx}-${itemIdx}"></div>
              <div class="enum-native" data-enum="ingredients" data-cat="${catIdx}" data-item="${itemIdx}">
                <div class="enum-native__row">
                  <select class="enum-native__select" aria-label="Select ingredient"></select>
                  <button class="enum-native__add-selected" type="button">+ Add</button>
                </div>
                <div class="enum-native__row">
                  <input type="text" class="enum-native__new-en" placeholder="New ingredient (EN)" autocomplete="off" />
                </div>
                <div class="enum-native__row">
                  <input type="text" class="enum-native__new-bg" placeholder="BG translation (optional)" autocomplete="off" />
                </div>
                <div class="enum-native__row">
                  <button class="enum-native__add-new" type="button">Add new</button>
                </div>
              </div>
            </div>
          </div>
          <div class="item-field-row">
            <label>Allergens</label>
            <div class="item-tags-wrap">
              <div class="item-tags-list" id="allergens-${catIdx}-${itemIdx}"></div>
              <div class="enum-native" data-enum="allergens" data-cat="${catIdx}" data-item="${itemIdx}">
                <div class="enum-native__row">
                  <select class="enum-native__select" aria-label="Select allergen"></select>
                  <button class="enum-native__add-selected" type="button">+ Add</button>
                </div>
                <div class="enum-native__row">
                  <input type="text" class="enum-native__new-en" placeholder="New allergen (EN)" autocomplete="off" />
                </div>
                <div class="enum-native__row">
                  <input type="text" class="enum-native__new-bg" placeholder="BG translation (optional)" autocomplete="off" />
                </div>
                <div class="enum-native__row">
                  <button class="enum-native__add-new" type="button">Add new</button>
                </div>
              </div>
            </div>
          </div>
          <div class="item-field-row item-field-row--image">
            <label>
              Image
              <span class="field-label__hint">Paste a URL or upload to Cloudinary (max 5 MB)</span>
            </label>
            <div class="field-url-wrap">
              <div class="field-url-input-row">
                <input class="item-img-input field-input" type="text"
                       value="${esc(item.image || '')}"
                       placeholder="https://res.cloudinary.com/… or paste any URL" />
                <button class="btn-upload-img item-img-upload" type="button" title="Upload to Cloudinary">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></svg>
                  Upload
                </button>
              </div>
              <div class="item-img-preview field-url-preview"></div>
            </div>
          </div>
        </div>
        <div class="item-actions">
          <button class="btn-delete-item">${adminLang === 'bg' ? 'Изтрий продукт' : 'Delete item'}</button>
        </div>
      </div></div>
    `;

    // Expand/collapse (ignore clicks from drag handle)
    block.querySelector('.item-block__header').addEventListener('click', e => {
      if (e.target.closest('.item-block__drag')) return;
      block.classList.toggle('open');
    });

    // Name EN
    block.querySelector('.item-name-en').addEventListener('input', e => {
      item.name.en = e.target.value;
      block.querySelector('.item-block__name').textContent = e.target.value || 'New item';
      setDirty(true);
    });
    block.querySelector('.item-name-bg').addEventListener('input', e => {
      item.name.bg = e.target.value;
      setDirty(true);
    });

    // Description
    block.querySelector('.item-desc-en').addEventListener('input', e => {
      if (!item.description) item.description = {};
      item.description.en = e.target.value;
      setDirty(true);
    });
    block.querySelector('.item-desc-bg').addEventListener('input', e => {
      if (!item.description) item.description = {};
      item.description.bg = e.target.value;
      setDirty(true);
    });

    // Price
    block.querySelector('.item-price').addEventListener('input', e => {
      item.price = parseFloat(e.target.value) || 0;
      block.querySelector('.item-block__price').textContent = item.price.toFixed(2) + baseSymbol;
      setDirty(true);
    });

    // Availability
    block.querySelector('.item-avail-cb').addEventListener('change', e => {
      item.availability = e.target.checked;
      block.querySelector('.item-availability').classList.toggle('unavailable', !e.target.checked);
      setDirty(true);
    });

    // Quantity
    block.querySelector('.item-quantity-metric').addEventListener('change', e => {
      if (!item.quantity) item.quantity = {};
      item.quantity.metric = e.target.value || undefined;
      setDirty(true);
    });

    block.querySelector('.item-quantity-value').addEventListener('input', e => {
      if (!item.quantity) item.quantity = {};
      const val = parseFloat(e.target.value);
      item.quantity.value = isNaN(val) || val === 0 ? undefined : val;
      setDirty(true);
    });

    // Tags
    renderItemTags(block, item, catIdx, itemIdx);
    wireEnumNativeSelect(block, 'tags', item, catIdx, itemIdx);

    // Ingredients
    renderItemIngredients(block, item, catIdx, itemIdx);
    wireEnumNativeSelect(block, 'ingredients', item, catIdx, itemIdx);

    // Allergens
    renderItemAllergens(block, item, catIdx, itemIdx);
    wireEnumNativeSelect(block, 'allergens', item, catIdx, itemIdx);

    // Item image URL + upload
    const imgInput   = block.querySelector('.item-img-input');
    const imgPreview = block.querySelector('.item-img-preview');
    const imgUpload  = block.querySelector('.item-img-upload');

    if (imgInput.value) showPreview(imgPreview, imgInput.value.trim());

    imgInput.addEventListener('input', e => {
      item.image = e.target.value.trim() || undefined;
      showPreview(imgPreview, e.target.value.trim());
      setDirty(true);
    });

    imgUpload.addEventListener('click', () => {
      const folder = `restaurant_menu/${currentRestaurant?.id || 'items'}/items`;
      triggerImageUpload(imgInput, imgPreview, folder);
    });

    // Delete item
    block.querySelector('.btn-delete-item').addEventListener('click', async () => {
      const ok = await confirm(`Delete "${item.name.en || 'this item'}"?`);
      if (!ok) return;
      adminTrack('admin_item_delete', { item_name: String(item.name.en || '').slice(0, 80) });
      cat.items.splice(itemIdx, 1);
      refreshItemsList(catBlock, cat, catIdx);
      setDirty(true);
    });

    return block;
  }

  function renderItemTags(itemBlock, item, catIdx, itemIdx) {
    const list = itemBlock.querySelector(`#tags-${catIdx}-${itemIdx}`);
    if (!list) return;
    list.innerHTML = '';
    (item.tags || []).forEach((tag, tagIdx) => {
      list.appendChild(buildEnumChip(tag, () => {
        adminTrack('admin_tag_remove', { tag_en: String(tag.en || '').slice(0, 60) });
        item.tags.splice(tagIdx, 1);
        renderItemTags(itemBlock, item, catIdx, itemIdx);
        setDirty(true);
      }));
    });
  }

  function renderItemIngredients(itemBlock, item, catIdx, itemIdx) {
    const list = itemBlock.querySelector(`#ingredients-${catIdx}-${itemIdx}`);
    if (!list) return;
    list.innerHTML = '';
    (item.ingredients || []).forEach((ing, ingIdx) => {
      list.appendChild(buildEnumChip(ing, () => {
        adminTrack('admin_ingredient_remove', { ingredient_en: String(ing.en || '').slice(0, 60) });
        item.ingredients.splice(ingIdx, 1);
        renderItemIngredients(itemBlock, item, catIdx, itemIdx);
        setDirty(true);
      }));
    });
  }

  function renderItemAllergens(itemBlock, item, catIdx, itemIdx) {
    const list = itemBlock.querySelector(`#allergens-${catIdx}-${itemIdx}`);
    if (!list) return;
    list.innerHTML = '';
    (item.allergens || []).forEach((al, alIdx) => {
      list.appendChild(buildEnumChip(al, () => {
        adminTrack('admin_allergen_remove', { allergen_en: String(al.en || '').slice(0, 60) });
        item.allergens.splice(alIdx, 1);
        renderItemAllergens(itemBlock, item, catIdx, itemIdx);
        setDirty(true);
      }));
    });
  }

  /* ── ADD CATEGORY ────────────────────────────────────────── */
  document.getElementById('addCategoryBtn').addEventListener('click', () => {
    adminTrack('admin_category_add', {});
    switchTab('categories');
    const cats = menuData.restaurant.menu.categories;
    const newId = 'category_' + Date.now();
    cats.push({ id: newId, name: { en: '', bg: '' }, items: [] });
    renderCategories(cats);
    setDirty(true);
    // Open and scroll to new block
    const last = categoriesList.lastElementChild;
    if (last) {
      last.classList.add('open');
      setTimeout(() => last.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
      last.querySelector('.cat-name-en').focus();
    }
  });

  /* ── COLLECT FORM DATA ───────────────────────────────────── */
  function collectFormData() {
    const r = menuData.restaurant;
    r.name.en = document.getElementById('infoNameEn').value.trim();
    r.name.bg = document.getElementById('infoNameBg').value.trim();
    r.description.en = document.getElementById('infoDescEn').value.trim();
    r.description.bg = document.getElementById('infoDescBg').value.trim();
    r.menu.theme = document.getElementById('infoTheme').value;
    r.default_language = document.getElementById('infoLang').value;
    r.logo             = document.getElementById('infoLogo').value.trim();
    r.image            = document.getElementById('infoImage').value.trim();
    r.background_image = document.getElementById('infoBgImage').value.trim();
    r.menu.config.show_price       = document.getElementById('cfgPrice').checked;
    r.menu.config.show_description = document.getElementById('cfgDesc').checked;
    r.menu.config.show_tags        = document.getElementById('cfgTags').checked;
    r.menu.config.show_ingredients = document.getElementById('cfgIngredients').checked;
    r.menu.config.show_allergens   = document.getElementById('cfgAllergens').checked;
    if (!r.menu.config.currencies) r.menu.config.currencies = {};
    r.menu.config.currencies = normalizeCurrencyConfig(r.menu.config.currencies, currentRestaurant);
    const tzEl = document.getElementById('cfgTimezone');
    if (tzEl) r.menu.config.timezone = tzEl.value || 'Europe/Sofia';
    // Categories and items are already mutated in-place
  }

  /* ── SAVE TO BACKEND (JPA) ───────────────────────────────── */
  saveBtn.addEventListener('click', async () => {
    collectFormData();
    saveBtn.disabled = true;
    saveBtn.textContent = adminLang === 'bg' ? 'Запазване…' : 'Saving…';
    adminTrack('admin_save_attempt', {});

    const r = currentRestaurant;
    if (!getAuthToken()) {
      adminTrack('admin_save_blocked', { reason: 'no_token' });
      showToast(adminLang === 'bg' ? 'Няма сесия — влез отново.' : 'Not signed in — open the login screen again.', 'error');
      saveBtn.disabled = false;
      saveBtn.textContent = tr('save');
      return;
    }
    if (!getMenuApiBase()) {
      showToast('Menu API base not configured.', 'error');
      saveBtn.disabled = false;
      saveBtn.textContent = tr('save');
      return;
    }

    try {
      const payload = buildMenuPayloadForApi(menuData);
      const res = await fetch(`${getMenuApiBase()}/api/admin/menu/${encodeURIComponent(r.id)}`, {
        method: 'PUT',
        headers: authJsonHeaders(),
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const detail = [err.message, err.error, Array.isArray(err.details) ? err.details.join('; ') : '']
          .filter(Boolean)
          .join(' — ');
        throw new Error(detail || `HTTP ${res.status}`);
      }

      const cacheVersion = 'v3';
      try { sessionStorage.removeItem(`menu_${cacheVersion}_${r.id}`); } catch (_) {}
      try { sessionStorage.removeItem(`menu_rev_${cacheVersion}_${r.id}`); } catch (_) {}

      setDirty(false);
      adminTrack('admin_save_success', {});
      showToast('Menu saved successfully! Changes are now live.', 'success');
    } catch (err) {
      adminTrack('admin_save_fail', { message: err.message || 'error' });
      showToast('Save failed: ' + err.message, 'error');
    } finally {
      saveBtn.textContent = tr('save');
      saveBtn.disabled = false;
    }
  });

  /* ── ESCAPE HTML ─────────────────────────────────────────── */
  function esc(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* ── WARN ON UNLOAD ──────────────────────────────────────── */
  window.addEventListener('beforeunload', e => {
    if (isDirty) { e.preventDefault(); e.returnValue = ''; }
  });

  /* ── Nav bar (single delegation — avoids duplicate listeners on re-open) ── */
  document.getElementById('editorNav').addEventListener('click', e => {
    const item = e.target.closest('.editor-nav__item');
    if (!item || !item.dataset.tab) return;
    switchTab(item.dataset.tab);
  });

  /* ── Debounced “any field changed” while editor is open ── */
  editorScreen.addEventListener('input', e => {
    if (editorScreen.classList.contains('hidden')) return;
    const el = e.target;
    const hint = el.id || (el.className && String(el.className).split(/\s+/)[0]) || el.name || el.tagName;
    clearTimeout(adminEditDebounce);
    adminEditDebounce = setTimeout(() => {
      adminTrack('admin_change', {
        field:      String(hint).slice(0, 80),
        change_src: 'input'
      });
    }, 1400);
  }, true);

  editorScreen.addEventListener('change', e => {
    if (editorScreen.classList.contains('hidden')) return;
    const el = e.target;
    const hint = el.id || el.type || el.tagName;
    adminTrack('admin_change', {
      field:      String(hint).slice(0, 80),
      change_src: 'change'
    });
  }, true);

  previewLink.addEventListener('click', () => {
    adminTrack('admin_preview_click', { target: 'menu' });
  });

  window.addEventListener('load', () => {
    adminTrack('admin_app_ready', { surface: 'admin_panel' });
  });

  /* ── INIT ────────────────────────────────────────────────── */
  authSignInBtn?.addEventListener('click', async () => {
    await handleSignIn(authSignInBtn);
  });
  authSignOutBtn?.addEventListener('click', () => signOutSession());

  adminLangToggleAuth?.addEventListener('click', () => applyAdminLang(adminLang === 'bg' ? 'en' : 'bg'));
  adminLangToggleEditor?.addEventListener('click', () => applyAdminLang(adminLang === 'bg' ? 'en' : 'bg'));
  applyAdminLang(adminLang, false);

  (async () => {
    const restored = await restoreSessionIfPossible();
    if (!restored) {
      showCredentialsUi();
    }
  })();
})();
