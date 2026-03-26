/* ============================================================
   admin.js — Menu Admin Panel
   ============================================================ */

(function () {
  'use strict';

  /* ── CONFIG ─────────────────────────────────────────────── */
  const JSONBIN_BASE    = 'https://api.jsonbin.io/v3/b';
  const SESSION_KEY_KEY = 'admin_master_key';
  const ADMIN_LANG_KEY  = 'preferredLang';
  let adminLang         = localStorage.getItem(ADMIN_LANG_KEY) || 'bg';

  const I18N = {
    en: {
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
      quantityPh: 'e.g. 250'
    },
    bg: {
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
      quantityPh: 'напр. 250'
    }
  };
  const tr = (k) => (I18N[adminLang] && I18N[adminLang][k]) || I18N.en[k] || k;
  const isBgFirst = () => adminLang === 'bg';

  function getMasterKey() {
    return sessionStorage.getItem(SESSION_KEY_KEY) || '';
  }
  function setMasterKey(val) {
    if (val) sessionStorage.setItem(SESSION_KEY_KEY, val);
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

  /* ── CLOUDINARY CONFIG ──────────────────────────────────── */
  const CLD_CLOUD_KEY  = 'cld_cloud_name';
  const CLD_KEY_KEY    = 'cld_api_key';
  const CLD_SECRET_KEY = 'cld_api_secret';

  function getCldConfig() {
    return {
      cloudName: sessionStorage.getItem(CLD_CLOUD_KEY)  || '',
      apiKey:    sessionStorage.getItem(CLD_KEY_KEY)    || '',
      apiSecret: sessionStorage.getItem(CLD_SECRET_KEY) || ''
    };
  }
  function saveCldConfig(cloudName, apiKey, apiSecret) {
    if (cloudName !== undefined) sessionStorage.setItem(CLD_CLOUD_KEY,  cloudName);
    if (apiKey    !== undefined) sessionStorage.setItem(CLD_KEY_KEY,    apiKey);
    if (apiSecret !== undefined) sessionStorage.setItem(CLD_SECRET_KEY, apiSecret);
  }

  /* ── CLOUDINARY UPLOAD ──────────────────────────────────── */
  const CLD_MAX_BYTES = 5 * 1024 * 1024; // 5 MB

  async function computeSha256Hex(str) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Upload a File to Cloudinary using SHA-256 signed uploads.
   * @param {File}     file
   * @param {string}   folder   e.g. "restaurant_menu/tavernaki"
   * @param {Function} onProgress  called with 0-100 percent
   * @returns {Promise<string>}  secure_url
   */
  async function uploadToCloudinary(file, folder, onProgress) {
    const { cloudName, apiKey, apiSecret } = getCldConfig();

    if (!cloudName || !apiKey || !apiSecret) {
      throw new Error(
        'Cloudinary credentials missing.\n' +
        'Open the "Cloudinary — Image uploads" section on the login screen and fill in Cloud Name, API Key, and API Secret.'
      );
    }
    if (file.size > CLD_MAX_BYTES) {
      throw new Error(`Image too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum is 5 MB.`);
    }
    if (!file.type.startsWith('image/')) {
      throw new Error('Only image files (JPEG, PNG, WebP, GIF…) are allowed.');
    }

    const timestamp = Math.floor(Date.now() / 1000);
    // Params to sign: alphabetically sorted, excluding file/cloud_name/resource_type/api_key
    const signParams = { folder, timestamp };
    const sigString  = Object.keys(signParams).sort()
      .map(k => `${k}=${signParams[k]}`).join('&') + apiSecret;
    const signature  = await computeSha256Hex(sigString);

    const form = new FormData();
    form.append('file',                file);
    form.append('api_key',             apiKey);
    form.append('timestamp',           timestamp);
    form.append('folder',              folder);
    form.append('signature',           signature);
    form.append('signature_algorithm', 'sha256');

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/image/upload`);

      if (onProgress) {
        xhr.upload.addEventListener('progress', e => {
          if (e.lengthComputable) onProgress(Math.round(e.loaded / e.total * 100));
        });
      }

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(JSON.parse(xhr.responseText).secure_url);
        } else {
          try {
            const err = JSON.parse(xhr.responseText);
            reject(new Error(err.error?.message || `Cloudinary error (HTTP ${xhr.status})`));
          } catch {
            reject(new Error(`Upload failed (HTTP ${xhr.status})`));
          }
        }
      };
      xhr.onerror   = () => reject(new Error('Network error during upload.'));
      xhr.onabort   = () => reject(new Error('Upload cancelled.'));
      xhr.send(form);
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
        const url = await uploadToCloudinary(file, folder, pct => {
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
  let restaurants     = [];
  let quantityMetrics = [];       // from restaurants.json
  let currentRestaurant = null;   // entry from restaurants.json
  let menuData        = null;     // the full { restaurant: {...} } object
  let isDirty         = false;
  let editorSessionStart = 0;

  /** Firebase / GA4 — all admin events include restaurant_id when in editor. */
  function adminTrack(name, params = {}) {
    const rid = (currentRestaurant && currentRestaurant.id) ? String(currentRestaurant.id).slice(0, 40) : '';
    const merged = { restaurant_id: rid, ...params };
    for (const k of Object.keys(merged)) {
      const v = merged[k];
      if (typeof v === 'string' && v.length > 100) merged[k] = v.slice(0, 100);
    }
    if (typeof window.trackEvent === 'function') window.trackEvent(name, merged);
  }

  let adminEditDebounce = null;

  /* ── DOM REFS ───────────────────────────────────────────── */
  const masterKeyInput  = document.getElementById('masterKeyInput');
  const masterKeyToggle = document.getElementById('masterKeyToggle');
  const sharedPasswordInput  = document.getElementById('sharedPasswordInput');
  const sharedPasswordToggle = document.getElementById('sharedPasswordToggle');
  const authScreen   = document.getElementById('authScreen');
  const editorScreen = document.getElementById('editorScreen');
  const authGrid     = document.getElementById('authGrid');
  const restaurantSelect = document.getElementById('restaurantSelect');
  const authLoginBtn     = document.getElementById('authLoginBtn');
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

    const nameSection = document.getElementById('infoNameEnRow')?.parentElement;
    const descSection = document.getElementById('infoDescEnRow')?.parentElement;
    reorderPair(nameSection, 'infoNameEnRow', 'infoNameBgRow');
    reorderPair(descSection, 'infoDescEnRow', 'infoDescBgRow');

    if (rerender && menuData && !editorScreen.classList.contains('hidden')) {
      renderCategories(menuData.restaurant.menu.categories);
    }
  }

  /* ── PASSWORD HASHING ───────────────────────────────────── */
  async function sha256Hex(text) {
    const encoded = new TextEncoder().encode(text);
    const buf = await crypto.subtle.digest('SHA-256', encoded);
    return Array.from(new Uint8Array(buf))
      .map(b => b.toString(16).padStart(2, '0')).join('');
  }

  // Current scheme: sha256(password). Legacy fallback: sha256(restaurantId:password).
  async function hashPassword(password) {
    return sha256Hex(password);
  }
  async function hashPasswordLegacy(restaurantId, password) {
    return sha256Hex(`${restaurantId}:${password}`);
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

  /* ── FETCH RESTAURANTS ───────────────────────────────────── */
  async function loadRestaurants() {
    try {
      const res = await fetch('../resources/restaurants.json');
      if (!res.ok) throw new Error();
      const data = await res.json();
      // Extract restaurants and metrics from new structure
      quantityMetrics = data.quantity_metrics || [];
      restaurants = data.restaurants || (Array.isArray(data) ? data : []);
      renderRestaurantSelect();
    } catch {
      authGrid.innerHTML = '<p style="color:rgba(240,236,228,0.4);grid-column:1/-1">Could not load restaurants list.</p>';
    }
  }

  /* ── RESTAURANT SELECT ────────────────────────────────────── */
  function renderRestaurantSelect() {
    if (!restaurantSelect) return;
    restaurantSelect.innerHTML = '';

    const opts = restaurants
      .map(r => {
        const hasBin = r.menu_bin_id && r.menu_bin_id !== 'PASTE_BIN_ID_HERE';
        const status = hasBin ? 'Connected' : 'No bin ID';
        const suffix = hasBin ? '' : ' (inactive)';
        const label = `${r.name.en || r.id} — ${status}${suffix}`;
        return { value: r.id, label };
      })
      .filter(x => x.value);

    opts.forEach(o => {
      const opt = document.createElement('option');
      opt.value = o.value;
      opt.textContent = o.label;
      restaurantSelect.appendChild(opt);
    });

    if (!restaurantSelect.value && opts[0]) restaurantSelect.value = opts[0].value;

    // Auto-clear error and allow Enter key to submit.
    if (authErrorEl) authErrorEl.style.display = 'none';
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
        ${meta.code === currencyCfg.base ? `<span class="currency-chip__main-badge">MAIN</span>` : ''}
      `;
      chip.title = meta.code === currencyCfg.base ? 'Main currency' : 'Set as main currency';
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
        ${code === currencyCfg.base ? `<span class="currency-chip__main-badge">MAIN</span>` : ''}
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

  /* ── MASTER KEY TOGGLE ───────────────────────────────────── */
  masterKeyToggle.addEventListener('click', () => {
    const isHidden = masterKeyInput.type === 'password';
    masterKeyInput.type  = isHidden ? 'text' : 'password';
    masterKeyToggle.title = isHidden ? 'Hide key' : 'Show key';
  });
  sharedPasswordToggle?.addEventListener('click', () => {
    const isHidden = sharedPasswordInput.type === 'password';
    sharedPasswordInput.type  = isHidden ? 'text' : 'password';
    sharedPasswordToggle.title = isHidden ? 'Hide password' : 'Show password';
  });
  sharedPasswordInput?.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      if (authLoginBtn) authLoginBtn.click();
    }
  });

  // Pre-fill from sessionStorage if available
  const savedKey = getMasterKey();
  if (savedKey) masterKeyInput.value = savedKey;

  /* ── CLOUDINARY FIELD WIRING ─────────────────────────────── */
  const cldCloudNameEl  = document.getElementById('cldCloudName');
  const cldApiKeyEl     = document.getElementById('cldApiKey');
  const cldApiSecretEl  = document.getElementById('cldApiSecret');
  const cldSecretToggle = document.getElementById('cldApiSecretToggle');

  // Pre-fill from sessionStorage
  const { cloudName: savedCloud, apiKey: savedCldKey, apiSecret: savedCldSecret } = getCldConfig();
  if (savedCloud)     cldCloudNameEl.value  = savedCloud;
  if (savedCldKey)    cldApiKeyEl.value     = savedCldKey;
  if (savedCldSecret) cldApiSecretEl.value  = savedCldSecret;

  // Save to sessionStorage on change
  cldCloudNameEl.addEventListener('input',  () => saveCldConfig(cldCloudNameEl.value.trim(),  undefined, undefined));
  cldApiKeyEl.addEventListener('input',     () => saveCldConfig(undefined, cldApiKeyEl.value.trim(),    undefined));
  cldApiSecretEl.addEventListener('input',  () => saveCldConfig(undefined, undefined, cldApiSecretEl.value.trim()));

  // Toggle visibility of API secret
  if (cldSecretToggle) {
    cldSecretToggle.addEventListener('click', () => {
      const isHidden = cldApiSecretEl.type === 'password';
      cldApiSecretEl.type    = isHidden ? 'text' : 'password';
      cldSecretToggle.title  = isHidden ? 'Hide secret' : 'Show secret';
    });
  }

  // Auto-open the Cloudinary section if credentials are already saved
  const cldSection = document.getElementById('cldSection');
  if (savedCloud || savedCldKey) {
    cldSection?.setAttribute('open', '');
  }

  async function sanityCheckJsonbin(restaurantEntry, masterKey) {
    const hasBin = restaurantEntry.menu_bin_id && restaurantEntry.menu_bin_id !== 'PASTE_BIN_ID_HERE';
    if (!hasBin) return { ok: false, message: 'No menu_bin_id configured for this restaurant.' };

    const res = await fetch(`${JSONBIN_BASE}/${restaurantEntry.menu_bin_id}/latest`, {
      headers: { 'X-Master-Key': masterKey }
    });
    if (!res.ok) {
      let msg = `JsonBin HTTP ${res.status}`;
      try {
        const body = await res.json();
        if (body && body.message) msg = body.message;
      } catch (_) {}
      return { ok: false, message: `JsonBin validation failed: ${msg}` };
    }
    const wrapper = await res.json();
    const rid = wrapper?.record?.restaurant?.id;
    if (rid && rid !== restaurantEntry.id) {
      return { ok: false, message: `Bin mismatch: expected "${restaurantEntry.id}", got "${rid}".` };
    }
    return { ok: true };
  }

  async function sanityCheckCloudinaryIfConfigured() {
    const { cloudName, apiKey, apiSecret } = getCldConfig();
    const any = !!(cloudName || apiKey || apiSecret);
    if (!any) return { ok: true };
    if (!cloudName || !apiKey || !apiSecret) {
      return { ok: false, message: 'Cloudinary check failed: fill Cloud Name, API Key and API Secret.' };
    }

    const timestamp = Math.floor(Date.now() / 1000);
    const folder = 'restaurant_menu/_sanity_checks';
    const signParams = { folder, timestamp };
    const sigString  = Object.keys(signParams).sort()
      .map(k => `${k}=${signParams[k]}`).join('&') + apiSecret;
    const signature = await computeSha256Hex(sigString);
    const onePxPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5vWn0AAAAASUVORK5CYII=';

    const form = new FormData();
    form.append('file', onePxPng);
    form.append('api_key', apiKey);
    form.append('timestamp', String(timestamp));
    form.append('folder', folder);
    form.append('signature_algorithm', 'sha256');
    form.append('signature', signature);

    const res = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/image/upload`, {
      method: 'POST',
      body: form
    });
    if (!res.ok) {
      let msg = `Cloudinary HTTP ${res.status}`;
      try {
        const body = await res.json();
        msg = body?.error?.message || msg;
      } catch (_) {}
      return { ok: false, message: `Cloudinary validation failed: ${msg}` };
    }
    return { ok: true };
  }

  /* ── AUTHENTICATE ────────────────────────────────────────── */
  async function attemptAuth(restaurantEntry, triggerBtn) {
    const pw  = sharedPasswordInput.value.trim();
    const key = masterKeyInput.value.trim();

    if (!key) {
      masterKeyInput.focus();
      masterKeyInput.classList.add('field-error');
      setTimeout(() => masterKeyInput.classList.remove('field-error'), 1200);
      showToast('Please enter your jsonbin.io master key first.', 'error');
      return;
    }
    if (!pw) { sharedPasswordInput.focus(); return; }

    if (authErrorEl) authErrorEl.style.display = 'none';
    if (triggerBtn) triggerBtn.disabled = true;

    const hash = await hashPassword(pw);
    const legacy = await hashPasswordLegacy(restaurantEntry.id, pw);
    if (hash !== restaurantEntry.password_hash && legacy !== restaurantEntry.password_hash) {
      adminTrack('admin_auth_fail', { restaurant_id: String(restaurantEntry.id).slice(0, 40) });
      if (authErrorEl) {
        authErrorEl.style.display = 'block';
        authErrorEl.textContent = 'Incorrect admin password (not authorized for this restaurant).';
      }
      sharedPasswordInput.focus();
      if (triggerBtn) triggerBtn.disabled = false;
      return;
    }

    const jsonbinCheck = await sanityCheckJsonbin(restaurantEntry, key);
    if (!jsonbinCheck.ok) {
      adminTrack('admin_auth_fail', { restaurant_id: String(restaurantEntry.id).slice(0, 40), reason: 'jsonbin_sanity' });
      showToast(jsonbinCheck.message, 'error');
      if (authErrorEl) {
        authErrorEl.style.display = 'block';
        authErrorEl.textContent = jsonbinCheck.message;
      }
      if (triggerBtn) triggerBtn.disabled = false;
      return;
    }

    const cloudinaryCheck = await sanityCheckCloudinaryIfConfigured();
    if (!cloudinaryCheck.ok) {
      adminTrack('admin_auth_fail', { restaurant_id: String(restaurantEntry.id).slice(0, 40), reason: 'cloudinary_sanity' });
      showToast(cloudinaryCheck.message, 'error');
      if (authErrorEl) {
        authErrorEl.style.display = 'block';
        authErrorEl.textContent = cloudinaryCheck.message;
      }
      if (triggerBtn) triggerBtn.disabled = false;
      return;
    }

    // Correct + sanity checks passed
    adminTrack('admin_auth_ok', { restaurant_id: String(restaurantEntry.id).slice(0, 40) });
    setMasterKey(key);
    currentRestaurant = restaurantEntry;
    await loadAndOpenEditor();
    if (triggerBtn) triggerBtn.disabled = false;
  }

  /* ── LOAD MENU FROM JSONBIN ──────────────────────────────── */
  async function loadAndOpenEditor() {
    saveBtn.disabled = true;
    const r = currentRestaurant;
    const hasBin = r.menu_bin_id && r.menu_bin_id !== 'PASTE_BIN_ID_HERE';

    try {
      if (!hasBin) {
        showToast(
          'No menu_bin_id for this restaurant. Set menu_bin_id in resources/restaurants.json, then reload.',
          'error'
        );
        saveBtn.disabled = false;
        return;
      }
      const res = await fetch(`${JSONBIN_BASE}/${r.menu_bin_id}/latest`, {
        headers: { 'X-Master-Key': getMasterKey() }
      });
      if (!res.ok) throw new Error(`Jsonbin HTTP ${res.status}`);
      const wrapper = await res.json();
      menuData = wrapper.record;
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
        getMenuUrl:    getPublicMenuUrl
      });
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
    document.querySelectorAll('.editor-tab').forEach(t => {
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
    document.querySelectorAll('.editor-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tabId));
    document.querySelectorAll('.editor-panel').forEach(p => {
      const active = p.id === 'panel-' + tabId;
      p.classList.toggle('active', active);
      p.classList.toggle('hidden', !active);
    });
    adminTrack('admin_tab_view', { tab: String(tabId).slice(0, 40) });
    if (tabId === 'qr' && window.AdminQrFlyers) window.AdminQrFlyers.refresh();
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
        <span class="category-block__count">${itemCount} item${itemCount !== 1 ? 's' : ''}</span>
        <div class="category-block__actions">
          <button class="cat-btn cat-btn--up" title="Move up">↑</button>
          <button class="cat-btn cat-btn--down" title="Move down">↓</button>
          <button class="cat-btn cat-btn--danger cat-btn--del" title="Delete category">Delete</button>
        </div>
        <span class="category-block__chevron">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 5l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </span>
      </div>
      <div class="category-block__body">
        <div class="category-name-fields">
          ${categoryNameFields}
        </div>
        <div class="cat-schedule-section">
          <label class="cat-schedule-toggle">
            <input type="checkbox" class="cat-schedule-cb" ${cat.schedule && cat.schedule.enabled ? 'checked' : ''} />
            <span class="toggle-switch"></span>
            <span class="cat-schedule-label">Timed section</span>
          </label>
          <div class="cat-schedule-fields${cat.schedule && cat.schedule.enabled ? '' : ' hidden'}">
            <div class="cat-schedule-times">
              <div class="cat-schedule-time-field">
                <label>From</label>
                <input type="time" class="cat-schedule-start field-input" value="${esc((cat.schedule && cat.schedule.start_time) || '12:00')}" />
              </div>
              <div class="cat-schedule-time-field">
                <label>To</label>
                <input type="time" class="cat-schedule-end field-input" value="${esc((cat.schedule && cat.schedule.end_time) || '14:00')}" />
              </div>
            </div>
            <div class="cat-schedule-behavior">
              <span class="cat-schedule-behavior-label">Behaviour</span>
              <label class="cat-behavior-row">
                <input type="checkbox" class="cat-schedule-cb cat-schedule-active-top"
                  ${(cat.schedule && cat.schedule.move_active_top !== false) ? 'checked' : ''} />
                <span class="toggle-switch"></span>
                <span>Move to top when currently active</span>
              </label>
              <label class="cat-behavior-row">
                <input type="checkbox" class="cat-schedule-cb cat-schedule-inactive-bottom"
                  ${(cat.schedule && cat.schedule.move_inactive_bottom !== false) ? 'checked' : ''} />
                <span class="toggle-switch"></span>
                <span>Move to bottom when currently inactive</span>
              </label>
            </div>
            <span class="cat-schedule-status"></span>
          </div>
        </div>
        <div class="items-list" id="items-${catIdx}"></div>
        <button class="btn-add-item">+ Add item</button>
      </div>
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
      `${cat.items.length} item${cat.items.length !== 1 ? 's' : ''}`;
    cat.items.forEach((item, itemIdx) => {
      itemsEl.appendChild(buildItemBlock(item, itemIdx, cat, catIdx, catBlock));
    });
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
      if (field === 'tags') return 'Select tag…';
      if (field === 'ingredients') return 'Select ingredient…';
      if (field === 'allergens') return 'Select allergen…';
      return 'Select…';
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
        <span class="item-block__drag">⠿</span>
        <span class="item-block__name">${esc(nameTxt)}</span>
        <span class="item-block__price">${price}${esc(baseSymbol)}</span>
        <span class="item-availability${item.availability ? '' : ' unavailable'}" title="${item.availability ? 'Available' : 'Unavailable'}"></span>
        <span class="item-block__chevron">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 4l4 4 4-4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </span>
      </div>
      <div class="item-block__body">
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
          <button class="btn-delete-item">Delete item</button>
        </div>
      </div>
    `;

    // Expand/collapse
    block.querySelector('.item-block__header').addEventListener('click', () => {
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

  /* ── SAVE TO JSONBIN ─────────────────────────────────────── */
  saveBtn.addEventListener('click', async () => {
    collectFormData();
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving…';
    adminTrack('admin_save_attempt', {});

    const r = currentRestaurant;
    const hasBin = r.menu_bin_id && r.menu_bin_id !== 'PASTE_BIN_ID_HERE';

    if (!hasBin) {
      adminTrack('admin_save_blocked', { reason: 'no_bin' });
      showToast('No bin ID configured — cannot save to cloud.', 'error');
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save';
      return;
    }

    try {
      const res = await fetch(`${JSONBIN_BASE}/${r.menu_bin_id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-Master-Key': getMasterKey()
        },
        body: JSON.stringify(menuData)
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `HTTP ${res.status}`);
      }

      // Bust sessionStorage cache for this tab (restaurant.js uses sessionStorage)
      const cacheVersion = 'v2';
      try { sessionStorage.removeItem(`menu_${cacheVersion}_${r.id}`); } catch (_) {}
      try { sessionStorage.removeItem(`binid_${cacheVersion}_${r.id}`); } catch (_) {}

      setDirty(false);
      adminTrack('admin_save_success', {});
      showToast('Menu saved successfully! Changes are now live.', 'success');
    } catch (err) {
      adminTrack('admin_save_fail', { message: err.message || 'error' });
      showToast('Save failed: ' + err.message, 'error');
    } finally {
      saveBtn.textContent = 'Save';
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

  /* ── Tab bar (single delegation — avoids duplicate listeners on re-open) ── */
  document.getElementById('editorTabs').addEventListener('click', e => {
    const tab = e.target.closest('.editor-tab');
    if (!tab || !tab.dataset.tab) return;
    switchTab(tab.dataset.tab);
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
  if (authLoginBtn) {
    authLoginBtn.addEventListener('click', async () => {
      if (!restaurants || !restaurants.length) return;
      const rid = restaurantSelect?.value;
      const entry = restaurants.find(r => r.id === rid);
      if (!entry) {
        if (authErrorEl) {
          authErrorEl.style.display = 'block';
          authErrorEl.textContent = 'Pick a restaurant first.';
        }
        return;
      }
      await attemptAuth(entry, authLoginBtn);
    });
  }
  adminLangToggleAuth?.addEventListener('click', () => applyAdminLang(adminLang === 'bg' ? 'en' : 'bg'));
  adminLangToggleEditor?.addEventListener('click', () => applyAdminLang(adminLang === 'bg' ? 'en' : 'bg'));
  applyAdminLang(adminLang, false);
  loadRestaurants();
})();
