/* ============================================================
   admin.js — Menu Admin Panel
   ============================================================ */

(function () {
  'use strict';

  /* ── CONFIG ─────────────────────────────────────────────── */
  const JSONBIN_BASE    = 'https://api.jsonbin.io/v3/b';
  const SESSION_KEY_KEY = 'admin_master_key';   // sessionStorage key name

  function getMasterKey() {
    return sessionStorage.getItem(SESSION_KEY_KEY) || '';
  }
  function setMasterKey(val) {
    if (val) sessionStorage.setItem(SESSION_KEY_KEY, val);
  }

  /* ── STATE ──────────────────────────────────────────────── */
  let restaurants     = [];
  let currentRestaurant = null;   // entry from restaurants.json
  let menuData        = null;     // the full { restaurant: {...} } object
  let isDirty         = false;

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
    masterKeyInput.type = isHidden ? 'text' : 'password';
    masterKeyToggle.title = isHidden ? 'Hide key' : 'Show key';
  });

  // Pre-fill from sessionStorage if available
  const savedKey = getMasterKey();
  if (savedKey) masterKeyInput.value = savedKey;

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
      errEl.style.display = 'block';
      inputEl.value = '';
      inputEl.focus();
      return;
    }

    // Correct — store key for this session and open editor
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
      showToast('Failed to load menu: ' + err.message, 'error');
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

    populateInfo(r);
    populateConfig(r.menu.config);
    renderCategories(r.menu.categories);

    // Tab switching
    document.querySelectorAll('.editor-tab').forEach(btn => {
      btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });
  }

  /* ── BACK BUTTON ─────────────────────────────────────────── */
  document.getElementById('backBtn').addEventListener('click', async () => {
    if (isDirty) {
      const ok = await confirm('You have unsaved changes. Leave without saving?');
      if (!ok) return;
    }
    editorScreen.classList.add('hidden');
    authScreen.classList.remove('hidden');
    menuData = null;
    currentRestaurant = null;
    setDirty(false);
    // Reset tabs
    document.querySelectorAll('.editor-tab').forEach((t, i) => t.classList.toggle('active', i === 0));
    document.querySelectorAll('.editor-panel').forEach((p, i) => p.classList.toggle('active', i === 0));
    document.querySelectorAll('.editor-panel').forEach((p, i) => p.classList.toggle('hidden', i !== 0));
  });

  /* ── TABS ────────────────────────────────────────────────── */
  function switchTab(tabId) {
    document.querySelectorAll('.editor-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tabId));
    document.querySelectorAll('.editor-panel').forEach(p => {
      const active = p.id === 'panel-' + tabId;
      p.classList.toggle('active', active);
      p.classList.toggle('hidden', !active);
    });
  }

  /* ── POPULATE INFO ───────────────────────────────────────── */
  function populateInfo(r) {
    document.getElementById('infoNameEn').value  = r.name.en || '';
    document.getElementById('infoNameBg').value  = r.name.bg || '';
    document.getElementById('infoDescEn').value  = r.description.en || '';
    document.getElementById('infoDescBg').value  = r.description.bg || '';
    document.getElementById('infoTheme').value   = r.menu.theme || 'classic';
    document.getElementById('infoLang').value    = r.default_language || 'en';

    ['infoNameEn','infoNameBg','infoDescEn','infoDescBg','infoTheme','infoLang'].forEach(id => {
      document.getElementById(id).addEventListener('input', () => setDirty(true));
    });
  }

  /* ── POPULATE CONFIG ─────────────────────────────────────── */
  function populateConfig(cfg) {
    document.getElementById('cfgPrice').checked       = cfg.show_price !== false;
    document.getElementById('cfgDesc').checked        = cfg.show_description !== false;
    document.getElementById('cfgTags').checked        = cfg.show_tags !== false;
    document.getElementById('cfgIngredients').checked = cfg.show_ingredients === true;
    document.getElementById('cfgAllergens').checked   = cfg.show_allergens === true;

    ['cfgPrice','cfgDesc','cfgTags','cfgIngredients','cfgAllergens'].forEach(id => {
      document.getElementById(id).addEventListener('change', () => setDirty(true));
    });
  }

  /* ── CATEGORIES ──────────────────────────────────────────── */
  function renderCategories(categories) {
    categoriesList.innerHTML = '';
    categories.forEach((cat, catIdx) => {
      categoriesList.appendChild(buildCategoryBlock(cat, catIdx, categories));
    });
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
      menuData.restaurant.menu.categories.splice(catIdx, 1);
      renderCategories(menuData.restaurant.menu.categories);
      setDirty(true);
    });

    // Add item
    block.querySelector('.btn-add-item').addEventListener('click', () => {
      if (!cat.items) cat.items = [];
      cat.items.push({ name: { en: '', bg: '' }, description: { en: '', bg: '' }, price: 0, tags: [], availability: true });
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
    });
    block.querySelector('.tag-en-input').addEventListener('keydown', e => {
      if (e.key === 'Enter') block.querySelector('.tag-add-btn').click();
    });

    // Delete item
    block.querySelector('.btn-delete-item').addEventListener('click', async () => {
      const ok = await confirm(`Delete "${item.name.en || 'this item'}"?`);
      if (!ok) return;
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
        item.tags.splice(tagIdx, 1);
        renderItemTags(itemBlock, item, catIdx, itemIdx);
        setDirty(true);
      });
      list.appendChild(chip);
    });
  }

  /* ── ADD CATEGORY ────────────────────────────────────────── */
  document.getElementById('addCategoryBtn').addEventListener('click', () => {
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
    r.menu.config.show_price       = document.getElementById('cfgPrice').checked;
    r.menu.config.show_description = document.getElementById('cfgDesc').checked;
    r.menu.config.show_tags        = document.getElementById('cfgTags').checked;
    r.menu.config.show_ingredients = document.getElementById('cfgIngredients').checked;
    r.menu.config.show_allergens   = document.getElementById('cfgAllergens').checked;
    // Categories and items are already mutated in-place
  }

  /* ── SAVE TO JSONBIN ─────────────────────────────────────── */
  saveBtn.addEventListener('click', async () => {
    collectFormData();
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving…';

    const r = currentRestaurant;
    const hasBin = r.menu_bin_id && r.menu_bin_id !== 'PASTE_BIN_ID_HERE';

    if (!hasBin) {
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
      showToast('Menu saved successfully! Changes are now live.', 'success');
    } catch (err) {
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

  /* ── INIT ────────────────────────────────────────────────── */
  loadRestaurants();
})();
