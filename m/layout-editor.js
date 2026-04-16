/**
 * layout-editor.js — restaurant floor-plan layout editor.
 *
 * Exposes window.LayoutEditor.init({ container, apiBase, restaurantId, jwt })
 *
 * Modes:
 *   simple — just a table count (e.g. 5 generic tables)
 *   tables — list of named tables with individual capacity + shape
 *   grid   — spatial canvas: tap to toggle active, long-press to configure shape/capacity
 *
 * Layout JSON schema (stored in DB as config_json):
 * {
 *   version: 1,
 *   mode: "simple" | "tables" | "grid",
 *   tableCount: 5,           // simple
 *   tables: [{id, label, shape, cornerRadius, capacity}],  // tables
 *   gridCols: 10,            // grid
 *   gridRows: 7,             // grid
 *   cells: [{id, col, row, active, label, shape, cornerRadius, capacity}]  // grid
 * }
 */
(function () {
  'use strict';

  /* ------------------------------------------------------------------ */
  /* Constants                                                            */
  /* ------------------------------------------------------------------ */
  const HOLD_MS     = 500;   // long-press threshold
  const CELL_SIZE   = 56;    // px per cell in grid
  const CELL_GAP    = 4;
  const MIN_COLS    = 3;
  const MAX_COLS    = 20;
  const MIN_ROWS    = 2;
  const MAX_ROWS    = 16;
  const DEFAULT_COLS = 10;
  const DEFAULT_ROWS = 7;
  const SHAPES      = ['square', 'rect', 'circle', 'ellipse'];

  /* ------------------------------------------------------------------ */
  /* State                                                                */
  /* ------------------------------------------------------------------ */
  let _cfg = null;           // current layout config object
  let _container = null;
  let _apiBase   = '';
  let _restaurantId = '';
  let _jwt       = '';
  let _dirty     = false;
  let _saving    = false;

  /* hold-press state */
  let _holdTimer   = null;
  let _holdCell    = null;
  let _holdMoved   = false;

  /* DOM refs */
  let _elMode, _elPanelSimple, _elPanelTables, _elPanelGrid;
  let _elSimpleCount;
  let _elTablesList;
  let _elCanvas, _elColsInput, _elRowsInput;
  let _elSaveStatus, _elSaveBtn;
  let _ctxMenu = null;

  /* ------------------------------------------------------------------ */
  /* Public API                                                           */
  /* ------------------------------------------------------------------ */
  window.LayoutEditor = {
    init,
    setJwt: function (jwt) { _jwt = jwt; },
  };

  async function init({ container, apiBase, restaurantId, jwt }) {
    _container    = container;
    _apiBase      = apiBase;
    _restaurantId = restaurantId;
    _jwt          = jwt;

    _container.innerHTML = buildShell();
    _bindDomRefs();
    _bindEvents();

    // Load existing layout
    try {
      const res = await fetch(`${_apiBase}/api/public/layout/${_restaurantId}`);
      if (res.status === 204 || res.status === 404) {
        _cfg = _defaultConfig();
      } else if (res.ok) {
        const data = await res.json();
        _cfg = JSON.parse(data.configJson);
      } else {
        _cfg = _defaultConfig();
      }
    } catch {
      _cfg = _defaultConfig();
    }

    _dirty = false;
    _render();
  }

  /* ------------------------------------------------------------------ */
  /* Default config                                                       */
  /* ------------------------------------------------------------------ */
  function _defaultConfig() {
    return { version: 1, mode: 'simple', tableCount: 5 };
  }

  /* ------------------------------------------------------------------ */
  /* HTML shell                                                           */
  /* ------------------------------------------------------------------ */
  function buildShell() {
    return `
<div class="lf-wrap">
  <div class="lf-mode-bar" id="lfModeBar">
    <button class="lf-mode-btn" data-mode="simple">Simple</button>
    <button class="lf-mode-btn" data-mode="tables">Tables</button>
    <button class="lf-mode-btn" data-mode="grid">Grid</button>
  </div>

  <!-- SIMPLE -->
  <div id="lfPanelSimple" class="lf-simple" style="display:none">
    <span class="lf-simple__label">Number of tables</span>
    <div class="lf-simple__stepper">
      <button class="lf-simple__btn" id="lfSimpleMinus">−</button>
      <span class="lf-simple__count" id="lfSimpleCount">5</span>
      <button class="lf-simple__btn" id="lfSimplePlus">+</button>
    </div>
  </div>

  <!-- TABLES -->
  <div id="lfPanelTables" class="lf-tables" style="display:none">
    <div class="lf-tables__list" id="lfTablesList"></div>
    <button class="lf-tables__add" id="lfTablesAdd">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      Add table
    </button>
  </div>

  <!-- GRID -->
  <div id="lfPanelGrid" style="display:none">
    <div class="lf-grid-controls">
      <div class="lf-grid-controls__field">
        <label for="lfCols">Columns</label>
        <input id="lfCols" class="lf-grid-controls__input" type="number" min="${MIN_COLS}" max="${MAX_COLS}" value="${DEFAULT_COLS}"/>
      </div>
      <div class="lf-grid-controls__field">
        <label for="lfRows">Rows</label>
        <input id="lfRows" class="lf-grid-controls__input" type="number" min="${MIN_ROWS}" max="${MAX_ROWS}" value="${DEFAULT_ROWS}"/>
      </div>
      <small style="color:var(--color-text-muted);font-size:11px">Tap cell to activate · Hold to configure</small>
    </div>
    <div class="lf-canvas-outer" style="margin-top:10px">
      <div class="lf-canvas" id="lfCanvas"></div>
    </div>
  </div>

  <!-- SAVE BAR -->
  <div class="lf-save-bar">
    <span class="lf-save-bar__status" id="lfSaveStatus">No unsaved changes</span>
    <button class="lf-save-btn" id="lfSaveBtn" disabled>Save layout</button>
  </div>
</div>`;
  }

  /* ------------------------------------------------------------------ */
  /* DOM refs                                                             */
  /* ------------------------------------------------------------------ */
  function _bindDomRefs() {
    _elMode        = _container.querySelector('#lfModeBar');
    _elPanelSimple = _container.querySelector('#lfPanelSimple');
    _elPanelTables = _container.querySelector('#lfPanelTables');
    _elPanelGrid   = _container.querySelector('#lfPanelGrid');
    _elSimpleCount = _container.querySelector('#lfSimpleCount');
    _elTablesList  = _container.querySelector('#lfTablesList');
    _elCanvas      = _container.querySelector('#lfCanvas');
    _elColsInput   = _container.querySelector('#lfCols');
    _elRowsInput   = _container.querySelector('#lfRows');
    _elSaveStatus  = _container.querySelector('#lfSaveStatus');
    _elSaveBtn     = _container.querySelector('#lfSaveBtn');
  }

  /* ------------------------------------------------------------------ */
  /* Events                                                               */
  /* ------------------------------------------------------------------ */
  function _bindEvents() {
    // Mode bar
    _elMode.addEventListener('click', e => {
      const btn = e.target.closest('[data-mode]');
      if (!btn) return;
      _cfg.mode = btn.dataset.mode;
      _markDirty();
      _render();
    });

    // Simple stepper
    _container.querySelector('#lfSimpleMinus').addEventListener('click', () => {
      _cfg.tableCount = Math.max(1, (_cfg.tableCount || 5) - 1);
      _markDirty(); _renderSimple();
    });
    _container.querySelector('#lfSimplePlus').addEventListener('click', () => {
      _cfg.tableCount = Math.min(50, (_cfg.tableCount || 5) + 1);
      _markDirty(); _renderSimple();
    });

    // Tables add
    _container.querySelector('#lfTablesAdd').addEventListener('click', _addTable);

    // Grid size change
    _elColsInput.addEventListener('change', () => {
      const v = parseInt(_elColsInput.value, 10);
      if (!isNaN(v) && v >= MIN_COLS && v <= MAX_COLS) {
        _cfg.gridCols = v;
        _markDirty(); _renderGrid();
      }
    });
    _elRowsInput.addEventListener('change', () => {
      const v = parseInt(_elRowsInput.value, 10);
      if (!isNaN(v) && v >= MIN_ROWS && v <= MAX_ROWS) {
        _cfg.gridRows = v;
        _markDirty(); _renderGrid();
      }
    });

    // Save
    _elSaveBtn.addEventListener('click', _save);

    // Close ctx menu on outside click
    document.addEventListener('click', e => {
      if (_ctxMenu && !_ctxMenu.contains(e.target)) _closeCtx();
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') _closeCtx();
    });
  }

  /* ------------------------------------------------------------------ */
  /* Render                                                               */
  /* ------------------------------------------------------------------ */
  function _render() {
    // Mode buttons
    _elMode.querySelectorAll('.lf-mode-btn').forEach(b => {
      b.classList.toggle('is-active', b.dataset.mode === _cfg.mode);
    });

    // Panels
    _elPanelSimple.style.display = _cfg.mode === 'simple' ? '' : 'none';
    _elPanelTables.style.display = _cfg.mode === 'tables' ? '' : 'none';
    _elPanelGrid.style.display   = _cfg.mode === 'grid'   ? '' : 'none';

    if (_cfg.mode === 'simple') _renderSimple();
    if (_cfg.mode === 'tables') _renderTables();
    if (_cfg.mode === 'grid')   _renderGrid();
  }

  function _renderSimple() {
    _elSimpleCount.textContent = _cfg.tableCount || 5;
  }

  function _renderTables() {
    if (!_cfg.tables) _cfg.tables = [];
    _elTablesList.innerHTML = _cfg.tables.map((t, i) => `
      <div class="lf-tcard" data-idx="${i}" title="Click to edit">
        ${_shapeSvg(t.shape, 32, 'var(--color-accent)', '0.25')}
        <span class="lf-tcard__label">${_esc(t.label || t.id)}</span>
        <span class="lf-tcard__cap">${t.capacity || 2} seats</span>
        <button class="lf-tcard__del" data-del="${i}" title="Remove">×</button>
      </div>`).join('');

    // Click on card → open edit modal
    _elTablesList.querySelectorAll('.lf-tcard').forEach(card => {
      card.addEventListener('click', e => {
        if (e.target.closest('[data-del]')) return;
        _openTableCtx(parseInt(card.dataset.idx, 10), card.getBoundingClientRect());
      });
    });
    _elTablesList.querySelectorAll('[data-del]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        _cfg.tables.splice(parseInt(btn.dataset.del, 10), 1);
        _markDirty(); _renderTables();
      });
    });
  }

  function _renderGrid() {
    const cols = _cfg.gridCols || DEFAULT_COLS;
    const rows = _cfg.gridRows || DEFAULT_ROWS;
    _elColsInput.value = cols;
    _elRowsInput.value = rows;

    if (!_cfg.cells) _cfg.cells = [];

    // Build lookup
    const byPos = {};
    _cfg.cells.forEach(c => { byPos[`${c.col}_${c.row}`] = c; });

    _elCanvas.style.gridTemplateColumns = `repeat(${cols}, ${CELL_SIZE}px)`;
    _elCanvas.style.gridTemplateRows    = `repeat(${rows}, ${CELL_SIZE}px)`;
    _elCanvas.style.setProperty('--cell-size', CELL_SIZE + 'px');

    let html = '';
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cell = byPos[`${c}_${r}`];
        const active = cell && cell.active;
        html += `<div class="lf-cell${active ? ' is-active' : ''}"
                      data-col="${c}" data-row="${r}"
                      title="${active ? (cell.label || '') + ' (hold to configure)' : 'Tap to activate'}">
          ${active ? _shapeSvg(cell.shape, CELL_SIZE - 14, 'var(--color-accent)', '0.35') : ''}
          ${active ? `<span class="lf-cell__label">${_esc(cell.label || '')}</span>` : ''}
          ${active && cell.capacity ? `<span class="lf-cell__cap-badge">${cell.capacity}</span>` : ''}
        </div>`;
      }
    }
    _elCanvas.innerHTML = html;

    // Wire cell events
    _elCanvas.querySelectorAll('.lf-cell').forEach(el => {
      el.addEventListener('mousedown',  _onCellDown);
      el.addEventListener('touchstart', _onCellDown, { passive: false });
      el.addEventListener('mouseup',    _onCellUp);
      el.addEventListener('touchend',   _onCellUp);
      el.addEventListener('mousemove',  _onCellMove);
      el.addEventListener('touchmove',  _onCellMove, { passive: false });
      el.addEventListener('mouseleave', _cancelHold);
    });
  }

  /* ------------------------------------------------------------------ */
  /* Grid: tap / hold                                                     */
  /* ------------------------------------------------------------------ */
  function _onCellDown(e) {
    if (e.type === 'touchstart') e.preventDefault();
    _holdMoved = false;
    const el = e.currentTarget;
    _holdCell = el;
    _holdTimer = setTimeout(() => {
      if (!_holdMoved) _openCellCtx(el);
    }, HOLD_MS);
  }

  function _onCellUp(e) {
    if (_ctxMenu) return; // ctx already opened by hold
    if (_holdTimer) {
      clearTimeout(_holdTimer);
      _holdTimer = null;
    }
    if (!_holdMoved) _toggleCell(_holdCell);
    _holdCell = null;
  }

  function _onCellMove(e) {
    if (e.type === 'touchmove' && e.touches.length > 0) {
      const t = e.touches[0];
      const el = document.elementFromPoint(t.clientX, t.clientY);
      if (!el || !el.classList.contains('lf-cell') || el !== _holdCell) {
        _holdMoved = true;
        _cancelHold();
      }
    } else {
      _holdMoved = true;
      _cancelHold();
    }
  }

  function _cancelHold() {
    if (_holdTimer) { clearTimeout(_holdTimer); _holdTimer = null; }
  }

  function _toggleCell(el) {
    if (!el) return;
    const col = parseInt(el.dataset.col, 10);
    const row = parseInt(el.dataset.row, 10);
    let cell = (_cfg.cells || []).find(c => c.col === col && c.row === row);
    if (cell) {
      cell.active = !cell.active;
    } else {
      if (!_cfg.cells) _cfg.cells = [];
      const idx = _cfg.cells.length + 1;
      cell = {
        id: `t${idx}`, col, row, active: true,
        label: String(idx), shape: 'square',
        cornerRadius: 8, capacity: 2,
      };
      _cfg.cells.push(cell);
    }
    _markDirty();
    _renderGrid();
  }

  /* ------------------------------------------------------------------ */
  /* Context menu for cell (hold) or table card (click)                  */
  /* ------------------------------------------------------------------ */
  function _openCellCtx(el) {
    _cancelHold();
    const col = parseInt(el.dataset.col, 10);
    const row = parseInt(el.dataset.row, 10);
    let cell = (_cfg.cells || []).find(c => c.col === col && c.row === row);
    if (!cell) {
      if (!_cfg.cells) _cfg.cells = [];
      const idx = _cfg.cells.length + 1;
      cell = { id: `t${idx}`, col, row, active: true, label: String(idx), shape: 'square', cornerRadius: 8, capacity: 2 };
      _cfg.cells.push(cell);
    }
    _showCtxMenu(el.getBoundingClientRect(), cell, () => { _markDirty(); _renderGrid(); }, () => {
      cell.active = false;
      _markDirty(); _renderGrid();
    });
  }

  function _openTableCtx(idx, rect) {
    const table = _cfg.tables[idx];
    if (!table) return;
    _showCtxMenu(rect, table, () => { _markDirty(); _renderTables(); }, null);
  }

  function _showCtxMenu(triggerRect, target, onChange, onDelete) {
    _closeCtx();
    const menu = document.createElement('div');
    menu.className = 'lf-ctx-menu';
    _ctxMenu = menu;

    menu.innerHTML = `
      <div class="lf-ctx-menu__title">Configure table</div>
      <div class="lf-ctx-menu__shapes">
        ${SHAPES.map(s => `
          <button class="lf-ctx-shape-btn${target.shape === s ? ' is-active' : ''}" data-shape="${s}">
            ${_shapeSvg(s, 28, 'var(--color-accent)', '0.6')}
            <span>${s.charAt(0).toUpperCase() + s.slice(1)}</span>
          </button>`).join('')}
      </div>
      <div class="lf-ctx-menu__row">
        <label>Label</label>
        <input type="text" id="ctxLabel" value="${_esc(target.label || '')}"/>
      </div>
      <div class="lf-ctx-menu__row">
        <label>Seats</label>
        <input type="number" id="ctxCap" min="1" max="20" value="${target.capacity || 2}"/>
      </div>
      <div class="lf-ctx-menu__row">
        <label>Corner r.</label>
        <input type="number" id="ctxRadius" min="0" max="50" value="${target.cornerRadius || 8}"/>
      </div>
      <div class="lf-ctx-menu__footer">
        ${onDelete ? '<button class="lf-ctx-menu__btn lf-ctx-menu__btn--danger" id="ctxDel">Deactivate</button>' : ''}
        <button class="lf-ctx-menu__btn lf-ctx-menu__btn--primary" id="ctxApply">Apply</button>
      </div>`;

    document.body.appendChild(menu);

    // Position
    const mw = 220; const mh = 260;
    let x = triggerRect.right + 8;
    let y = triggerRect.top;
    if (x + mw > window.innerWidth - 8)  x = triggerRect.left - mw - 8;
    if (x < 8) x = 8;
    if (y + mh > window.innerHeight - 8) y = window.innerHeight - mh - 8;
    if (y < 8) y = 8;
    menu.style.left = x + 'px';
    menu.style.top  = y + 'px';

    // Shape buttons
    menu.querySelectorAll('[data-shape]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        menu.querySelectorAll('[data-shape]').forEach(b => b.classList.remove('is-active'));
        btn.classList.add('is-active');
        target.shape = btn.dataset.shape;
      });
    });

    menu.querySelector('#ctxApply').addEventListener('click', e => {
      e.stopPropagation();
      target.label        = menu.querySelector('#ctxLabel').value.trim();
      target.capacity     = parseInt(menu.querySelector('#ctxCap').value, 10) || 2;
      target.cornerRadius = parseInt(menu.querySelector('#ctxRadius').value, 10) || 0;
      onChange();
      _closeCtx();
    });

    const delBtn = menu.querySelector('#ctxDel');
    if (delBtn) {
      delBtn.addEventListener('click', e => {
        e.stopPropagation();
        if (onDelete) onDelete();
        _closeCtx();
      });
    }
  }

  function _closeCtx() {
    if (_ctxMenu) { _ctxMenu.remove(); _ctxMenu = null; }
  }

  /* ------------------------------------------------------------------ */
  /* Tables mode: add                                                     */
  /* ------------------------------------------------------------------ */
  function _addTable() {
    if (!_cfg.tables) _cfg.tables = [];
    const idx = _cfg.tables.length + 1;
    _cfg.tables.push({ id: `t${idx}`, label: `T${idx}`, shape: 'square', cornerRadius: 8, capacity: 2 });
    _markDirty(); _renderTables();
  }

  /* ------------------------------------------------------------------ */
  /* Save                                                                 */
  /* ------------------------------------------------------------------ */
  async function _save() {
    if (_saving || !_dirty) return;
    _saving = true;
    _elSaveBtn.disabled = true;
    _elSaveStatus.textContent = 'Saving…';
    _elSaveStatus.className = 'lf-save-bar__status';
    try {
      const res = await fetch(`${_apiBase}/api/super/layout/${_restaurantId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${_jwt}` },
        body: JSON.stringify(_cfg),
      });
      if (!res.ok) throw new Error(await res.text());
      _dirty = false;
      _elSaveStatus.textContent = 'Layout saved ✓';
      _elSaveStatus.className = 'lf-save-bar__status is-saved';
      _elSaveBtn.disabled = true;
    } catch (err) {
      _elSaveStatus.textContent = 'Save failed — ' + err.message;
      _elSaveStatus.className = 'lf-save-bar__status is-error';
      _elSaveBtn.disabled = false;
    } finally {
      _saving = false;
    }
  }

  function _markDirty() {
    _dirty = true;
    _elSaveStatus.textContent = 'Unsaved changes';
    _elSaveStatus.className = 'lf-save-bar__status';
    _elSaveBtn.disabled = false;
  }

  /* ------------------------------------------------------------------ */
  /* Helpers                                                              */
  /* ------------------------------------------------------------------ */
  function _esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /**
   * Renders a mini SVG shape (square, rect, circle, ellipse).
   * opacity controls the fill alpha so the label stays legible.
   */
  function _shapeSvg(shape, size, color, opacity) {
    const s = size || 32;
    const cr = 8;
    opacity = opacity || '0.3';
    let inner = '';
    switch (shape) {
      case 'circle':
        inner = `<circle cx="${s/2}" cy="${s/2}" r="${s/2 - 2}" fill="${color}" fill-opacity="${opacity}" stroke="${color}" stroke-width="1.5"/>`;
        break;
      case 'ellipse':
        inner = `<ellipse cx="${s/2}" cy="${s/2}" rx="${s/2 - 2}" ry="${s/3}" fill="${color}" fill-opacity="${opacity}" stroke="${color}" stroke-width="1.5"/>`;
        break;
      case 'rect':
        inner = `<rect x="2" y="${s/4}" width="${s-4}" height="${s/2}" rx="${cr}" fill="${color}" fill-opacity="${opacity}" stroke="${color}" stroke-width="1.5"/>`;
        break;
      case 'square':
      default:
        inner = `<rect x="2" y="2" width="${s-4}" height="${s-4}" rx="${cr}" fill="${color}" fill-opacity="${opacity}" stroke="${color}" stroke-width="1.5"/>`;
    }
    return `<svg class="lf-cell__shape" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}" aria-hidden="true">${inner}</svg>`;
  }

  // Expose shape helper for use in reserve.js
  window.LayoutEditor._shapeSvg = _shapeSvg;

})();
