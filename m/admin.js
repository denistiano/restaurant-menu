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
        'Use the staff username and password you were given. Your venues appear after you sign in.',
      signIn: 'Sign in',
      sessionRestoreHint: 'Restoring your session…',
      chooseWorkspaceHint:
        'Your first linked venue opens automatically (same order as returned for your account). With several venues, hold the Venue button in the staff bar (~0.5s) to pick one, or use the list below when you are on this screen.',
      superOnlyHint:
        'No venues are linked to this account yet. Open Users in the staff bar if you need to manage staff accounts.',
      signOut: 'Sign out',
      openEditor: 'Open editor',
      incorrectPassword: 'Incorrect admin password',
      editorRestaurantTab: 'Restaurant',
      editorInfoTab: 'Info',
      editorSettingsTab: 'Settings',
      editorMenuTab: 'Menu',
      editorQrTab: 'QR',
      editorLayoutTab: 'Layout',
      editorReservationsTab: 'Reservations',
      editorNotificationsTab: 'Notifications',
      restaurantHubNavLabel: 'Venue',
      restaurantHubSheetTitle: 'Venue',
      restaurantHubNavAria: 'Venue: tap for sections, hold ~0.5s to switch workspace (when you have several)',
      restaurantHubNavAnchorAria: 'Venue — menu editor home',
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
      nameTurkish: 'Name (Turkish)',
      nameRussian: 'Name (Russian)',
      nameGreek: 'Name (Greek)',
      descEnglish: 'Description (English)',
      descBulgarian: 'Description (Bulgarian)',
      descTurkish: 'Description (Turkish)',
      descRussian: 'Description (Russian)',
      descGreek: 'Description (Greek)',
      itemNamePh: 'Item name',
      itemBgNamePh: 'Наименование',
      itemTrNamePh: 'Ürün adı',
      itemRuNamePh: 'Название',
      itemElNamePh: 'Όνομα',
      itemDescPh: 'Short description...',
      itemBgDescPh: 'Кратко описание...',
      itemTrDescPh: 'Kısa açıklama…',
      itemRuDescPh: 'Краткое описание…',
      itemElDescPh: 'Σύντομη περιγραφή…',
      categoryEnglish: 'English name',
      categoryBulgarian: 'Bulgarian name',
      categoryTurkish: 'Turkish name',
      categoryRussian: 'Russian name',
      categoryGreek: 'Greek name',
      categoryEnPh: 'Category name',
      categoryBgPh: 'Категория',
      categoryTrPh: 'Kategori',
      categoryRuPh: 'Категория',
      categoryElPh: 'Κατηγορία',
      quantity: 'Quantity',
      unit: 'Unit',
      quantityPh: 'e.g. 250',
      selectTag: 'Select tag…',
      selectIngredient: 'Select ingredient…',
      selectAllergen: 'Select allergen…',
      workspacePickerTitle: 'Workspaces',
      workspaceSearchPlaceholder: 'Search by name or ID…',
      chooseWorkspaceBtn: 'Choose workspace',
      categorySettingsTitle: 'Category',
      categoryNamesSection: 'Names',
      categoryScheduleSection: 'Timed section',
      categoryReorderHint: 'Drag ⠿ on the category row to reorder in the list.',
      deleteCategory: 'Delete category',
      cfgLanguagesTitle: 'Menu languages',
      cfgLanguagesDesc: 'Guests only see languages you enable. At least one is required.',
      cfgReservationsTitle: 'Table reservations',
      cfgReservationsHint: 'Let guests open booking from the menu (⋯ menu)',
      cfgLangEnLabel: 'English',
      cfgLangBgLabel: 'Bulgarian',
      cfgLangEnHint: 'Menu copy in English',
      cfgLangBgHint: 'Menu copy in Bulgarian',
      cfgLangTrLabel: 'Turkish',
      cfgLangRuLabel: 'Russian',
      cfgLangElLabel: 'Greek',
      cfgLangTrHint: 'Menu copy in Turkish',
      cfgLangRuHint: 'Menu copy in Russian',
      cfgLangElHint: 'Menu copy in Greek',
      langMustPickOne: 'Choose at least one menu language.',
      staffAccountNavLabel: 'Account menu',
      staffAccountUserDetails: 'User details',
      staffAccountLogOut: 'Log out',
      userDetailsSheetTitle: 'Your account',
      userDetailsUsername: 'Username',
      userDetailsSuperAdmin: 'Full administrator',
      userDetailsVenues: 'Linked venues',
      userDetailsYes: 'Yes',
      userDetailsNo: 'No'
    },
    bg: {
      backToSite: '← Назад към сайта',
      signInTitle: 'Вход',
      authSub:
        'Използвай потребителското име и паролата, които си получил. Обектите се показват след вход.',
      signIn: 'Вход',
      sessionRestoreHint: 'Възстановяване на сесията…',
      chooseWorkspaceHint:
        'Първият свързан обект се отваря автоматично (редът е като при акаунта ти). При няколко обекта задрж бутона „Обект“ в долната лента (~0,5 s) за избор, или ползвай списъка по-долу, когато си тук.',
      superOnlyHint:
        'Все още няма свързани обекти. За управление на потребители отвори „Потребители“ в долната лента.',
      signOut: 'Изход',
      openEditor: 'Отвори редактора',
      incorrectPassword: 'Невалидна админ парола',
      editorRestaurantTab: 'Ресторант',
      editorInfoTab: 'Инфо',
      editorSettingsTab: 'Настройки',
      editorMenuTab: 'Меню',
      editorQrTab: 'QR',
      editorLayoutTab: 'Подредба',
      editorReservationsTab: 'Резервации',
      editorNotificationsTab: 'Известия',
      restaurantHubNavLabel: 'Обект',
      restaurantHubSheetTitle: 'Обект',
      restaurantHubNavAria: 'Обект: докосни за секции, задрж ~0,5 s за смяна на обект (при няколко)',
      restaurantHubNavAnchorAria: 'Обект — начало на редактора на менюто',
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
      nameTurkish: 'Име (Турски)',
      nameRussian: 'Име (Руски)',
      nameGreek: 'Име (Гръцки)',
      descEnglish: 'Описание (Английски)',
      descBulgarian: 'Описание (Български)',
      descTurkish: 'Описание (Турски)',
      descRussian: 'Описание (Руски)',
      descGreek: 'Описание (Гръцки)',
      itemNamePh: 'Име на продукт',
      itemBgNamePh: 'Наименование',
      itemTrNamePh: 'Ürün adı',
      itemRuNamePh: 'Название',
      itemElNamePh: 'Όνομα',
      itemDescPh: 'Кратко описание...',
      itemBgDescPh: 'Кратко описание...',
      itemTrDescPh: 'Kısa açıklama…',
      itemRuDescPh: 'Краткое описание…',
      itemElDescPh: 'Σύντομη περιγραφή…',
      categoryEnglish: 'Име на английски',
      categoryBulgarian: 'Име на български',
      categoryTurkish: 'Име на турски',
      categoryRussian: 'Име на руски',
      categoryGreek: 'Име на гръцки',
      categoryEnPh: 'Категория',
      categoryBgPh: 'Категория',
      categoryTrPh: 'Kategori',
      categoryRuPh: 'Категория',
      categoryElPh: 'Κατηγορία',
      quantity: 'Количество',
      unit: 'Мярка',
      quantityPh: 'напр. 250',
      selectTag: 'Избери таг…',
      selectIngredient: 'Избери съставка…',
      selectAllergen: 'Избери алерген…',
      workspacePickerTitle: 'Обекти',
      workspaceSearchPlaceholder: 'Търсене по име или ID…',
      chooseWorkspaceBtn: 'Избери обект',
      categorySettingsTitle: 'Категория',
      categoryNamesSection: 'Имена',
      categoryScheduleSection: 'Времева секция',
      categoryReorderHint: 'Плъзни ⠿ до реда на категорията за подредба в списъка.',
      deleteCategory: 'Изтрий категорията',
      cfgLanguagesTitle: 'Езици на менюто',
      cfgLanguagesDesc: 'Гостите виждат само избраните езици. Поне един е задължителен.',
      cfgReservationsTitle: 'Резервации на маса',
      cfgReservationsHint: 'Гостите отварят резервация от менюто (⋯ меню)',
      cfgLangEnLabel: 'Английски',
      cfgLangBgLabel: 'Български',
      cfgLangEnHint: 'Текстове на менюто на английски',
      cfgLangBgHint: 'Текстове на менюто на български',
      cfgLangTrLabel: 'Турски',
      cfgLangRuLabel: 'Руски',
      cfgLangElLabel: 'Гръцки',
      cfgLangTrHint: 'Текстове на турски',
      cfgLangRuHint: 'Текстове на руски',
      cfgLangElHint: 'Текстове на гръцки',
      langMustPickOne: 'Избери поне един език на менюто.',
      staffAccountNavLabel: 'Меню на акаунта',
      staffAccountUserDetails: 'Данни за акаунта',
      staffAccountLogOut: 'Изход',
      userDetailsSheetTitle: 'Твоят акаунт',
      userDetailsUsername: 'Потребителско име',
      userDetailsSuperAdmin: 'Пълен администратор',
      userDetailsVenues: 'Свързани обекти',
      userDetailsYes: 'Да',
      userDetailsNo: 'Не'
    }
  };
  const tr = (k) => (I18N[adminLang] && I18N[adminLang][k]) || I18N.en[k] || k;
  const isBgFirst = () => adminLang === 'bg';

  const KNOWN_MENU_LANGS = ['en', 'bg', 'tr', 'ru', 'el'];

  const MENU_LANG_OPTIONS = [
    { code: 'en', id: 'cfgLangEn' },
    { code: 'bg', id: 'cfgLangBg' },
    { code: 'tr', id: 'cfgLangTr' },
    { code: 'ru', id: 'cfgLangRu' },
    { code: 'el', id: 'cfgLangEl' }
  ];

  const ITEM_NAME_LABEL_KEY = {
    en: 'nameEnglish',
    bg: 'nameBulgarian',
    tr: 'nameTurkish',
    ru: 'nameRussian',
    el: 'nameGreek'
  };
  const ITEM_DESC_LABEL_KEY = {
    en: 'descEnglish',
    bg: 'descBulgarian',
    tr: 'descTurkish',
    ru: 'descRussian',
    el: 'descGreek'
  };
  const ITEM_NAME_PH_KEY = {
    en: 'itemNamePh',
    bg: 'itemBgNamePh',
    tr: 'itemTrNamePh',
    ru: 'itemRuNamePh',
    el: 'itemElNamePh'
  };
  const ITEM_DESC_PH_KEY = {
    en: 'itemDescPh',
    bg: 'itemBgDescPh',
    tr: 'itemTrDescPh',
    ru: 'itemRuDescPh',
    el: 'itemElDescPh'
  };
  const CAT_LABEL_KEY = {
    en: 'categoryEnglish',
    bg: 'categoryBulgarian',
    tr: 'categoryTurkish',
    ru: 'categoryRussian',
    el: 'categoryGreek'
  };
  const CAT_PH_KEY = {
    en: 'categoryEnPh',
    bg: 'categoryBgPh',
    tr: 'categoryTrPh',
    ru: 'categoryRuPh',
    el: 'categoryElPh'
  };

  function emptyLocalizedRecord() {
    const o = {};
    KNOWN_MENU_LANGS.forEach(c => {
      o[c] = '';
    });
    return o;
  }

  function langCap(code) {
    return code.charAt(0).toUpperCase() + code.slice(1);
  }

  /** Default language dropdown label in Restaurant → Appearance */
  function defaultLanguageOptionLabel(code) {
    const labels = {
      en: { en: 'English', bg: 'Английски' },
      bg: { en: 'Bulgarian', bg: 'Български' },
      tr: { en: 'Turkish', bg: 'Турски' },
      ru: { en: 'Russian', bg: 'Руски' },
      el: { en: 'Greek', bg: 'Гръцки' }
    };
    const row = labels[code];
    if (!row) return code.toUpperCase();
    return adminLang === 'bg' ? row.bg : row.en;
  }

  /** Normalized list of enabled menu language codes (subset of KNOWN_MENU_LANGS). Default: en+bg. */
  function normalizeEnabledLanguages(cfg) {
    const raw = cfg && cfg.enabled_languages;
    let list = [];
    if (Array.isArray(raw)) {
      list = raw
        .map(x => String(x).toLowerCase())
        .filter(c => KNOWN_MENU_LANGS.includes(c));
    }
    if (!list.length) return ['en', 'bg'];
    return [...new Set(list)].sort((a, b) => KNOWN_MENU_LANGS.indexOf(a) - KNOWN_MENU_LANGS.indexOf(b));
  }

  function getEnabledMenuLangsFromState() {
    return normalizeEnabledLanguages(menuData?.restaurant?.menu?.config);
  }

  /** Visible localized field order in admin (Restaurant / Menu tabs). */
  function orderEnabledLangsForFields(enabled) {
    const base = isBgFirst()
      ? ['bg', 'en', 'tr', 'ru', 'el']
      : ['en', 'bg', 'tr', 'ru', 'el'];
    return base.filter(code => enabled.includes(code));
  }

  /** First non-empty name for category/item header among enabled languages. */
  function primaryLocalizedName(nameObj, enabled) {
    if (!nameObj || typeof nameObj !== 'object') return '';
    for (const code of orderEnabledLangsForFields(enabled)) {
      const v = nameObj[code];
      if (v && String(v).trim()) return String(v).trim();
    }
    return String(
      nameObj.en || nameObj.bg || nameObj.tr || nameObj.ru || nameObj.el || ''
    ).trim();
  }

  function infoNameRowId(code) {
    return `infoName${langCap(code)}Row`;
  }

  function infoDescRowId(code) {
    return `infoDesc${langCap(code)}Row`;
  }

  /**
   * Show/hide localized info rows and default-language selector from Settings → Menu languages.
   */
  function applyInfoLanguageRows() {
    const enabled = getEnabledMenuLangsFromState();
    KNOWN_MENU_LANGS.forEach(code => {
      const show = enabled.includes(code);
      const nr = document.getElementById(infoNameRowId(code));
      if (nr) nr.classList.toggle('hidden', !show);
      const dr = document.getElementById(infoDescRowId(code));
      if (dr) dr.classList.toggle('hidden', !show);
    });

    const langRow = document.getElementById('infoLangRow');
    if (langRow) langRow.classList.toggle('hidden', enabled.length <= 1);

    const sel = document.getElementById('infoLang');
    if (sel) {
      const prev = sel.value;
      sel.innerHTML = '';
      enabled.forEach(code => {
        const opt = document.createElement('option');
        opt.value = code;
        opt.textContent = defaultLanguageOptionLabel(code);
        sel.appendChild(opt);
      });
      if (enabled.includes(prev)) sel.value = prev;
      else sel.value = enabled[0];
    }

    const nameParent = document.getElementById('infoNameEnRow')?.parentElement;
    const descParent = document.getElementById('infoDescEnRow')?.parentElement;
    const nameOrder = orderEnabledLangsForFields(enabled);
    const descOrder = orderEnabledLangsForFields(enabled);
    nameOrder.forEach(code => {
      const row = document.getElementById(infoNameRowId(code));
      if (row && !row.classList.contains('hidden') && nameParent) nameParent.appendChild(row);
    });
    descOrder.forEach(code => {
      const row = document.getElementById(infoDescRowId(code));
      if (row && !row.classList.contains('hidden') && descParent) descParent.appendChild(row);
    });
  }

  function onMenuLanguageTogglesChange(ev) {
    const anyChecked = MENU_LANG_OPTIONS.some(o => document.getElementById(o.id)?.checked);
    if (!anyChecked) {
      if (ev && ev.target) ev.target.checked = true;
      showToast(tr('langMustPickOne'), 'error');
      return;
    }
    const r = menuData?.restaurant;
    if (r?.menu) {
      if (!r.menu.config) r.menu.config = {};
      r.menu.config.enabled_languages = [];
      MENU_LANG_OPTIONS.forEach(({ code, id }) => {
        if (document.getElementById(id)?.checked) r.menu.config.enabled_languages.push(code);
      });
    }
    setDirty(true);
    applyInfoLanguageRows();
    const cats = menuData?.restaurant?.menu?.categories;
    if (cats && editorScreen && !editorScreen.classList.contains('hidden')) {
      renderCategories(cats);
    }
  }

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
  /** Last successful `/api/auth/me` payload (editor account menu / user sheet). */
  let cachedAuthMe = null;
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
  const authSessionBoot = document.getElementById('authSessionBoot');
  const authSessionBootText = document.getElementById('authSessionBootText');
  const postAuthPanel = document.getElementById('postAuthPanel');
  const postAuthHint = document.getElementById('postAuthHint');
  const superOnlyHint = document.getElementById('superOnlyHint');
  const authWorkspacePickBtn = document.getElementById('authWorkspacePickBtn');
  const authWorkspacePickLabel = document.getElementById('authWorkspacePickLabel');
  const authSignOutBtn = document.getElementById('authSignOutBtn');
  const authSignInBtn = document.getElementById('authSignInBtn');
  const authErrorEl      = document.getElementById('authError');
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
  const restaurantHubLayer = document.getElementById('restaurantHubLayer');
  const workspacePickerLayer = document.getElementById('workspacePickerLayer');
  const catSettingsLayer = document.getElementById('catSettingsLayer');
  const workspacePickerBackdrop = document.getElementById('workspacePickerBackdrop');
  const workspacePickerSheet = document.getElementById('workspacePickerSheet');
  const wsPickerTitle = document.getElementById('wsPickerTitle');
  const wsPickerSearch = document.getElementById('wsPickerSearch');
  const wsPickerList = document.getElementById('wsPickerList');
  const wsPickerClose = document.getElementById('wsPickerClose');
  const catSettingsBackdrop = document.getElementById('catSettingsBackdrop');
  const catSettingsSheet = document.getElementById('catSettingsSheet');
  const catSettingsBody = document.getElementById('catSettingsBody');
  const catSettingsTitle = document.getElementById('catSettingsTitle');
  const catSettingsClose = document.getElementById('catSettingsClose');
  const userDetailsLayer = document.getElementById('userDetailsLayer');
  const userDetailsSheet = document.getElementById('userDetailsSheet');
  const userDetailsBackdrop = document.getElementById('userDetailsBackdrop');
  const userDetailsBody = document.getElementById('userDetailsBody');
  const userDetailsClose = document.getElementById('userDetailsClose');
  const userDetailsTitle = document.getElementById('userDetailsTitle');
  const staffAccountMenuRoot = document.getElementById('staffAccountMenuRoot');
  const staffAccountMenuBackdrop = document.getElementById('staffAccountMenuBackdrop');
  const staffAccountNavBtn = document.getElementById('staffAccountNavBtn');
  const staffAccountBubble = document.getElementById('staffAccountBubble');
  const staffAccountMenuDetails = document.getElementById('staffAccountMenuDetails');
  const staffAccountMenuLogout = document.getElementById('staffAccountMenuLogout');
  const staffAccountNavLabel = document.getElementById('staffAccountNavLabel');
  let _workspacePickerContext = 'auth'; // 'auth' | 'editor'
  let _catSettingsIdx = -1;
  let _staffAccountMenuResizeBound = false;

  const ADMIN_SHEET_FALLBACK_MS = 480;

  function adminSheetLayerIsOpen(layer) {
    return !!(layer && layer.classList.contains('admin-sheet-layer--open'));
  }

  function openAdminSheetLayer(layer) {
    if (!layer) return;
    const panel = layer.querySelector('.admin-sheet-layer__panel');
    if (panel) {
      panel.style.transform = '';
      panel.style.transition = '';
    }
    layer.classList.remove('hidden');
    layer.setAttribute('aria-hidden', 'false');
    syncBodyScrollLock();
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        layer.classList.add('admin-sheet-layer--open');
      });
    });
  }

  /**
   * Close animated sheet layer (matches public menu item sheet: transform + backdrop fade).
   * @param {HTMLElement|null} layer
   * @param {HTMLElement|null} [panelEl] sheet panel (.admin-sheet-layer__panel)
   * @param {() => void} [afterHide] runs after layer is hidden (e.g. clear inner HTML)
   */
  function closeAdminSheetLayer(layer, panelEl, afterHide) {
    if (!layer) {
      afterHide?.();
      return;
    }
    const panel = panelEl || layer.querySelector('.admin-sheet-layer__panel');
    const finish = () => {
      layer.classList.add('hidden');
      layer.setAttribute('aria-hidden', 'true');
      layer.classList.remove('admin-sheet-layer--open');
      if (panel) {
        panel.style.transform = '';
        panel.style.transition = '';
      }
      syncBodyScrollLock();
      afterHide?.();
    };

    if (!adminSheetLayerIsOpen(layer)) {
      finish();
      return;
    }

    if (panel) {
      panel.style.transform = '';
      panel.style.transition = '';
    }
    layer.classList.remove('admin-sheet-layer--open');
    let done = false;
    const complete = () => {
      if (done) return;
      done = true;
      finish();
    };

    const t = setTimeout(complete, ADMIN_SHEET_FALLBACK_MS + 80);
    if (panel) {
      const onTe = (ev) => {
        if (ev.target !== panel) return;
        if (ev.propertyName !== 'transform' && ev.propertyName !== 'opacity') return;
        clearTimeout(t);
        panel.removeEventListener('transitionend', onTe);
        complete();
      };
      panel.addEventListener('transitionend', onTe);
    } else {
      clearTimeout(t);
      complete();
    }
  }

  function adminSheetSwipeBottomHubOrWs() {
    return window.matchMedia('(max-width: 639px)').matches;
  }
  function adminSheetSwipeBottomCat() {
    return window.matchMedia('(max-width: 559px)').matches;
  }

  /** Same thresholds as repos/fe/js/restaurant.js item modal (read-only reference). */
  function attachAdminSheetSwipeDown(sheet, scrollRoot, isBottomAnchored, runClose) {
    if (!sheet) return;
    let swipeStartY = 0;
    let swipeCurrent = 0;
    let swipeActive = false;

    sheet.addEventListener('touchstart', (e) => {
      if (!isBottomAnchored()) return;
      const root = typeof scrollRoot === 'function' ? scrollRoot() : scrollRoot;
      if (root && root.scrollTop > 0) return;
      swipeStartY = e.touches[0].clientY;
      swipeCurrent = swipeStartY;
      swipeActive = true;
      sheet.style.transition = 'none';
    }, { passive: true });

    sheet.addEventListener('touchmove', (e) => {
      if (!swipeActive) return;
      swipeCurrent = e.touches[0].clientY;
      const delta = Math.max(0, swipeCurrent - swipeStartY);
      sheet.style.transform = `translateY(${delta}px)`;
    }, { passive: true });

    sheet.addEventListener('touchend', () => {
      if (!swipeActive) return;
      swipeActive = false;
      sheet.style.transition = '';
      const delta = swipeCurrent - swipeStartY;
      if (delta > 110 || delta > sheet.offsetHeight * 0.28) {
        runClose();
      } else {
        sheet.style.transform = '';
      }
    });
  }

  function applyAdminLang(lang, rerender = true) {
    adminLang = (lang === 'bg') ? 'bg' : 'en';
    localStorage.setItem(ADMIN_LANG_KEY, adminLang);
    document.documentElement.lang = adminLang;
    const next = adminLang === 'bg' ? 'EN' : 'BG';
    if (adminLangToggleAuth) adminLangToggleAuth.textContent = next;
    if (adminLangToggleEditor) adminLangToggleEditor.textContent = next;
    applyStaticTranslations();

    applyInfoLanguageRows();

    if (rerender && menuData && !editorScreen.classList.contains('hidden')) {
      renderCategories(menuData.restaurant.menu.categories);
    }
    if (rerender && scopedRestaurantIds.length > 0) {
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
    if (authSessionBootText) authSessionBootText.textContent = tr('sessionRestoreHint');
    setText('authSignInBtn', 'signIn');
    setText('authError', 'incorrectPassword');
    const logo = document.getElementById('authLogoText');
    if (logo) logo.textContent = adminLang === 'bg' ? 'Съдържание' : 'Content';
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
    setText('cfgSectionLanguagesTitle', 'cfgLanguagesTitle');
    setText('cfgSectionLanguagesDesc', 'cfgLanguagesDesc');
    setText('cfgReservationsLabel', 'cfgReservationsTitle');
    setText('cfgReservationsHint', 'cfgReservationsHint');
    setText('cfgLangEnLabel', 'cfgLangEnLabel');
    setText('cfgLangBgLabel', 'cfgLangBgLabel');
    setText('cfgLangTrLabel', 'cfgLangTrLabel');
    setText('cfgLangRuLabel', 'cfgLangRuLabel');
    setText('cfgLangElLabel', 'cfgLangElLabel');
    setText('cfgLangEnHint', 'cfgLangEnHint');
    setText('cfgLangBgHint', 'cfgLangBgHint');
    setText('cfgLangTrHint', 'cfgLangTrHint');
    setText('cfgLangRuHint', 'cfgLangRuHint');
    setText('cfgLangElHint', 'cfgLangElHint');
    setText('categoriesToolbarHint', 'categoriesToolbarHint');
    setText('addCategoryBtn', 'addCategory');

    const preview = document.getElementById('previewLink'); if (preview) preview.textContent = tr('preview');
    const saveBtnEl = document.getElementById('saveBtn'); if (saveBtnEl && saveBtnEl.textContent !== 'Saving…' && saveBtnEl.textContent !== 'Запазване…') saveBtnEl.textContent = tr('save');
    const dirty = document.getElementById('dirtyBadge'); if (dirty) dirty.textContent = tr('unsaved');

    document.querySelectorAll('.rh-hub-item__label[data-i18n]').forEach(lbl => {
      const k = lbl.getAttribute('data-i18n');
      if (k) lbl.textContent = tr(k);
    });
    const rhTitle = document.getElementById('restaurantHubTitle');
    const rhNavLbl = document.getElementById('restaurantHubNavLabel');
    const rhNavAnchorLbl = document.getElementById('restaurantHubNavAnchorLabel');
    if (rhTitle) rhTitle.textContent = tr('restaurantHubSheetTitle');
    if (rhNavLbl) rhNavLbl.textContent = tr('restaurantHubNavLabel');
    if (rhNavAnchorLbl) rhNavAnchorLbl.textContent = tr('restaurantHubNavLabel');
    const hubNavBtnAria = document.getElementById('restaurantHubNavBtn');
    if (hubNavBtnAria) hubNavBtnAria.setAttribute('aria-label', tr('restaurantHubNavAria'));
    const hubNavAnchor = document.getElementById('restaurantHubNavAnchor');
    if (hubNavAnchor) hubNavAnchor.setAttribute('aria-label', tr('restaurantHubNavAnchorAria'));

    if (staffAccountNavLabel) staffAccountNavLabel.textContent = tr('staffAccountNavLabel');
    if (staffAccountNavBtn) staffAccountNavBtn.setAttribute('aria-label', tr('staffAccountNavLabel'));
    if (staffAccountMenuDetails) staffAccountMenuDetails.textContent = tr('staffAccountUserDetails');
    if (staffAccountMenuLogout) staffAccountMenuLogout.textContent = tr('staffAccountLogOut');
    if (userDetailsTitle && (!userDetailsLayer || !adminSheetLayerIsOpen(userDetailsLayer))) {
      userDetailsTitle.textContent = tr('userDetailsSheetTitle');
    }
    if (userDetailsClose) userDetailsClose.setAttribute('aria-label', adminLang === 'bg' ? 'Затвори' : 'Close');

    // Info bilingual row labels
    const setRowLabel = (rowId, text) => {
      const row = document.getElementById(rowId);
      const label = row?.querySelector('.field-label');
      if (label) label.textContent = text;
    };
    KNOWN_MENU_LANGS.forEach(code => {
      setRowLabel(infoNameRowId(code), tr(ITEM_NAME_LABEL_KEY[code]));
      setRowLabel(infoDescRowId(code), tr(ITEM_DESC_LABEL_KEY[code]));
    });

    if (workspacePickerLayer && !workspacePickerLayer.classList.contains('hidden')) {
      if (wsPickerTitle) wsPickerTitle.textContent = tr('workspacePickerTitle');
      if (wsPickerSearch) wsPickerSearch.placeholder = tr('workspaceSearchPlaceholder');
      populateWorkspacePickerList(wsPickerSearch?.value || '');
    }

    if (menuData && menuData.restaurant && editorScreen && !editorScreen.classList.contains('hidden')) {
      applyInfoLanguageRows();
    }
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
    const hasVenues = scopedRestaurantIds.length > 0;
    if (authWorkspacePickBtn) {
      authWorkspacePickBtn.classList.toggle('hidden', !hasVenues);
      if (hasVenues && authWorkspacePickLabel) {
        authWorkspacePickLabel.textContent = activeWorkspaceId
          ? workspaceDisplayNameForId(activeWorkspaceId)
          : tr('chooseWorkspaceBtn');
      }
      authWorkspacePickBtn.setAttribute(
        'title',
        adminLang === 'bg'
          ? 'Избор на обект преди да влезеш в редактора (също: задрж бутона „Обект“ в редактора ~0,5 s)'
          : 'Choose workspace before opening the editor (in the editor, hold Venue in the staff bar ~0.5s)'
      );
    }
  }

  function onStaffAccountMenuResize() {
    closeStaffAccountMenu();
  }

  function closeStaffAccountMenu() {
    if (_staffAccountMenuResizeBound) {
      window.removeEventListener('resize', onStaffAccountMenuResize);
      _staffAccountMenuResizeBound = false;
    }
    if (staffAccountMenuRoot && !staffAccountMenuRoot.classList.contains('hidden')) {
      staffAccountMenuRoot.classList.add('hidden');
      staffAccountMenuRoot.setAttribute('aria-hidden', 'true');
    }
    staffAccountNavBtn?.setAttribute('aria-expanded', 'false');
    syncBodyScrollLock();
  }

  function positionStaffAccountMenuPanel() {
    const panel = document.getElementById('staffAccountMenuPanel');
    if (!staffAccountNavBtn || !panel || staffAccountNavBtn.classList.contains('hidden')) return;
    const r = staffAccountNavBtn.getBoundingClientRect();
    const margin = 8;
    const panelW = Math.min(260, window.innerWidth - 2 * margin);
    panel.style.width = `${panelW}px`;
    const idealLeft = r.left + r.width / 2 - panelW / 2;
    const left = Math.max(margin, Math.min(idealLeft, window.innerWidth - panelW - margin));
    panel.style.left = `${left}px`;
    panel.style.bottom = `${window.innerHeight - r.top + margin}px`;
    panel.style.top = 'auto';
    panel.style.right = 'auto';
  }

  function openStaffAccountMenu() {
    closeUserDetailsSheet();
    closeRestaurantHub();
    closeWorkspacePicker();
    closeCategorySettingsSheet();
    if (!staffAccountMenuRoot || !staffAccountNavBtn) return;
    staffAccountMenuRoot.classList.remove('hidden');
    staffAccountMenuRoot.setAttribute('aria-hidden', 'false');
    staffAccountNavBtn.setAttribute('aria-expanded', 'true');
    positionStaffAccountMenuPanel();
    if (!_staffAccountMenuResizeBound) {
      window.addEventListener('resize', onStaffAccountMenuResize);
      _staffAccountMenuResizeBound = true;
    }
    syncBodyScrollLock();
  }

  function toggleStaffAccountMenu() {
    if (!staffAccountMenuRoot) return;
    if (staffAccountMenuRoot.classList.contains('hidden')) openStaffAccountMenu();
    else closeStaffAccountMenu();
  }

  function closeUserDetailsSheet() {
    closeAdminSheetLayer(userDetailsLayer, userDetailsSheet);
  }

  async function fetchMeAndCache() {
    const base = getMenuApiBase();
    const t = getAuthToken();
    if (!base || !t) {
      cachedAuthMe = null;
      updateStaffAccountBubbleFromMe();
      return null;
    }
    try {
      const res = await fetch(`${base}/api/auth/me`, { headers: { Authorization: `Bearer ${t}` } });
      if (!res.ok) {
        cachedAuthMe = null;
        updateStaffAccountBubbleFromMe();
        return null;
      }
      cachedAuthMe = await res.json();
      updateStaffAccountBubbleFromMe();
      return cachedAuthMe;
    } catch (_) {
      return null;
    }
  }

  function updateStaffAccountBubbleFromMe() {
    if (!staffAccountBubble) return;
    const u = (cachedAuthMe && cachedAuthMe.username) ? String(cachedAuthMe.username).trim() : '';
    if (!u) {
      staffAccountBubble.textContent = '?';
      return;
    }
    const parts = u.split(/[\s._-]+/).filter(Boolean);
    let initials = u.slice(0, 2).toUpperCase();
    if (parts.length >= 2) {
      initials = (parts[0][0] + parts[1][0]).toUpperCase();
    } else if (u.length >= 2) {
      initials = u.slice(0, 2).toUpperCase();
    } else {
      initials = u.charAt(0).toUpperCase();
    }
    staffAccountBubble.textContent = initials.slice(0, 2);
  }

  function renderUserDetailsBody() {
    if (!userDetailsBody) return;
    if (!cachedAuthMe) {
      userDetailsBody.innerHTML = `<p class="user-details-value">${esc(adminLang === 'bg' ? 'Няма данни.' : 'No data loaded.')}</p>`;
      return;
    }
    const venues = Array.isArray(cachedAuthMe.restaurants) ? cachedAuthMe.restaurants : [];
    const un = esc(cachedAuthMe.username || '—');
    const sup = !!cachedAuthMe.superAdmin;
    const yn = sup ? tr('userDetailsYes') : tr('userDetailsNo');
    userDetailsBody.innerHTML = `
      <div class="user-details-block">
        <p class="user-details-label">${esc(tr('userDetailsUsername'))}</p>
        <p class="user-details-value">${un}</p>
      </div>
      <div class="user-details-block">
        <p class="user-details-label">${esc(tr('userDetailsSuperAdmin'))}</p>
        <p class="user-details-value">${esc(yn)}</p>
      </div>
      <div class="user-details-block">
        <p class="user-details-label">${esc(tr('userDetailsVenues'))}</p>
        <p class="user-details-value">${esc(String(venues.length))}</p>
      </div>`;
  }

  async function openStaffUserDetailsSheet() {
    closeStaffAccountMenu();
    closeUserDetailsSheet();
    closeRestaurantHub();
    closeWorkspacePicker();
    closeCategorySettingsSheet();
    await fetchMeAndCache();
    if (!cachedAuthMe) {
      showToast(adminLang === 'bg' ? 'Неуспешно зареждане на профила.' : 'Could not load account details.', 'error');
      return;
    }
    renderUserDetailsBody();
    if (userDetailsTitle) userDetailsTitle.textContent = tr('userDetailsSheetTitle');
    openAdminSheetLayer(userDetailsLayer);
  }

  function syncBodyScrollLock() {
    const wsOpen = workspacePickerLayer && !workspacePickerLayer.classList.contains('hidden');
    const catOpen = catSettingsLayer && !catSettingsLayer.classList.contains('hidden');
    const hubOpen = restaurantHubLayer && !restaurantHubLayer.classList.contains('hidden');
    const udOpen = userDetailsLayer && !userDetailsLayer.classList.contains('hidden');
    const accountMenuOpen = staffAccountMenuRoot && !staffAccountMenuRoot.classList.contains('hidden');
    document.body.style.overflow = wsOpen || catOpen || hubOpen || udOpen || accountMenuOpen ? 'hidden' : '';
  }

  function closeWorkspacePicker() {
    closeAdminSheetLayer(workspacePickerLayer, workspacePickerSheet);
    authWorkspacePickBtn?.setAttribute('aria-expanded', 'false');
    if (_workspacePickerContext === 'editor') {
      restaurantHubNavBtn?.setAttribute('aria-expanded', 'false');
    }
  }

  function populateWorkspacePickerList(filterText) {
    if (!wsPickerList) return;
    const q = (filterText || '').trim().toLowerCase();
    wsPickerList.innerHTML = '';
    scopedRestaurantIds.forEach(rid => {
      const label = workspaceDisplayNameForId(rid);
      const hay = `${label} ${rid}`.toLowerCase();
      if (q && !hay.includes(q)) return;
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'ws-picker-row' + (rid === activeWorkspaceId ? ' ws-picker-row--active' : '');
      row.setAttribute('role', 'option');
      row.setAttribute('aria-selected', rid === activeWorkspaceId ? 'true' : 'false');
      row.dataset.rid = rid;
      row.innerHTML = `
        <span class="ws-picker-row__main">
          <span class="ws-picker-row__name">${esc(label)}</span>
          <span class="ws-picker-row__id">${esc(rid)}</span>
        </span>
        ${rid === activeWorkspaceId ? `<span class="ws-picker-row__check" aria-hidden="true">✓</span>` : ''}
      `;
      row.addEventListener('click', async () => {
        closeWorkspacePicker();
        if (_workspacePickerContext === 'auth') {
          await openEditorForRestaurantId(rid);
          return;
        }
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
        _resetLayoutPanel();
        await loadAndOpenEditor();
      });
      wsPickerList.appendChild(row);
    });
    if (!wsPickerList.children.length && scopedRestaurantIds.length) {
      const empty = document.createElement('p');
      empty.className = 'ws-picker-empty';
      empty.textContent = adminLang === 'bg' ? 'Няма съвпадения.' : 'No matches.';
      wsPickerList.appendChild(empty);
    }
  }

  function openWorkspacePicker(context) {
    closeStaffAccountMenu();
    closeUserDetailsSheet();
    closeRestaurantHub();
    closeCategorySettingsSheet();
    _workspacePickerContext = context === 'editor' ? 'editor' : 'auth';
    if (wsPickerTitle) wsPickerTitle.textContent = tr('workspacePickerTitle');
    if (wsPickerSearch) {
      wsPickerSearch.placeholder = tr('workspaceSearchPlaceholder');
      wsPickerSearch.value = '';
    }
    populateWorkspacePickerList('');
    openAdminSheetLayer(workspacePickerLayer);
    const expandBtn = context === 'editor' ? restaurantHubNavBtn : authWorkspacePickBtn;
    expandBtn?.setAttribute('aria-expanded', 'true');
    setTimeout(() => wsPickerSearch?.focus(), 50);
  }

  function exitAuthSessionBoot() {
    authSessionBoot?.classList.add('hidden');
    document.getElementById('authTitle')?.classList.remove('hidden');
    document.getElementById('authSub')?.classList.remove('hidden');
  }

  /** While a tab session token exists, hide the sign-in form until /api/auth/me completes. */
  function enterAuthSessionBoot() {
    authSessionBoot?.classList.remove('hidden');
    document.getElementById('authTitle')?.classList.add('hidden');
    document.getElementById('authSub')?.classList.add('hidden');
    authCredentialsBlock?.classList.add('hidden');
    postAuthPanel?.classList.add('hidden');
    if (authSessionBootText) authSessionBootText.textContent = tr('sessionRestoreHint');
  }

  function showCredentialsUi() {
    exitAuthSessionBoot();
    authCredentialsBlock?.classList.remove('hidden');
    postAuthPanel?.classList.add('hidden');
  }

  function showPostAuthUi() {
    exitAuthSessionBoot();
    authCredentialsBlock?.classList.add('hidden');
    postAuthPanel?.classList.remove('hidden');
    if (superOnlyHint) {
      superOnlyHint.classList.toggle('hidden', scopedRestaurantIds.length > 0);
      superOnlyHint.textContent = tr('superOnlyHint');
    }
    if (postAuthHint) {
      postAuthHint.classList.toggle('hidden', scopedRestaurantIds.length === 0);
      postAuthHint.textContent = tr('chooseWorkspaceHint');
    }
    refreshWorkspaceTabLabels();
  }

  async function signOutSession() {
    closeStaffAccountMenu();
    closeUserDetailsSheet();
    const apiBase = getMenuApiBase();
    if (apiBase) {
      try {
        await fetch(`${apiBase}/api/auth/logout`, { method: 'POST', credentials: 'include' });
      } catch (_) {
        /* ignore */
      }
    }
    clearAuthToken();
    cachedAuthMe = null;
    updateStaffAccountBubbleFromMe();
    sessionSuperAdmin = false;
    scopedRestaurantIds = [];
    scopedRestaurantSummaries = new Map();
    activeWorkspaceId = null;
    menuData = null;
    currentRestaurant = null;
    if (editorScreen) editorScreen.classList.add('hidden');
    if (authScreen) authScreen.classList.remove('hidden');
    showCredentialsUi();
    syncVenueNavSlot();
    if (authErrorEl) authErrorEl.style.display = 'none';
  }

  async function openEditorForRestaurantId(rid) {
    activeWorkspaceId = rid;
    currentRestaurant = { id: rid };
    _resetLayoutPanel();
    await loadAndOpenEditor();
  }

  const AUTH_ME_TIMEOUT_MS = 28000;

  async function restoreSessionIfPossible() {
    const t = getAuthToken();
    if (!t) return false;
    const base = getMenuApiBase();
    if (!base) return false;
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), AUTH_ME_TIMEOUT_MS);
    try {
      const res = await fetch(`${base}/api/auth/me`, {
        headers: { Authorization: 'Bearer ' + t },
        signal: ctrl.signal
      });
      clearTimeout(tid);
      if (!res.ok) {
        clearAuthToken();
        cachedAuthMe = null;
        updateStaffAccountBubbleFromMe();
        return false;
      }
      const me = await res.json();
      cachedAuthMe = me;
      updateStaffAccountBubbleFromMe();
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
      return true;
    } catch (e) {
      clearTimeout(tid);
      if (e && e.name === 'AbortError') {
        clearAuthToken();
        cachedAuthMe = null;
        updateStaffAccountBubbleFromMe();
        return false;
      }
      clearAuthToken();
      cachedAuthMe = null;
      updateStaffAccountBubbleFromMe();
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
    await fetchMeAndCache();

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

    if (scopedRestaurantIds.length >= 1) {
      /* First ID in `/api/auth/me` → `restaurants` array order (server preserves assignment order). */
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
    switchTab('info');

    const r = menuData.restaurant;
    refreshWorkspaceTabLabels();
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

    const rhL = document.getElementById('rhHubLayoutRow');
    const rhR = document.getElementById('rhHubReservationsRow');
    if (rhL) rhL.classList.toggle('hidden', !sessionSuperAdmin);
    if (rhR) rhR.classList.toggle('hidden', !sessionSuperAdmin);

    syncVenueNavSlot();
    fetchMeAndCache().catch(() => {});
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
    document.querySelectorAll('.rh-hub-item').forEach(t => {
      t.classList.toggle('is-active', t.dataset.tab === 'info');
    });
    closeRestaurantHub();
    closeStaffAccountMenu();
    closeUserDetailsSheet();
    syncVenueNavSlot();
    document.querySelectorAll('.editor-panel').forEach(p => {
      const on = p.id === 'panel-info';
      p.classList.toggle('active', on);
      p.classList.toggle('hidden', !on);
    });
  });

  /* ── TABS ────────────────────────────────────────────────── */
  function switchTab(tabId) {
    document.querySelectorAll('.rh-hub-item').forEach(t =>
      t.classList.toggle('is-active', t.dataset.tab === tabId)
    );
    document.querySelectorAll('.editor-panel').forEach(p => {
      const active = p.id === 'panel-' + tabId;
      p.classList.toggle('active', active);
      p.classList.toggle('hidden', !active);
    });
    adminTrack('admin_tab_view', { tab: String(tabId).slice(0, 40) });
    if (tabId === 'qr' && window.AdminQrFlyers) window.AdminQrFlyers.refresh();
    if (tabId === 'layout' && sessionSuperAdmin) _initLayoutPanel();
    if (tabId === 'reservations' && sessionSuperAdmin) {
      _initLayoutPanel();
      _loadReservations();
    }
    if (tabId === 'notifications') renderNotificationsTab();
  }

  const restaurantHubBackdrop = document.getElementById('restaurantHubBackdrop');
  const restaurantHubSheet    = document.getElementById('restaurantHubSheet');
  const restaurantHubNavBtn   = document.getElementById('restaurantHubNavBtn');

  function openRestaurantHub() {
    if (!restaurantHubLayer) return;
    closeStaffAccountMenu();
    closeUserDetailsSheet();
    closeWorkspacePicker();
    closeCategorySettingsSheet();
    openAdminSheetLayer(restaurantHubLayer);
    if (restaurantHubNavBtn) restaurantHubNavBtn.setAttribute('aria-expanded', 'true');
  }

  function closeRestaurantHub() {
    if (!restaurantHubLayer) return;
    closeAdminSheetLayer(restaurantHubLayer, restaurantHubSheet);
    if (restaurantHubNavBtn) restaurantHubNavBtn.setAttribute('aria-expanded', 'false');
  }

  function syncRestaurantHubLogo() {
    const raw = document.getElementById('infoLogo')?.value?.trim() || '';
    const fallback = '../resources/logo.webp';
    const src = raw ? resolveUrl(raw) : null;
    const apply = img => {
      if (!img) return;
      img.src = src || fallback;
      img.onerror = () => {
        img.onerror = null;
        img.src = fallback;
      };
    };
    apply(document.getElementById('restaurantHubNavLogo'));
    apply(document.getElementById('restaurantHubNavLogoAnchor'));
  }

  /** On index.html: hub anchor when signed out / not in editor; hub button while editing (opens venue sheet). */
  function syncVenueNavSlot() {
    const anchor = document.getElementById('restaurantHubNavAnchor');
    const hubBtn = document.getElementById('restaurantHubNavBtn');
    const inEditor = editorScreen && !editorScreen.classList.contains('hidden');
    if (anchor) {
      anchor.classList.toggle('hidden', inEditor);
      anchor.classList.toggle('m-app-nav__link--active', !inEditor);
      if (inEditor) anchor.removeAttribute('aria-current');
      else anchor.setAttribute('aria-current', 'page');
    }
    if (hubBtn) {
      hubBtn.classList.toggle('hidden', !inEditor);
      hubBtn.classList.toggle('m-app-nav__link--active', !!inEditor);
      if (!inEditor) hubBtn.setAttribute('aria-expanded', 'false');
    }
    if (staffAccountNavBtn) {
      staffAccountNavBtn.classList.toggle('hidden', !inEditor);
      if (!inEditor) {
        staffAccountNavBtn.setAttribute('aria-expanded', 'false');
        closeStaffAccountMenu();
        closeUserDetailsSheet();
      }
    }
  }

  /* ── LAYOUT & RESERVATIONS (super-admin) ─────────────────── */
  let _layoutPanelInit = false;

  function _initLayoutPanel() {
    if (_layoutPanelInit) return;
    _layoutPanelInit = true;

    const rid  = currentRestaurant?.id || '';
    const base = getMenuApiBase();

    const setReserve = (id) => {
      const el = document.getElementById(id);
      if (el) {
        try {
          el.href = new URL(`../reserve/?r=${encodeURIComponent(rid)}`, window.location.href).href;
        } catch (_) {}
      }
    };
    setReserve('reservePublicLinkLayout');
    setReserve('reservePublicLinkRes');

    const editorHost = document.getElementById('lfEditorHost');

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
    tbody.innerHTML = '<tr><td colspan="8" style="padding:14px;text-align:center;color:var(--color-text-muted)">Loading…</td></tr>';
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
        _renderAdmResTimeline([]);
        return;
      }
      _renderAdmResTimeline(list);
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
        const dmin = typeof r.durationMinutes === 'number' && r.durationMinutes > 0 ? r.durationMinutes : '—';
        return `<tr>
          <td>${time}</td>
          <td>${dmin === '—' ? '—' : dmin + 'm'}</td>
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
      tbody.innerHTML = `<tr><td colspan="8" style="color:#dc2626;padding:14px">${_esc(err.message)}</td></tr>`;
      _renderAdmResTimeline([]);
    }
  }

  /** One swimlane per table, blocks from reserved time + duration. */
  function _renderAdmResTimeline(list) {
    const host = document.getElementById('admResTimeline');
    if (!host) return;
    if (!list || !list.length) {
      host.innerHTML = '';
      host.style.display = 'none';
      return;
    }
    host.style.display = 'block';
    const toMin = (timeStr) => {
      if (!timeStr || typeof timeStr !== 'string') return null;
      const t = timeStr.slice(0, 5);
      const p = t.split(':');
      if (p.length < 2) return null;
      return (parseInt(p[0], 10) || 0) * 60 + (parseInt(p[1], 10) || 0);
    };
    const segs = list.map((r) => {
      const startM = toMin(r.reservedTime);
      const dur = typeof r.durationMinutes === 'number' && r.durationMinutes > 0 ? r.durationMinutes : 120;
      if (startM == null) {
        return { table: r.tableId, guest: r.guestName, a: 0, b: 24 * 60, allday: true };
      }
      const endM = Math.min(24 * 60, startM + dur);
      return { table: r.tableId, guest: r.guestName, a: startM, b: endM, allday: false };
    });
    const win0 = Math.max(0, Math.min(...segs.map(s => s.a)) - 30);
    const win1 = Math.min(24 * 60, Math.max(...segs.map(s => s.b)) + 30);
    const widthMin = win1 - win0 || 1;
    const tables = [...new Set(segs.map(s => s.table))].sort();
    const tickMaj = 60;
    const ticks = [];
    for (let m = Math.floor(win0 / tickMaj) * tickMaj; m <= win1; m += tickMaj) {
      const left = ((m - win0) / widthMin) * 100;
      const label = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
      ticks.push(`<span class="adm-res-tl-tick" style="left:${left.toFixed(2)}%">${label}</span>`);
    }
    const rowH = 40;
    const bodyRows = tables.map(tid => {
      const inRow = segs.filter(s => s.table === tid);
      const blocks = inRow.map(s => {
        const left = ((s.a - win0) / widthMin) * 100;
        const w = ((Math.min(s.b, win1) - Math.max(s.a, win0)) / widthMin) * 100;
        if (w <= 0) return '';
        const tip = _esc(s.guest) + (s.allday ? ' (all day)' : '');
        return `<div class="adm-res-tl-block" style="left:${left.toFixed(2)}%;width:${Math.max(w, 0.8).toFixed(2)}%" title="${tip}"><span class="adm-res-tl-block__g">${_esc(s.guest)}</span></div>`;
      }).join('');
      return `<div class="adm-res-tl-row">
        <div class="adm-res-tl-label" title="${_esc(tid)}">${_esc(tid)}</div>
        <div class="adm-res-tl-lane" style="height:${rowH}px">${blocks}</div>
      </div>`;
    }).join('');
    host.innerHTML = `
      <h4 class="adm-res-tl-title">${adminLang === 'bg' ? 'Времеви план' : 'Day timeline (per table)'}</h4>
      <div class="adm-res-tl-scale">${ticks.join('')}</div>
      <div class="adm-res-tl-body">${bodyRows}</div>`;
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
    if (!r.name || typeof r.name !== 'object') r.name = {};
    if (!r.description || typeof r.description !== 'object') r.description = {};
    KNOWN_MENU_LANGS.forEach(code => {
      const cap = langCap(code);
      const ni = document.getElementById(`infoName${cap}`);
      const di = document.getElementById(`infoDesc${cap}`);
      if (ni) ni.value = r.name[code] || '';
      if (di) di.value = r.description[code] || '';
    });
    document.getElementById('infoTheme').value   = r.menu.theme || 'classic';
    document.getElementById('infoLang').value    = r.default_language || 'en';
    document.getElementById('infoLogo').value    = r.logo || '';
    document.getElementById('infoImage').value   = r.image || '';
    document.getElementById('infoBgImage').value = r.background_image || '';

    [
      ...KNOWN_MENU_LANGS.map(c => [`infoName${langCap(c)}`, `infoDesc${langCap(c)}`]).flat(),
      'infoTheme',
      'infoLang'
    ].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('input', () => setDirty(true));
    });

    const rid = currentRestaurant?.id || 'general';
    bindUrlField('infoLogo',    'infoLogoPreview',    'infoLogoUpload',    `restaurant_menu/${rid}`);
    bindUrlField('infoImage',   'infoImagePreview',   'infoImageUpload',   `restaurant_menu/${rid}`);
    bindUrlField('infoBgImage', 'infoBgImagePreview', 'infoBgImageUpload', `restaurant_menu/${rid}`);

    const logoIn = document.getElementById('infoLogo');
    if (logoIn && !logoIn.dataset.hubSync) {
      logoIn.dataset.hubSync = '1';
      logoIn.addEventListener('input', () => syncRestaurantHubLogo());
    }
    syncRestaurantHubLogo();
  }

  /* ── POPULATE CONFIG ─────────────────────────────────────── */
  function populateConfig(cfg) {
    document.getElementById('cfgPrice').checked       = cfg.show_price !== false;
    document.getElementById('cfgDesc').checked        = cfg.show_description !== false;
    document.getElementById('cfgTags').checked        = cfg.show_tags !== false;
    document.getElementById('cfgIngredients').checked = cfg.show_ingredients === true;
    document.getElementById('cfgAllergens').checked   = cfg.show_allergens === true;

    const resEl = document.getElementById('cfgReservations');
    if (resEl) resEl.checked = cfg.reservations_enabled !== false;

    const durs = cfg.reservation_allowed_durations_minutes;
    const durInput = document.getElementById('cfgResDurations');
    if (durInput) {
      if (Array.isArray(durs) && durs.length) {
        durInput.value = durs.map(n => String(n)).join(', ');
      } else if (typeof durs === 'number' && durs > 0) {
        durInput.value = String(durs);
      } else {
        durInput.value = '120';
      }
    }
    const forf = document.getElementById('cfgResForfeit');
    if (forf) forf.value = (typeof cfg.reservation_forfeit_minutes === 'number' && cfg.reservation_forfeit_minutes >= 0)
      ? cfg.reservation_forfeit_minutes
      : 30;

    const langs = normalizeEnabledLanguages(cfg);
    MENU_LANG_OPTIONS.forEach(({ code, id }) => {
      const el = document.getElementById(id);
      if (el) el.checked = langs.includes(code);
    });

    const tzEl = document.getElementById('cfgTimezone');
    if (tzEl) {
      tzEl.value = cfg.timezone || 'Europe/Sofia';
      if (!tzEl.value) tzEl.value = 'Europe/Sofia'; // fallback if not in list
    }
    ['cfgPrice','cfgDesc','cfgTags','cfgIngredients','cfgAllergens','cfgTimezone','cfgReservations','cfgResDurations','cfgResForfeit']
      .forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('change', () => setDirty(true));
      });
    const cfgResDurs = document.getElementById('cfgResDurations');
    if (cfgResDurs) cfgResDurs.addEventListener('input', () => setDirty(true));

    MENU_LANG_OPTIONS.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('change', onMenuLanguageTogglesChange);
    });

    if (!cfg.currencies) cfg.currencies = {};
    cfg.currencies = normalizeCurrencyConfig(cfg.currencies, currentRestaurant);
    renderCurrencyConfig(cfg.currencies);

    applyInfoLanguageRows();
  }

  /* ── CATEGORIES ──────────────────────────────────────────── */
  function closeCategorySettingsSheet() {
    _catSettingsIdx = -1;
    closeAdminSheetLayer(catSettingsLayer, catSettingsSheet, () => {
      if (catSettingsBody) catSettingsBody.innerHTML = '';
    });
  }

  function updateCategoryHeaderFromCat(block, cat) {
    if (!block) return;
    const nameEl = block.querySelector('.category-block__name');
    const enabled = getEnabledMenuLangsFromState();
    if (nameEl) nameEl.textContent = primaryLocalizedName(cat.name, enabled) || cat.id;
    const badge = block.querySelector('.category-section__badge');
    if (badge) {
      badge.classList.toggle('hidden', !(cat.schedule && cat.schedule.enabled));
    }
  }

  function openCategorySettingsSheet(catIdx) {
    const cats = menuData?.restaurant?.menu?.categories;
    if (!cats || !catSettingsBody) return;
    const cat = cats[catIdx];
    if (!cat) return;
    _catSettingsIdx = catIdx;
    const enabledCat = getEnabledMenuLangsFromState();
    if (catSettingsTitle) {
      catSettingsTitle.textContent = `${tr('categorySettingsTitle')}: ${primaryLocalizedName(cat.name, enabledCat) || cat.id}`;
    }

    if (!cat.name || typeof cat.name !== 'object') cat.name = {};
    const categoryNameFields = orderEnabledLangsForFields(enabledCat)
      .map(code => {
        const v = cat.name[code] || '';
        return `
          <div class="category-name-field">
            <label>${esc(tr(CAT_LABEL_KEY[code]))}</label>
            <input class="cat-name-${code} cat-sheet-name-${code}" type="text" value="${esc(v)}" placeholder="${esc(tr(CAT_PH_KEY[code]))}" />
          </div>`;
      })
      .join('');

    catSettingsBody.innerHTML = `
      <div class="form-section cat-settings-block">
        <h3 class="form-section__title">${esc(tr('categoryNamesSection'))}</h3>
        <div class="category-name-fields">${categoryNameFields}</div>
      </div>
      <div class="form-section cat-settings-block">
        <h3 class="form-section__title">${esc(tr('categoryScheduleSection'))}</h3>
        <div class="cat-schedule-section cat-schedule-section--sheet">
          <label class="cat-schedule-toggle">
            <input type="checkbox" class="cat-schedule-cb cat-sheet-schedule-enabled" ${cat.schedule && cat.schedule.enabled ? 'checked' : ''} />
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
      </div>
      <p class="cat-settings-reorder-hint">${esc(tr('categoryReorderHint'))}</p>
      <div class="cat-settings-actions">
        <button type="button" class="cat-btn cat-sheet-up" ${catIdx === 0 ? 'disabled' : ''}>↑ ${adminLang === 'bg' ? 'Нагоре' : 'Up'}</button>
        <button type="button" class="cat-btn cat-sheet-down" ${catIdx >= cats.length - 1 ? 'disabled' : ''}>↓ ${adminLang === 'bg' ? 'Надолу' : 'Down'}</button>
      </div>
      <button type="button" class="btn-delete-category-sheet">${esc(tr('deleteCategory'))}</button>
    `;

    closeStaffAccountMenu();
    closeUserDetailsSheet();
    closeRestaurantHub();
    closeWorkspacePicker();
    openAdminSheetLayer(catSettingsLayer);

    const block = categoriesList.querySelector(`[data-cat-idx="${catIdx}"]`);

    orderEnabledLangsForFields(enabledCat).forEach(code => {
      catSettingsBody.querySelector(`.cat-sheet-name-${code}`)?.addEventListener('input', e => {
        if (!cat.name || typeof cat.name !== 'object') cat.name = {};
        cat.name[code] = e.target.value;
        updateCategoryHeaderFromCat(block, cat);
        setDirty(true);
      });
    });

    (function wireSheetSchedule() {
      const scheduleCb = catSettingsBody.querySelector('.cat-sheet-schedule-enabled');
      const schedFields = catSettingsBody.querySelector('.cat-schedule-fields');
      const startInput = catSettingsBody.querySelector('.cat-schedule-start');
      const endInput = catSettingsBody.querySelector('.cat-schedule-end');
      const statusEl = catSettingsBody.querySelector('.cat-schedule-status');
      const activeTopCb = catSettingsBody.querySelector('.cat-schedule-active-top');
      const inactiveBottomCb = catSettingsBody.querySelector('.cat-schedule-inactive-bottom');

      function timeSectionIsActive(sched) {
        if (!sched || !sched.enabled) return null;
        const tz = (menuData.restaurant.menu.config || {}).timezone || 'Europe/Sofia';
        try {
          const now = new Date();
          const ts = now.toLocaleTimeString('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false });
          const [ch, cm] = ts.split(':').map(Number);
          const cur = ch * 60 + cm;
          const [sh, sm] = (sched.start_time || '12:00').split(':').map(Number);
          const [eh, em] = (sched.end_time || '14:00').split(':').map(Number);
          const start = sh * 60 + sm;
          const end = eh * 60 + em;
          return end > start ? (cur >= start && cur < end) : (cur >= start || cur < end);
        } catch {
          return null;
        }
      }

      function updateStatus() {
        if (!cat.schedule || !cat.schedule.enabled) {
          statusEl.textContent = '';
          return;
        }
        const active = timeSectionIsActive(cat.schedule);
        const s = cat.schedule.start_time || '';
        const e = cat.schedule.end_time || '';
        statusEl.textContent = active
          ? `✓ Currently active (${s}–${e})`
          : `○ Inactive now (${s}–${e})`;
        statusEl.dataset.active = active ? '1' : '0';
      }

      scheduleCb.addEventListener('change', () => {
        if (!cat.schedule) cat.schedule = { start_time: '12:00', end_time: '14:00' };
        cat.schedule.enabled = scheduleCb.checked;
        schedFields.classList.toggle('hidden', !scheduleCb.checked);
        updateCategoryHeaderFromCat(block, cat);
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

    catSettingsBody.querySelector('.cat-sheet-up')?.addEventListener('click', e => {
      e.preventDefault();
      if (catIdx === 0) return;
      const arr = menuData.restaurant.menu.categories;
      [arr[catIdx - 1], arr[catIdx]] = [arr[catIdx], arr[catIdx - 1]];
      closeCategorySettingsSheet();
      renderCategories(arr);
      setDirty(true);
    });
    catSettingsBody.querySelector('.cat-sheet-down')?.addEventListener('click', e => {
      e.preventDefault();
      const arr = menuData.restaurant.menu.categories;
      if (catIdx === arr.length - 1) return;
      [arr[catIdx], arr[catIdx + 1]] = [arr[catIdx + 1], arr[catIdx]];
      closeCategorySettingsSheet();
      renderCategories(arr);
      setDirty(true);
    });

    catSettingsBody.querySelector('.btn-delete-category-sheet')?.addEventListener('click', async e => {
      e.preventDefault();
      const ic = cat.items ? cat.items.length : 0;
      const dn = primaryLocalizedName(cat.name, getEnabledMenuLangsFromState()) || cat.id;
      const ok = await confirm(
        adminLang === 'bg'
          ? `Изтрий категорията „${dn}“? Всички ${ic} продукта ще бъдат премахнати.`
          : `Delete category "${dn}"? All ${ic} items will be removed.`
      );
      if (!ok) return;
      adminTrack('admin_category_delete', { category: String(cat.name?.en || cat.id).slice(0, 80) });
      menuData.restaurant.menu.categories.splice(catIdx, 1);
      closeCategorySettingsSheet();
      renderCategories(menuData.restaurant.menu.categories);
      setDirty(true);
    });
  }

  function renderCategories(categories) {
    closeCategorySettingsSheet();
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
    block.className = 'category-block category-section';
    block.dataset.catIdx = catIdx;

    const itemCount = cat.items ? cat.items.length : 0;
    const timedHidden = !(cat.schedule && cat.schedule.enabled);
    const itemLabel = adminLang === 'bg' ? 'продукта' : `item${itemCount !== 1 ? 's' : ''}`;
    const gearAria = adminLang === 'bg' ? 'Настройки на категорията' : 'Category settings';
    const enabledList = getEnabledMenuLangsFromState();
    const catTitle = primaryLocalizedName(cat.name, enabledList) || cat.id;

    block.innerHTML = `
      <div class="category-section__header">
        <span class="category-block__drag" title="Drag to reorder">⠿</span>
        <button type="button" class="category-section__toggle" aria-expanded="false">
          <span class="category-block__name">${esc(catTitle)}</span>
          <span class="category-section__badge${timedHidden ? ' hidden' : ''}">${adminLang === 'bg' ? 'Времева' : 'Timed'}</span>
          <span class="category-block__count">${itemCount} ${itemLabel}</span>
          <span class="category-block__chevron" aria-hidden="true">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 5l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </span>
        </button>
        <button type="button" class="category-section__gear" aria-label="${esc(gearAria)}">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
        </button>
      </div>
      <div class="category-block__body"><div class="category-block__body-inner">
        <div class="category-items-wrap">
          <p class="category-items-hint">${esc(tr('itemsSectionHint'))}</p>
          <div class="items-list" id="items-${catIdx}"></div>
          <button type="button" class="btn-add-item">${adminLang === 'bg' ? '+ Добави продукт' : '+ Add item'}</button>
        </div>
      </div></div>
    `;

    const toggleBtn = block.querySelector('.category-section__toggle');
    toggleBtn.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      const open = block.classList.toggle('open');
      toggleBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });

    block.querySelector('.category-section__gear')?.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      openCategorySettingsSheet(catIdx);
    });

    block.querySelector('.btn-add-item').addEventListener('click', e => {
      e.stopPropagation();
      if (!cat.items) cat.items = [];
      cat.items.push({
        name: emptyLocalizedRecord(),
        description: emptyLocalizedRecord(),
        price: 0,
        tags: [],
        availability: true,
        image: undefined
      });
      if (!block.classList.contains('open')) {
        block.classList.add('open');
        toggleBtn.setAttribute('aria-expanded', 'true');
      }
      refreshItemsList(block, cat, catIdx);
      setDirty(true);
      const itemsEl = block.querySelector(`#items-${catIdx}`);
      const last = itemsEl && itemsEl.lastElementChild;
      if (last) last.classList.add('open');
    });

    refreshItemsList(block, cat, catIdx);

    return block;
  }

  function refreshItemsList(catBlock, cat, catIdx) {
    const itemsEl = catBlock.querySelector(`#items-${catIdx}`);
    if (!cat.items) cat.items = [];
    itemsEl.innerHTML = '';
    const n = cat.items.length;
    catBlock.querySelector('.category-block__count').textContent =
      `${n} ${adminLang === 'bg' ? 'продукта' : `item${n !== 1 ? 's' : ''}`}`;
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
      const row = { en: entry.en, bg: entry.bg != null && entry.bg !== '' ? entry.bg : entry.en };
      KNOWN_MENU_LANGS.forEach(c => {
        if (c !== 'en' && c !== 'bg' && entry[c]) row[c] = entry[c];
      });
      dict.push(row);
      return row;
    }
    if (!existing.bg && entry.bg) existing.bg = entry.bg;
    KNOWN_MENU_LANGS.forEach(c => {
      if (c !== 'en' && c !== 'bg' && entry[c] && !existing[c]) existing[c] = entry[c];
    });
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
      KNOWN_MENU_LANGS.some(c => (e[c] || '').toLowerCase().includes(q))
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

  function formatEnumOptionLabel(entry) {
    const enabled = getEnabledMenuLangsFromState();
    const parts = [];
    enabled.forEach(c => {
      const v = entry[c];
      if (v && String(v).trim()) parts.push(String(v).trim());
    });
    const uniq = [...new Set(parts)];
    return uniq.length ? uniq.join(' / ') : String(entry.en || '');
  }

  /* ── ENUM NATIVE SELECT WIDGET ─────────────────────────────── */
  function wireEnumNativeSelect(block, field, item, catIdx, itemIdx) {
    const widget = block.querySelector(`.enum-native[data-enum="${field}"]`);
    if (!widget) return;

    const select         = widget.querySelector('.enum-native__select');
    const addSelectedBtn = widget.querySelector('.enum-native__add-selected');
    const addNewBtn      = widget.querySelector('.enum-native__add-new');

    if (!select || !addSelectedBtn || !addNewBtn) return;

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
        const opt = document.createElement('option');
        opt.value = en;
        opt.textContent = formatEnumOptionLabel(entry);
        select.appendChild(opt);
      });

      if (prev) select.value = prev;
    }

    function clearNewInputs() {
      getEnabledMenuLangsFromState().forEach(code => {
        const inp = widget.querySelector(`.enum-native__new-${code}`);
        if (inp) inp.value = '';
      });
    }

    function addToItem(entry) {
      if (!entry) return;
      const en = String(entry.en || '').trim();
      if (!en) return;

      if (!item[field]) item[field] = [];
      const exists = item[field].some(e =>
        String(e.en || '').toLowerCase() === en.toLowerCase()
      );
      if (exists) return;

      const canonical = ensureInDict(field, entry);
      const row = { en: canonical.en, bg: canonical.bg || canonical.en };
      ['tr', 'ru', 'el'].forEach(c => {
        if (canonical[c]) row[c] = canonical[c];
      });
      item[field].push(row);

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

      select.value = '';
      clearNewInputs();
    }

    function addSelected() {
      const en = select.value;
      if (!en) return;
      const full = getSortedEnums(field).find(e => String(e.en || '').trim() === en);
      if (full) addToItem({ ...full });
    }

    function addNew() {
      const vals = {};
      getEnabledMenuLangsFromState().forEach(code => {
        const inp = widget.querySelector(`.enum-native__new-${code}`);
        if (inp) vals[code] = inp.value.trim();
      });
      let en = vals.en || '';
      if (!en) en = vals.bg || vals.tr || vals.ru || vals.el || '';
      if (!en) return;
      addToItem(vals);
    }

    addSelectedBtn.addEventListener('click', addSelected);
    addNewBtn.addEventListener('click', addNew);
    getEnabledMenuLangsFromState().forEach(code => {
      widget.querySelector(`.enum-native__new-${code}`)?.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
          e.preventDefault();
          addNew();
        }
      });
    });

    populateSelect();
  }

  /* ── RENDER ITEM TAGS ─────────────────────────────────────── */
  function buildEnumChip(entry, onRemove) {
    const chip = document.createElement('span');
    chip.className = 'item-tag-chip';
    chip.innerHTML = `
      <span class="item-tag-chip__en">${esc(formatEnumOptionLabel(entry))}</span>
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
    const enabledItem = getEnabledMenuLangsFromState();
    const nameTxt = primaryLocalizedName(item.name, enabledItem) || 'New item';

    // Generate quantity metric options
    const metricsOptions = quantityMetrics.map(m =>
      `<option value="${esc(m.code)}" ${item.quantity?.metric === m.code ? 'selected' : ''}>${esc((m.description && (m.description[adminLang] || m.description.en)) || m.code)} (${esc((m.label && (m.label[adminLang] || m.label.en)) || m.code)})</option>`
    ).join('');

    if (!item.name || typeof item.name !== 'object') item.name = {};
    if (!item.description || typeof item.description !== 'object') item.description = {};

    const nameFields = orderEnabledLangsForFields(enabledItem)
      .map(code => {
        const v = item.name[code] || '';
        return `
            <div class="item-field-row">
              <label>${esc(tr(ITEM_NAME_LABEL_KEY[code]))}</label>
              <input class="item-name-${code}" type="text" value="${esc(v)}" placeholder="${esc(tr(ITEM_NAME_PH_KEY[code]))}" />
            </div>`;
      })
      .join('');
    const descFields = orderEnabledLangsForFields(enabledItem)
      .map(code => {
        const v = item.description[code] || '';
        return `
            <div class="item-field-row">
              <label>${esc(tr(ITEM_DESC_LABEL_KEY[code]))}</label>
              <textarea class="item-desc-${code}" placeholder="${esc(tr(ITEM_DESC_PH_KEY[code]))}">${esc(v)}</textarea>
            </div>`;
      })
      .join('');

    const enumPh = {
      tags: {
        en: 'New tag (EN)',
        bg: 'BG (optional)',
        tr: 'TR (optional)',
        ru: 'RU (optional)',
        el: 'EL (optional)'
      },
      ingredients: {
        en: 'New ingredient (EN)',
        bg: 'BG (optional)',
        tr: 'TR (optional)',
        ru: 'RU (optional)',
        el: 'EL (optional)'
      },
      allergens: {
        en: 'New allergen (EN)',
        bg: 'BG (optional)',
        tr: 'TR (optional)',
        ru: 'RU (optional)',
        el: 'EL (optional)'
      }
    };
    function enumNewRowsFor(fieldKey) {
      const ph = enumPh[fieldKey];
      return orderEnabledLangsForFields(enabledItem)
        .map(
          code => `
                <div class="enum-native__row">
                  <input type="text" class="enum-native__new-${code}" placeholder="${esc(ph[code] || ph.en)}" autocomplete="off" />
                </div>`
        )
        .join('');
    }

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
                ${enumNewRowsFor('tags')}
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
                ${enumNewRowsFor('ingredients')}
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
                ${enumNewRowsFor('allergens')}
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

    orderEnabledLangsForFields(enabledItem).forEach(code => {
      block.querySelector(`.item-name-${code}`)?.addEventListener('input', e => {
        if (!item.name || typeof item.name !== 'object') item.name = {};
        item.name[code] = e.target.value;
        block.querySelector('.item-block__name').textContent =
          primaryLocalizedName(item.name, enabledItem) || 'New item';
        setDirty(true);
      });
      block.querySelector(`.item-desc-${code}`)?.addEventListener('input', e => {
        if (!item.description || typeof item.description !== 'object') item.description = {};
        item.description[code] = e.target.value;
        setDirty(true);
      });
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
    cats.push({ id: newId, name: emptyLocalizedRecord(), items: [] });
    renderCategories(cats);
    setDirty(true);
    // Open and scroll to new block
    const last = categoriesList.lastElementChild;
    if (last) {
      last.classList.add('open');
      setTimeout(() => last.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
      last.querySelector('.category-section__toggle')?.focus();
    }
  });

  /* ── COLLECT FORM DATA ───────────────────────────────────── */
  function collectFormData() {
    const r = menuData.restaurant;
    if (!r.menu.config) r.menu.config = {};
    if (!r.name || typeof r.name !== 'object') r.name = {};
    if (!r.description || typeof r.description !== 'object') r.description = {};
    KNOWN_MENU_LANGS.forEach(code => {
      const cap = langCap(code);
      const ne = document.getElementById(`infoName${cap}`);
      const de = document.getElementById(`infoDesc${cap}`);
      if (ne) r.name[code] = ne.value.trim();
      if (de) r.description[code] = de.value.trim();
    });
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
    const resCfg = document.getElementById('cfgReservations');
    if (resCfg) r.menu.config.reservations_enabled = resCfg.checked;
    const dursStr = (document.getElementById('cfgResDurations')?.value || '').trim();
    if (dursStr) {
      const arr = dursStr.split(/[\s,;]+/)
        .map(s => parseInt(s, 10))
        .filter(n => n > 0 && n <= 24 * 60);
      r.menu.config.reservation_allowed_durations_minutes = arr.length ? arr : [120];
    } else {
      r.menu.config.reservation_allowed_durations_minutes = [120];
    }
    const fMin = document.getElementById('cfgResForfeit')?.value;
    if (fMin !== undefined && fMin !== '') {
      const fi = Math.max(0, Math.min(24 * 60, parseInt(fMin, 10) || 0));
      r.menu.config.reservation_forfeit_minutes = fi;
    } else {
      r.menu.config.reservation_forfeit_minutes = 30;
    }
    r.menu.config.enabled_languages = [];
    MENU_LANG_OPTIONS.forEach(({ code, id }) => {
      if (document.getElementById(id)?.checked) r.menu.config.enabled_languages.push(code);
    });
    const enabled = normalizeEnabledLanguages(r.menu.config);
    if (!enabled.includes(r.default_language)) {
      r.default_language = enabled[0] || 'en';
      const il = document.getElementById('infoLang');
      if (il) il.value = r.default_language;
    }
    if (!r.menu.config.currencies) r.menu.config.currencies = {};
    r.menu.config.currencies = normalizeCurrencyConfig(r.menu.config.currencies, currentRestaurant);
    const tzEl = document.getElementById('cfgTimezone');
    if (tzEl) r.menu.config.timezone = tzEl.value || 'Europe/Sofia';
    // Categories and items are already mutated in-place
  }

  /* ── SAVE TO BACKEND (JPA) ───────────────────────────────── */
  saveBtn.addEventListener('click', async () => {
    if (!MENU_LANG_OPTIONS.some(({ id }) => document.getElementById(id)?.checked)) {
      showToast(tr('langMustPickOne'), 'error');
      return;
    }
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

  /* ── Restaurant hub (staff nav Venue: tap = sections, hold ~500ms = workspace picker) ── */
  const VENUE_LONG_PRESS_MS = 500;
  const VENUE_LONG_PRESS_MOVE_PX = 12;
  let venueLongPressTimer = null;
  let venueLongPressStartX = 0;
  let venueLongPressStartY = 0;
  let suppressNextVenueTap = false;

  function cancelVenueLongPress() {
    if (venueLongPressTimer) {
      clearTimeout(venueLongPressTimer);
      venueLongPressTimer = null;
    }
  }

  restaurantHubNavBtn?.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (editorScreen.classList.contains('hidden')) return;
    venueLongPressStartX = e.clientX;
    venueLongPressStartY = e.clientY;
    suppressNextVenueTap = false;
    cancelVenueLongPress();
    venueLongPressTimer = setTimeout(() => {
      venueLongPressTimer = null;
      if (scopedRestaurantIds.length < 2) return;
      suppressNextVenueTap = true;
      closeRestaurantHub();
      openWorkspacePicker('editor');
    }, VENUE_LONG_PRESS_MS);
  });

  restaurantHubNavBtn?.addEventListener('pointermove', (e) => {
    if (!venueLongPressTimer) return;
    if (Math.hypot(e.clientX - venueLongPressStartX, e.clientY - venueLongPressStartY) > VENUE_LONG_PRESS_MOVE_PX) {
      cancelVenueLongPress();
    }
  });

  ['pointerup', 'pointercancel'].forEach((evt) => {
    restaurantHubNavBtn?.addEventListener(evt, cancelVenueLongPress);
  });

  restaurantHubNavBtn?.addEventListener('click', (e) => {
    if (editorScreen.classList.contains('hidden')) return;
    if (suppressNextVenueTap) {
      e.preventDefault();
      suppressNextVenueTap = false;
      return;
    }
    openRestaurantHub();
  });

  restaurantHubBackdrop?.addEventListener('click', closeRestaurantHub);
  document.getElementById('restaurantHubClose')?.addEventListener('click', closeRestaurantHub);
  document.getElementById('restaurantHubList')?.addEventListener('click', e => {
    const row = e.target.closest('.rh-hub-item');
    if (!row || row.classList.contains('hidden')) return;
    const tab = row.dataset.tab;
    if (!tab) return;
    if ((tab === 'layout' || tab === 'reservations') && !sessionSuperAdmin) return;
    switchTab(tab);
    closeRestaurantHub();
  });

  attachAdminSheetSwipeDown(
    restaurantHubSheet,
    () => document.getElementById('restaurantHubList'),
    adminSheetSwipeBottomHubOrWs,
    closeRestaurantHub
  );
  attachAdminSheetSwipeDown(
    workspacePickerSheet,
    () => document.getElementById('wsPickerList'),
    adminSheetSwipeBottomHubOrWs,
    closeWorkspacePicker
  );
  attachAdminSheetSwipeDown(
    catSettingsSheet,
    () => document.getElementById('catSettingsBody'),
    adminSheetSwipeBottomCat,
    closeCategorySettingsSheet
  );
  attachAdminSheetSwipeDown(
    userDetailsSheet,
    () => userDetailsBody,
    adminSheetSwipeBottomHubOrWs,
    closeUserDetailsSheet
  );

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

  if (getAuthToken()) {
    enterAuthSessionBoot();
  }

  authWorkspacePickBtn?.addEventListener('click', () => openWorkspacePicker('auth'));
  workspacePickerBackdrop?.addEventListener('click', closeWorkspacePicker);
  wsPickerClose?.addEventListener('click', closeWorkspacePicker);
  wsPickerSearch?.addEventListener('input', () => populateWorkspacePickerList(wsPickerSearch.value));
  catSettingsBackdrop?.addEventListener('click', closeCategorySettingsSheet);
  catSettingsClose?.addEventListener('click', closeCategorySettingsSheet);
  userDetailsBackdrop?.addEventListener('click', closeUserDetailsSheet);
  userDetailsClose?.addEventListener('click', closeUserDetailsSheet);

  staffAccountNavBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    toggleStaffAccountMenu();
  });
  staffAccountMenuBackdrop?.addEventListener('click', () => closeStaffAccountMenu());
  staffAccountMenuDetails?.addEventListener('click', () => {
    void openStaffUserDetailsSheet();
  });
  staffAccountMenuLogout?.addEventListener('click', () => {
    void signOutSession();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (staffAccountMenuRoot && !staffAccountMenuRoot.classList.contains('hidden')) {
      closeStaffAccountMenu();
      return;
    }
    if (userDetailsLayer && adminSheetLayerIsOpen(userDetailsLayer)) {
      closeUserDetailsSheet();
      return;
    }
    if (catSettingsLayer && adminSheetLayerIsOpen(catSettingsLayer)) {
      closeCategorySettingsSheet();
      return;
    }
    if (workspacePickerLayer && adminSheetLayerIsOpen(workspacePickerLayer)) {
      closeWorkspacePicker();
      return;
    }
    if (restaurantHubLayer && adminSheetLayerIsOpen(restaurantHubLayer)) {
      closeRestaurantHub();
    }
  });

  (async () => {
    try {
      const restored = await restoreSessionIfPossible();
      if (!restored) {
        showCredentialsUi();
        return;
      }
      if (scopedRestaurantIds.length > 0) {
        await openEditorForRestaurantId(scopedRestaurantIds[0]);
        if (!editorScreen.classList.contains('hidden')) {
          exitAuthSessionBoot();
        } else {
          showPostAuthUi();
        }
        return;
      }
      showPostAuthUi();
    } catch (_) {
      showCredentialsUi();
    }
  })();

  /* ============================================================
     PUSH NOTIFICATIONS
     ============================================================ */

  const NOTIF_SOUND_KEY = 'notif_sound_pref';

  /** Convert URL-safe base64 string → Uint8Array (needed for pushManager.subscribe). */
  function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(base64);
    return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
  }

  /* ── Persistent AudioContext ────────────────────────────────
     We keep ONE AudioContext alive for the whole admin session.
     Chrome's autoplay policy requires a user gesture to START an
     AudioContext, but once it has been resumed via a gesture it
     can be re-resumed later — even from a background-tab message
     handler — without another gesture.  That is what lets us play
     a custom sound when a push arrives on a minimised/background tab.
     ──────────────────────────────────────────────────────────── */
  let _audioCtx = null;

  function getAudioCtx() {
    if (!_audioCtx) {
      try {
        _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      } catch (_) { return null; }
    }
    return _audioCtx;
  }

  /**
   * Call on any user interaction so Chrome "warms" the AudioContext.
   * After warming, resume() works silently even with no gesture present
   * (e.g. when a push message wakes a background tab).
   */
  function warmAudioCtx() {
    const ctx = getAudioCtx();
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
  }

  /* Warm the AudioContext on the first click anywhere in the panel */
  document.addEventListener('click', warmAudioCtx, { passive: true, capture: true });

  /* ── Web Audio sound generators ─────────────────────────── */
  const SOUNDS = {
    ding: (ctx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.4);
      gain.gain.setValueAtTime(0.6, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.5);
    },
    chime: (ctx) => {
      [523, 659, 784].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.connect(gain); gain.connect(ctx.destination);
        osc.frequency.value = freq;
        const t = ctx.currentTime + i * 0.12;
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.45, t + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
        osc.start(t); osc.stop(t + 0.6);
      });
    },
    pulse: (ctx) => {
      [440, 440].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.frequency.value = freq;
        const t = ctx.currentTime + i * 0.22;
        gain.gain.setValueAtTime(0.5, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
        osc.start(t); osc.stop(t + 0.2);
      });
    },
    none: () => {}
  };

  /**
   * Play a notification sound using the shared (pre-warmed) AudioContext.
   * Returns a Promise so the SW message handler can fire-and-forget it.
   * If the context is suspended (e.g. browser throttled the background tab),
   * we resume it first — Chrome allows this after a prior user-gesture resume.
   */
  async function playNotificationSound(name) {
    const key = name || localStorage.getItem(NOTIF_SOUND_KEY) || 'ding';
    if (key === 'none') return;
    try {
      const ctx = getAudioCtx();
      if (!ctx) return;
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }
      (SOUNDS[key] || SOUNDS.ding)(ctx);
    } catch (_) {}
  }

  /* ── Service Worker registration ───────────────────────── */
  async function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return null;
    try {
      const reg = await navigator.serviceWorker.register('../sw.js', { scope: '../' });
      /* Listen for push sound messages from the SW */
      navigator.serviceWorker.addEventListener('message', e => {
        if (e.data && e.data.type === 'PLAY_NOTIFICATION_SOUND') {
          playNotificationSound();
        }
      });
      return reg;
    } catch (err) {
      console.warn('SW registration failed:', err);
      return null;
    }
  }

  let _swRegistration = null;

  /* ── Notifications panel logic ──────────────────────────── */
  async function renderNotificationsTab() {
    const rid = activeWorkspaceId || currentRestaurant?.id;
    if (!rid) return;

    const supported = 'serviceWorker' in navigator && 'PushManager' in window;
    const isIosNonStandalone = /iphone|ipad|ipod/i.test(navigator.userAgent)
      && !window.navigator.standalone;

    const iosHint       = document.getElementById('notifIosHint');
    const unsupported   = document.getElementById('notifUnsupported');
    const enableRow     = document.getElementById('notifEnableRow');
    const toggleBtn     = document.getElementById('notifToggleBtn');
    const toggleTitle   = document.getElementById('notifEnableTitle');
    const toggleSub     = document.getElementById('notifEnableSub');
    const deniedEl      = document.getElementById('notifDenied');
    const prefsSection  = document.getElementById('notifPrefsSection');
    const soundSection  = document.getElementById('notifSoundSection');
    const soundPicker   = document.getElementById('notifSoundPicker');

    if (!supported || isIosNonStandalone) {
      if (isIosNonStandalone && iosHint) iosHint.classList.remove('hidden');
      else if (!supported && unsupported) unsupported.classList.remove('hidden');
      if (enableRow) enableRow.classList.add('hidden');
      return;
    }

    /* Ensure SW is registered */
    if (!_swRegistration) {
      _swRegistration = await registerServiceWorker();
    }

    /* Check current permission state */
    const permission = Notification.permission;
    if (permission === 'denied') {
      if (deniedEl) deniedEl.classList.remove('hidden');
      if (enableRow) enableRow.classList.add('hidden');
      return;
    }

    /* Use the browser push manager as the source of truth for THIS device.
       Backend state can lag (e.g. expired subscriptions), but the browser
       always knows whether it currently holds an active push subscription. */
    let isSubscribed = false;
    if (_swRegistration) {
      try {
        const browserSub = await _swRegistration.pushManager.getSubscription();
        isSubscribed = browserSub !== null;
      } catch (_) {}
    }

    /* Update toggle UI */
    if (toggleBtn) {
      toggleBtn.setAttribute('aria-pressed', String(isSubscribed));
      toggleBtn.classList.toggle('is-on', isSubscribed);
    }
    if (toggleTitle) toggleTitle.textContent = adminLang === 'bg'
      ? 'Получавай известия на това устройство'
      : 'Receive notifications on this device';
    if (toggleSub) toggleSub.textContent = isSubscribed
      ? (adminLang === 'bg' ? 'Активно — кликни за изключване' : 'Active — tap to disable')
      : (adminLang === 'bg' ? 'Кликни за активиране' : 'Tap to enable');

    /* Show prefs + sound sections when subscribed */
    if (prefsSection) prefsSection.classList.toggle('hidden', !isSubscribed);
    if (soundSection) soundSection.classList.toggle('hidden', !isSubscribed);

    if (isSubscribed) {
      await loadNotifPrefs(rid);
    }

    /* Restore saved sound preference */
    if (soundPicker) {
      soundPicker.value = localStorage.getItem(NOTIF_SOUND_KEY) || 'ding';
    }

    /* Wire toggle button (only once) */
    if (toggleBtn && !toggleBtn.dataset.wired) {
      toggleBtn.dataset.wired = '1';
      toggleBtn.addEventListener('click', () => handleNotifToggle(rid));
    }

    /* Sound picker */
    if (soundPicker && !soundPicker.dataset.wired) {
      soundPicker.dataset.wired = '1';
      soundPicker.addEventListener('change', () => {
        localStorage.setItem(NOTIF_SOUND_KEY, soundPicker.value);
      });
    }

    /* Sound test button */
    const testBtn = document.getElementById('notifSoundTest');
    if (testBtn && !testBtn.dataset.wired) {
      testBtn.dataset.wired = '1';
      testBtn.addEventListener('click', () => playNotificationSound(soundPicker?.value));
    }
  }

  async function handleNotifToggle(rid) {
    const btn = document.getElementById('notifToggleBtn');
    if (btn) btn.disabled = true;

    const currentlyOn = btn && btn.getAttribute('aria-pressed') === 'true';

    if (currentlyOn) {
      await doUnsubscribe(rid);
    } else {
      await doSubscribe(rid);
    }

    if (btn) btn.disabled = false;
    await renderNotificationsTab();
  }

  async function doSubscribe(rid) {
    if (!_swRegistration) {
      _swRegistration = await registerServiceWorker();
      if (!_swRegistration) { showToast('Service worker not available.', 'error'); return; }
    }

    /* Get VAPID public key */
    let vapidKey;
    try {
      const res = await fetch(`${getMenuApiBase()}/api/admin/push/vapid-key`,
        { headers: { Authorization: 'Bearer ' + getAuthToken() } });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      vapidKey = data.publicKey;
    } catch (e) {
      showToast('Could not load push config from server.', 'error');
      return;
    }

    /* Request permission and create browser subscription */
    let pushSub;
    try {
      pushSub = await _swRegistration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey)
      });
    } catch (e) {
      if (Notification.permission === 'denied') {
        const deniedEl = document.getElementById('notifDenied');
        if (deniedEl) deniedEl.classList.remove('hidden');
      } else {
        showToast('Could not create push subscription: ' + e.message, 'error');
      }
      return;
    }

    /* Save to backend */
    const json = pushSub.toJSON();
    try {
      const res = await fetch(
        `${getMenuApiBase()}/api/admin/push/subscriptions/${encodeURIComponent(rid)}`,
        {
          method: 'POST',
          headers: authJsonHeaders(),
          body: JSON.stringify({
            endpoint: json.endpoint,
            p256dh:   json.keys.p256dh,
            auth:     json.keys.auth
          })
        });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      showToast(adminLang === 'bg' ? 'Известията са активирани!' : 'Notifications enabled!', 'success');
    } catch (e) {
      showToast('Failed to save subscription: ' + e.message, 'error');
    }
  }

  async function doUnsubscribe(rid) {
    /* Capture the endpoint BEFORE unsubscribing so we can tell the backend
       exactly which device to remove (supports multiple devices per account). */
    let endpoint = null;
    if (_swRegistration) {
      try {
        const sub = await _swRegistration.pushManager.getSubscription();
        if (sub) {
          endpoint = sub.endpoint;
          await sub.unsubscribe();
        }
      } catch (_) {}
    }

    /* Remove THIS device's subscription from the backend */
    try {
      const base = `${getMenuApiBase()}/api/admin/push/subscriptions/${encodeURIComponent(rid)}`;
      const url  = endpoint ? base + '?endpoint=' + encodeURIComponent(endpoint) : base;
      await fetch(url, { method: 'DELETE', headers: { Authorization: 'Bearer ' + getAuthToken() } });
    } catch (_) {}

    showToast(adminLang === 'bg' ? 'Известията са изключени.' : 'Notifications disabled.', 'success');
  }

  async function loadNotifPrefs(rid) {
    const list = document.getElementById('notifPrefsList');
    if (!list) return;

    let prefs = [];
    try {
      const res = await fetch(
        `${getMenuApiBase()}/api/admin/push/preferences/${encodeURIComponent(rid)}`,
        { headers: { Authorization: 'Bearer ' + getAuthToken() } });
      if (res.ok) prefs = await res.json();
    } catch (_) { return; }

    const EVENT_LABELS = {
      NEW_RESERVATION: { en: 'New reservation submitted', bg: 'Нова резервация' }
    };

    list.innerHTML = '';
    prefs.forEach(pref => {
      const label = EVENT_LABELS[pref.eventType]?.[adminLang] || pref.eventType;
      const row = document.createElement('label');
      row.className = 'toggle-row';
      row.innerHTML = `
        <span class="toggle-row__label">${label}</span>
        <input type="checkbox" class="toggle-cb notif-pref-cb" data-event="${pref.eventType}"
               ${pref.enabled ? 'checked' : ''} />
        <span class="toggle-switch"></span>`;
      list.appendChild(row);
    });

    /* Save on change */
    list.addEventListener('change', async e => {
      const cb = e.target.closest('.notif-pref-cb');
      if (!cb) return;
      const updated = [...list.querySelectorAll('.notif-pref-cb')].map(c => ({
        eventType: c.dataset.event,
        enabled: c.checked
      }));
      try {
        await fetch(
          `${getMenuApiBase()}/api/admin/push/preferences/${encodeURIComponent(rid)}`,
          { method: 'PUT', headers: authJsonHeaders(), body: JSON.stringify(updated) });
      } catch (_) {}
    });
  }

  /* Register SW as soon as the user is logged in */
  registerServiceWorker().then(reg => { _swRegistration = reg; });

})();
