/* ============================================================
   admin.js — Menu Admin Panel
   ============================================================ */

(function () {
  'use strict';

  /* ── CONFIG ─────────────────────────────────────────────── */
  const JSONBIN_BASE    = 'https://api.jsonbin.io/v3/b';
  const SESSION_KEY_KEY = 'admin_master_key';

  function getMasterKey() {
    return sessionStorage.getItem(SESSION_KEY_KEY) || '';
  }
  function setMasterKey(val) {
    if (val) sessionStorage.setItem(SESSION_KEY_KEY, val);
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
  const authScreen   = document.getElementById('authScreen');
  const editorScreen = document.getElementById('editorScreen');
  const authGrid     = document.getElementById('authGrid');
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

  /* ── PASSWORD HASHING ───────────────────────────────────── */
  async function hashPassword(restaurantId, password) {
    const text = restaurantId + ':' + password;
    const encoded = new TextEncoder().encode(text);
    const buf = await crypto.subtle.digest('SHA-256', encoded);
    return Array.from(new Uint8Array(buf))
      .map(b => b.toString(16).padStart(2, '0')).join('');
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
      restaurants = await res.json();
      renderAuthCards();
    } catch {
      authGrid.innerHTML = '<p style="color:rgba(240,236,228,0.4);grid-column:1/-1">Could not load restaurants list.</p>';
    }
  }

  /* ── AUTH CARDS ──────────────────────────────────────────── */
  function renderAuthCards() {
    authGrid.innerHTML = '';
    restaurants.forEach(r => {
      const hasBin = r.menu_bin_id && r.menu_bin_id !== 'PASTE_BIN_ID_HERE';
      const card = document.createElement('div');
      card.className = 'auth-card';

      const imgSrc = r.image ? `../resources/${r.id}/${r.image}` : null;
      const imgHtml = imgSrc
        ? `<img class="auth-card__img" src="${esc(imgSrc)}" alt="" onerror="this.style.display='none'" />`
        : `<div class="auth-card__img-placeholder">🍽</div>`;

      const statusText = hasBin ? 'Connected to jsonbin.io' : '⚠ No bin ID configured';
      const statusColor = hasBin ? '' : 'style="color:#e05c5c"';

      card.innerHTML = `
        <div class="auth-card__header">
          ${imgHtml}
          <div class="auth-card__info">
            <div class="auth-card__name">${esc(r.name.en || r.id)}</div>
            <div class="auth-card__status" ${statusColor}>${statusText}</div>
          </div>
        </div>
        <div class="auth-card__form">
          <input type="password" class="auth-card__input" placeholder="Restaurant password"
                 id="pw-${esc(r.id)}" autocomplete="current-password" />
          <button class="auth-card__submit" data-id="${esc(r.id)}">Enter</button>
        </div>
        <p class="auth-card__error" id="err-${esc(r.id)}">Incorrect password</p>
      `;

      // Submit on Enter key
      const input = card.querySelector(`#pw-${r.id}`);
      const btn   = card.querySelector('.auth-card__submit');
      input.addEventListener('keydown', e => { if (e.key === 'Enter') btn.click(); });
      btn.addEventListener('click', () => attemptAuth(r, input));

      authGrid.appendChild(card);
    });
  }

  /* ── MASTER KEY TOGGLE ───────────────────────────────────── */
  masterKeyToggle.addEventListener('click', () => {
    const isHidden = masterKeyInput.type === 'password';
    masterKeyInput.type  = isHidden ? 'text' : 'password';
    masterKeyToggle.title = isHidden ? 'Hide key' : 'Show key';
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

  /* ── AUTHENTICATE ────────────────────────────────────────── */
  async function attemptAuth(restaurantEntry, inputEl) {
    const pw  = inputEl.value.trim();
    const key = masterKeyInput.value.trim();

    if (!key) {
      masterKeyInput.focus();
      masterKeyInput.classList.add('field-error');
      setTimeout(() => masterKeyInput.classList.remove('field-error'), 1200);
      showToast('Please enter your jsonbin.io master key first.', 'error');
      return;
    }
    if (!pw) { inputEl.focus(); return; }

    const errEl = document.getElementById(`err-${restaurantEntry.id}`);
    errEl.style.display = 'none';

    const hash = await hashPassword(restaurantEntry.id, pw);
    if (hash !== restaurantEntry.password_hash) {
      adminTrack('admin_auth_fail', { restaurant_id: String(restaurantEntry.id).slice(0, 40) });
      errEl.style.display = 'block';
      inputEl.value = '';
      inputEl.focus();
      return;
    }

    // Correct — store key for this session and open editor
    adminTrack('admin_auth_ok', { restaurant_id: String(restaurantEntry.id).slice(0, 40) });
    setMasterKey(key);
    inputEl.value = '';
    currentRestaurant = restaurantEntry;
    await loadAndOpenEditor();
  }

  /* ── LOAD MENU FROM JSONBIN ──────────────────────────────── */
  async function loadAndOpenEditor() {
    saveBtn.disabled = true;
    const r = currentRestaurant;
    const hasBin = r.menu_bin_id && r.menu_bin_id !== 'PASTE_BIN_ID_HERE';

    try {
      if (hasBin) {
        const res = await fetch(`${JSONBIN_BASE}/${r.menu_bin_id}/latest`, {
          headers: { 'X-Master-Key': getMasterKey() }
        });
        if (!res.ok) throw new Error(`Jsonbin HTTP ${res.status}`);
        const wrapper = await res.json();
        menuData = wrapper.record;
      } else {
        // Fallback: load from local file
        const res = await fetch(`../resources/${r.id}/menu.json`);
        if (!res.ok) throw new Error(`Local HTTP ${res.status}`);
        menuData = await res.json();
        showToast('No bin configured — loaded local file (changes won\'t be saved to cloud)', 'error');
      }
      openEditor();
    } catch (err) {
      adminTrack('admin_menu_load_fail', {
        restaurant_id: String(r.id).slice(0, 40),
        message:         err.message || 'error'
      });
      showToast('Failed to load menu: ' + err.message, 'error');
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
          <div class="category-name-field">
            <label>English name</label>
            <input class="cat-name-en" type="text" value="${esc(cat.name.en || '')}" placeholder="Category name" />
          </div>
          <div class="category-name-field">
            <label>Bulgarian name</label>
            <input class="cat-name-bg" type="text" value="${esc(cat.name.bg || '')}" placeholder="Категория" />
          </div>
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

  function buildItemBlock(item, itemIdx, cat, catIdx, catBlock) {
    const block = document.createElement('div');
    block.className = 'item-block';

    const price   = typeof item.price === 'number' ? item.price.toFixed(2) : '0.00';
    const nameTxt = item.name.en || 'New item';

    block.innerHTML = `
      <div class="item-block__header">
        <span class="item-block__drag">⠿</span>
        <span class="item-block__name">${esc(nameTxt)}</span>
        <span class="item-block__price">${price}€</span>
        <span class="item-availability${item.availability ? '' : ' unavailable'}" title="${item.availability ? 'Available' : 'Unavailable'}"></span>
        <span class="item-block__chevron">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 4l4 4 4-4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </span>
      </div>
      <div class="item-block__body">
        <div class="item-fields">
          <div class="item-field-2col">
            <div class="item-field-row">
              <label>Name (English)</label>
              <input class="item-name-en" type="text" value="${esc(item.name.en || '')}" placeholder="Item name" />
            </div>
            <div class="item-field-row">
              <label>Name (Bulgarian)</label>
              <input class="item-name-bg" type="text" value="${esc(item.name.bg || '')}" placeholder="Наименование" />
            </div>
          </div>
          <div class="item-field-2col">
            <div class="item-field-row">
              <label>Description (English)</label>
              <textarea class="item-desc-en" placeholder="Short description...">${esc(item.description ? item.description.en || '' : '')}</textarea>
            </div>
            <div class="item-field-row">
              <label>Description (Bulgarian)</label>
              <textarea class="item-desc-bg" placeholder="Кратко описание...">${esc(item.description ? item.description.bg || '' : '')}</textarea>
            </div>
          </div>
          <div class="item-field-price-row">
            <div class="item-field-row">
              <label>Price (€)</label>
              <input class="item-price" type="number" min="0" step="0.01" value="${price}" />
            </div>
            <div class="item-avail-toggle">
              <input type="checkbox" class="item-avail-cb" id="avail-${catIdx}-${itemIdx}" ${item.availability ? 'checked' : ''} />
              <label for="avail-${catIdx}-${itemIdx}">Available</label>
            </div>
          </div>
          <div class="item-field-row">
            <label>Tags</label>
            <div class="item-tags-wrap">
              <div class="item-tags-list" id="tags-${catIdx}-${itemIdx}"></div>
              <div class="item-tag-add-row">
                <input type="text" class="tag-en-input" placeholder="EN tag" />
                <input type="text" class="tag-bg-input" placeholder="БГ таг" />
                <button class="tag-add-btn">+ Add</button>
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
      block.querySelector('.item-block__price').textContent = item.price.toFixed(2) + '€';
      setDirty(true);
    });

    // Availability
    block.querySelector('.item-avail-cb').addEventListener('change', e => {
      item.availability = e.target.checked;
      block.querySelector('.item-availability').classList.toggle('unavailable', !e.target.checked);
      setDirty(true);
    });

    // Tags
    renderItemTags(block, item, catIdx, itemIdx);
    block.querySelector('.tag-add-btn').addEventListener('click', () => {
      const enInput = block.querySelector('.tag-en-input');
      const bgInput = block.querySelector('.tag-bg-input');
      const enVal = enInput.value.trim();
      const bgVal = bgInput.value.trim();
      if (!enVal) { enInput.focus(); return; }
      if (!item.tags) item.tags = [];
      item.tags.push({ en: enVal, bg: bgVal || enVal });
      enInput.value = ''; bgInput.value = '';
      renderItemTags(block, item, catIdx, itemIdx);
      setDirty(true);
      adminTrack('admin_tag_add', { tag_en: enVal.slice(0, 60) });
    });
    block.querySelector('.tag-en-input').addEventListener('keydown', e => {
      if (e.key === 'Enter') block.querySelector('.tag-add-btn').click();
    });

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
    list.innerHTML = '';
    (item.tags || []).forEach((tag, tagIdx) => {
      const chip = document.createElement('span');
      chip.className = 'item-tag-chip';
      chip.innerHTML = `
        <span class="item-tag-chip__en">${esc(tag.en)}</span>
        ${tag.bg && tag.bg !== tag.en ? `<span class="item-tag-chip__bg">/ ${esc(tag.bg)}</span>` : ''}
        <button class="item-tag-chip__del" title="Remove tag">×</button>
      `;
      chip.querySelector('.item-tag-chip__del').addEventListener('click', e => {
        e.stopPropagation();
        adminTrack('admin_tag_remove', { tag_en: String(tag.en || '').slice(0, 60) });
        item.tags.splice(tagIdx, 1);
        renderItemTags(itemBlock, item, catIdx, itemIdx);
        setDirty(true);
      });
      list.appendChild(chip);
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
  loadRestaurants();
})();
