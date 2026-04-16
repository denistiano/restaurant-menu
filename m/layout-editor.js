/**
 * layout-editor.js — restaurant floor-plan layout editor.
 *
 * window.LayoutEditor.init({ container, apiBase, restaurantId, jwt })
 *
 * Interaction:
 *   Desktop — click to toggle, RIGHT-CLICK to configure
 *   Mobile  — tap to toggle, LONG-PRESS (500ms) to configure
 *
 * Table SVG renders a realistic top-down floor-plan view:
 *   square / rect / circle / ellipse  +  chairs around the perimeter
 *   Rotation: 0 / 90 / 180 / 270 degrees (aesthetic only).
 *
 * Layout JSON schema (stored as config_json):
 * {
 *   version: 1,
 *   mode: "simple" | "tables" | "grid",
 *   tableCount: 5,
 *   tables: [{ id, label, shape, cornerRadius, capacity, rotation }],
 *   gridCols: 10, gridRows: 7,
 *   cells:  [{ id, col, row, active, label, shape, capacity, rotation }]
 * }
 */
(function () {
  'use strict';

  const HOLD_MS     = 480;
  const CELL_SIZE   = 68;
  const MIN_COLS    = 3;  const MAX_COLS = 20;
  const MIN_ROWS    = 2;  const MAX_ROWS = 16;
  const DEF_COLS    = 10;
  const DEF_ROWS    = 7;
  const SHAPES      = ['square', 'rect', 'circle', 'ellipse'];

  /* ── state ─────────────────────────────────────── */
  let _cfg = null;
  let _container, _apiBase, _rid, _jwt;
  let _dirty = false, _saving = false;

  /* hold/right-click state */
  let _holdTimer = null, _holdCell = null, _holdMoved = false;
  let _ctxMenu   = null;

  /* DOM */
  let $modeBar, $panelSimple, $panelTables, $panelGrid;
  let $simpleCount, $tablesList;
  let $canvas, $colsIn, $rowsIn;
  let $saveStatus, $saveBtn;

  /* ── Public API ─────────────────────────────────── */
  window.LayoutEditor = { init, setJwt: jwt => { _jwt = jwt; } };

  async function init({ container, apiBase, restaurantId, jwt }) {
    _container = container;
    _apiBase   = apiBase;
    _rid       = restaurantId;
    _jwt       = jwt;

    _container.innerHTML = _shell();
    _refs();
    _events();

    try {
      const r = await fetch(`${_apiBase}/api/public/layout/${_rid}`);
      if (r.status === 204 || r.status === 404) {
        _cfg = _defaultCfg();
      } else if (r.ok) {
        const d = await r.json();
        _cfg = JSON.parse(d.configJson);
      } else {
        _cfg = _defaultCfg();
      }
    } catch { _cfg = _defaultCfg(); }

    _dirty = false;
    _render();
  }

  function _defaultCfg() {
    return { version: 1, mode: 'simple', tableCount: 5 };
  }

  /* ── Shell HTML ─────────────────────────────────── */
  function _shell() {
    return `
<div class="lf-wrap">
  <div class="lf-mode-bar" id="lfModeBar">
    <button class="lf-mode-btn" data-mode="simple">Simple</button>
    <button class="lf-mode-btn" data-mode="tables">Tables</button>
    <button class="lf-mode-btn" data-mode="grid">Grid</button>
  </div>

  <div id="lfPanelSimple" class="lf-simple" style="display:none">
    <span class="lf-simple__label">Number of tables</span>
    <div class="lf-simple__stepper">
      <button class="lf-simple__btn" id="lfMinus">−</button>
      <span class="lf-simple__count" id="lfCount">5</span>
      <button class="lf-simple__btn" id="lfPlus">+</button>
    </div>
  </div>

  <div id="lfPanelTables" class="lf-tables" style="display:none">
    <div class="lf-tables__list" id="lfTablesList"></div>
    <button class="lf-tables__add" id="lfTablesAdd">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
      </svg>
      Add table
    </button>
  </div>

  <div id="lfPanelGrid" style="display:none">
    <div class="lf-grid-controls">
      <div class="lf-grid-controls__field">
        <label for="lfCols">Columns</label>
        <input id="lfCols" class="lf-grid-controls__input" type="number" min="${MIN_COLS}" max="${MAX_COLS}" value="${DEF_COLS}"/>
      </div>
      <div class="lf-grid-controls__field">
        <label for="lfRows">Rows</label>
        <input id="lfRows" class="lf-grid-controls__input" type="number" min="${MIN_ROWS}" max="${MAX_ROWS}" value="${DEF_ROWS}"/>
      </div>
      <span class="lf-grid-controls__hint">Click = toggle · Right-click / hold = configure</span>
    </div>
    <div class="lf-canvas-outer" style="margin-top:10px">
      <div class="lf-canvas" id="lfCanvas"></div>
    </div>
  </div>

  <div class="lf-save-bar">
    <span class="lf-save-bar__status" id="lfSaveStatus">No unsaved changes</span>
    <button class="lf-save-btn" id="lfSaveBtn" disabled>Save layout</button>
  </div>
</div>`;
  }

  /* ── DOM refs ───────────────────────────────────── */
  function _refs() {
    $modeBar     = _container.querySelector('#lfModeBar');
    $panelSimple = _container.querySelector('#lfPanelSimple');
    $panelTables = _container.querySelector('#lfPanelTables');
    $panelGrid   = _container.querySelector('#lfPanelGrid');
    $simpleCount = _container.querySelector('#lfCount');
    $tablesList  = _container.querySelector('#lfTablesList');
    $canvas      = _container.querySelector('#lfCanvas');
    $colsIn      = _container.querySelector('#lfCols');
    $rowsIn      = _container.querySelector('#lfRows');
    $saveStatus  = _container.querySelector('#lfSaveStatus');
    $saveBtn     = _container.querySelector('#lfSaveBtn');
  }

  /* ── Events ─────────────────────────────────────── */
  function _events() {
    $modeBar.addEventListener('click', e => {
      const b = e.target.closest('[data-mode]');
      if (!b) return;
      _cfg.mode = b.dataset.mode;
      _markDirty(); _render();
    });

    _container.querySelector('#lfMinus').addEventListener('click', () => {
      _cfg.tableCount = Math.max(1, (_cfg.tableCount || 5) - 1);
      _markDirty(); _renderSimple();
    });
    _container.querySelector('#lfPlus').addEventListener('click', () => {
      _cfg.tableCount = Math.min(50, (_cfg.tableCount || 5) + 1);
      _markDirty(); _renderSimple();
    });
    _container.querySelector('#lfTablesAdd').addEventListener('click', _addTable);

    $colsIn.addEventListener('change', () => {
      const v = clamp(parseInt($colsIn.value, 10), MIN_COLS, MAX_COLS);
      $colsIn.value = v; _cfg.gridCols = v; _markDirty(); _renderGrid();
    });
    $rowsIn.addEventListener('change', () => {
      const v = clamp(parseInt($rowsIn.value, 10), MIN_ROWS, MAX_ROWS);
      $rowsIn.value = v; _cfg.gridRows = v; _markDirty(); _renderGrid();
    });

    $saveBtn.addEventListener('click', _save);

    document.addEventListener('click', e => {
      if (_ctxMenu && !_ctxMenu.contains(e.target)) _closeCtx();
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') _closeCtx(); });
  }

  /* ── Render ─────────────────────────────────────── */
  function _render() {
    $modeBar.querySelectorAll('.lf-mode-btn').forEach(b =>
      b.classList.toggle('is-active', b.dataset.mode === _cfg.mode));
    $panelSimple.style.display = _cfg.mode === 'simple' ? '' : 'none';
    $panelTables.style.display = _cfg.mode === 'tables' ? '' : 'none';
    $panelGrid.style.display   = _cfg.mode === 'grid'   ? '' : 'none';
    if (_cfg.mode === 'simple') _renderSimple();
    if (_cfg.mode === 'tables') _renderTables();
    if (_cfg.mode === 'grid')   _renderGrid();
  }

  function _renderSimple() {
    $simpleCount.textContent = _cfg.tableCount || 5;
  }

  function _renderTables() {
    if (!_cfg.tables) _cfg.tables = [];
    $tablesList.innerHTML = _cfg.tables.map((t, i) => `
      <div class="lf-tcard" data-idx="${i}" title="Click to configure">
        ${tableSvg(t.shape || 'square', 52, t.capacity || 2, false, t.rotation || 0)}
        <span class="lf-tcard__label">${_esc(t.label || t.id)}</span>
        <span class="lf-tcard__cap">${t.capacity || 2} seats</span>
        <button class="lf-tcard__del" data-del="${i}" title="Remove">×</button>
      </div>`).join('');

    $tablesList.querySelectorAll('.lf-tcard').forEach(card => {
      card.addEventListener('click', e => {
        if (e.target.closest('[data-del]')) return;
        _openTableCtx(parseInt(card.dataset.idx, 10), card.getBoundingClientRect());
      });
    });
    $tablesList.querySelectorAll('[data-del]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        _cfg.tables.splice(parseInt(btn.dataset.del, 10), 1);
        _markDirty(); _renderTables();
      });
    });
  }

  function _renderGrid() {
    const cols = _cfg.gridCols || DEF_COLS;
    const rows = _cfg.gridRows || DEF_ROWS;
    $colsIn.value = cols; $rowsIn.value = rows;
    if (!_cfg.cells) _cfg.cells = [];

    const byPos = {};
    _cfg.cells.forEach(c => { byPos[`${c.col}_${c.row}`] = c; });

    $canvas.style.gridTemplateColumns = `repeat(${cols}, ${CELL_SIZE}px)`;
    $canvas.style.gridTemplateRows    = `repeat(${rows}, ${CELL_SIZE}px)`;

    let html = '';
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cell   = byPos[`${c}_${r}`];
        const active = cell && cell.active;
        const lbl    = active ? (cell.label || '') : '';
        const cap    = active && cell.capacity ? cell.capacity : 0;
        html += `<div class="lf-cell${active ? ' is-active' : ''}" data-col="${c}" data-row="${r}"
          style="width:${CELL_SIZE}px;height:${CELL_SIZE}px" title="${active ? lbl + ' (right-click to configure)' : ''}">
          ${active ? tableSvg(cell.shape || 'square', CELL_SIZE, cell.capacity || 2, false, cell.rotation || 0) : ''}
          ${lbl  ? `<span class="lf-cell__label">${_esc(lbl)}</span>` : ''}
          ${cap  ? `<span class="lf-cell__cap-badge">${cap}</span>` : ''}
        </div>`;
      }
    }
    $canvas.innerHTML = html;

    $canvas.querySelectorAll('.lf-cell').forEach(el => {
      // Mouse
      el.addEventListener('click',        _onCellClick);
      el.addEventListener('mousedown',    _onDown);
      el.addEventListener('mouseup',      _onUp);
      el.addEventListener('mousemove',    _onMove);
      el.addEventListener('mouseleave',   _cancelHold);
      el.addEventListener('contextmenu',  _onContextMenu);
      // Touch
      el.addEventListener('touchstart',   _onDown,  { passive: false });
      el.addEventListener('touchend',     _onUp);
      el.addEventListener('touchmove',    _onMove,  { passive: false });
    });
  }

  /* ── Cell interaction ───────────────────────────── */
  function _onCellClick(e) {
    // Only toggle on plain left-click (no hold, no right-click)
    if (e.button !== 0) return;
    if (_holdMoved) return;
    _toggleCell(e.currentTarget);
  }

  function _onDown(e) {
    if (e.type === 'touchstart') e.preventDefault();
    if (e.button === 2) return;       // right-click handled by contextmenu
    _holdMoved = false;
    _holdCell  = e.currentTarget;
    _holdTimer = setTimeout(() => {
      if (!_holdMoved) {
        _holdCell.classList.add('is-held');
        _openCellCtx(_holdCell);
      }
    }, HOLD_MS);
  }

  function _onUp() {
    _cancelHold();
  }

  function _onMove(e) {
    if (e.type === 'touchmove' && e.touches.length) {
      const t = e.touches[0];
      const el = document.elementFromPoint(t.clientX, t.clientY);
      if (!el || el !== _holdCell) { _holdMoved = true; _cancelHold(); }
    } else {
      _holdMoved = true; _cancelHold();
    }
  }

  function _onContextMenu(e) {
    e.preventDefault();
    _cancelHold();
    _holdMoved = true;   // prevent subsequent click from toggling
    _openCellCtx(e.currentTarget);
  }

  function _cancelHold() {
    if (_holdTimer) { clearTimeout(_holdTimer); _holdTimer = null; }
    if (_holdCell)  { _holdCell.classList.remove('is-held'); _holdCell = null; }
  }

  function _toggleCell(el) {
    const col = +el.dataset.col, row = +el.dataset.row;
    if (!_cfg.cells) _cfg.cells = [];
    let cell = _cfg.cells.find(c => c.col === col && c.row === row);
    if (cell) {
      cell.active = !cell.active;
    } else {
      const n = _cfg.cells.length + 1;
      _cfg.cells.push({ id: `t${n}`, col, row, active: true,
        label: String(n), shape: 'square', capacity: 2, rotation: 0 });
    }
    _markDirty(); _renderGrid();
  }

  /* ── Context menus ──────────────────────────────── */
  function _openCellCtx(el) {
    const col = +el.dataset.col, row = +el.dataset.row;
    if (!_cfg.cells) _cfg.cells = [];
    let cell = _cfg.cells.find(c => c.col === col && c.row === row);
    if (!cell) {
      const n = _cfg.cells.length + 1;
      cell = { id: `t${n}`, col, row, active: true, label: String(n), shape: 'square', capacity: 2, rotation: 0 };
      _cfg.cells.push(cell);
    }
    _showCtxMenu(
      el.getBoundingClientRect(),
      cell,
      () => { _markDirty(); _renderGrid(); },
      () => { cell.active = false; _markDirty(); _renderGrid(); }
    );
  }

  function _openTableCtx(idx, rect) {
    const t = _cfg.tables[idx];
    if (!t) return;
    _showCtxMenu(rect, t, () => { _markDirty(); _renderTables(); }, null);
  }

  function _showCtxMenu(triggerRect, target, onChange, onDeactivate) {
    _closeCtx();
    const menu = document.createElement('div');
    menu.className = 'lf-ctx-menu';
    _ctxMenu = menu;

    const rot = target.rotation || 0;

    menu.innerHTML = `
      <div class="lf-ctx-menu__title">Configure table</div>

      <div class="lf-ctx-menu__shapes" id="ctxShapes">
        ${SHAPES.map(s => `
          <button class="lf-ctx-shape-btn${target.shape === s ? ' is-active' : ''}" data-shape="${s}">
            ${_shapeIconSvg(s, 28)}
            <span>${s}</span>
          </button>`).join('')}
      </div>

      <div class="lf-ctx-menu__rot">
        <span class="lf-ctx-menu__rot-label">Rotation</span>
        ${[0,90,180,270].map(d => `
          <button class="lf-rot-btn${rot === d ? ' is-active' : ''}" data-rot="${d}">${d}°</button>`
        ).join('')}
      </div>

      <div class="lf-ctx-menu__row">
        <label>Label</label>
        <input type="text" id="ctxLabel" value="${_esc(target.label || '')}"/>
      </div>
      <div class="lf-ctx-menu__row">
        <label>Seats</label>
        <input type="number" id="ctxCap" min="1" max="20" value="${target.capacity || 2}"/>
      </div>

      <div class="lf-ctx-menu__footer">
        ${onDeactivate ? '<button class="lf-ctx-menu__btn lf-ctx-menu__btn--danger" id="ctxDel">Deactivate</button>' : ''}
        <button class="lf-ctx-menu__btn" id="ctxCancel">Cancel</button>
        <button class="lf-ctx-menu__btn lf-ctx-menu__btn--primary" id="ctxApply">Apply</button>
      </div>`;

    document.body.appendChild(menu);
    _positionMenu(menu, triggerRect);

    // Shape buttons
    menu.querySelectorAll('[data-shape]').forEach(b => {
      b.addEventListener('click', e => {
        e.stopPropagation();
        menu.querySelectorAll('[data-shape]').forEach(x => x.classList.remove('is-active'));
        b.classList.add('is-active');
        target.shape = b.dataset.shape;
      });
    });

    // Rotation buttons
    menu.querySelectorAll('[data-rot]').forEach(b => {
      b.addEventListener('click', e => {
        e.stopPropagation();
        menu.querySelectorAll('[data-rot]').forEach(x => x.classList.remove('is-active'));
        b.classList.add('is-active');
        target.rotation = parseInt(b.dataset.rot, 10);
      });
    });

    menu.querySelector('#ctxApply').addEventListener('click', e => {
      e.stopPropagation();
      target.label    = menu.querySelector('#ctxLabel').value.trim();
      target.capacity = parseInt(menu.querySelector('#ctxCap').value, 10) || 2;
      onChange();
      _closeCtx();
    });

    menu.querySelector('#ctxCancel').addEventListener('click', e => {
      e.stopPropagation(); _closeCtx();
    });

    const delBtn = menu.querySelector('#ctxDel');
    if (delBtn) {
      delBtn.addEventListener('click', e => {
        e.stopPropagation();
        if (onDeactivate) onDeactivate();
        _closeCtx();
      });
    }
  }

  function _positionMenu(menu, rect) {
    const mw = 248, mh = 310;
    let x = rect.right + 10;
    let y = rect.top;
    if (x + mw > window.innerWidth - 8)  x = rect.left - mw - 10;
    if (x < 8) x = 8;
    if (y + mh > window.innerHeight - 8) y = window.innerHeight - mh - 8;
    if (y < 8) y = 8;
    menu.style.left = x + 'px';
    menu.style.top  = y + 'px';
  }

  function _closeCtx() {
    if (_ctxMenu) { _ctxMenu.remove(); _ctxMenu = null; }
  }

  function _addTable() {
    if (!_cfg.tables) _cfg.tables = [];
    const n = _cfg.tables.length + 1;
    _cfg.tables.push({ id: `t${n}`, label: `T${n}`, shape: 'square', capacity: 2, rotation: 0 });
    _markDirty(); _renderTables();
  }

  /* ── Save ───────────────────────────────────────── */
  async function _save() {
    if (_saving || !_dirty) return;
    _saving = true;
    $saveBtn.disabled = true;
    $saveStatus.textContent = 'Saving…';
    $saveStatus.className   = 'lf-save-bar__status';
    try {
      const r = await fetch(`${_apiBase}/api/super/layout/${_rid}`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${_jwt}` },
        body:    JSON.stringify(_cfg),
      });
      if (!r.ok) throw new Error(await r.text());
      _dirty = false;
      $saveStatus.textContent = 'Layout saved ✓';
      $saveStatus.className   = 'lf-save-bar__status is-saved';
      $saveBtn.disabled = true;
    } catch (err) {
      $saveStatus.textContent = 'Save failed — ' + err.message;
      $saveStatus.className   = 'lf-save-bar__status is-error';
      $saveBtn.disabled = false;
    } finally {
      _saving = false;
    }
  }

  function _markDirty() {
    _dirty = true;
    $saveStatus.textContent = 'Unsaved changes';
    $saveStatus.className   = 'lf-save-bar__status is-dirty';
    $saveBtn.disabled = false;
  }

  /* ================================================================
     TABLE + CHAIRS SVG
     Draws a realistic top-down floor-plan view.
     Colors come from CSS custom properties on the cell:
       --tf  table fill       --ts  table stroke
       --cf  chair fill       --cs  chair stroke
     ================================================================ */
  function tableSvg(shape, S, capacity, _unused, rotation) {
    const cx = S / 2, cy = S / 2;
    const cap = clamp(capacity || 2, 1, 14);

    const cW  = Math.round(S * 0.135);   // chair width (tangential)
    const cH  = Math.round(S * 0.092);   // chair depth (radial from table edge)
    const cR  = 2;
    const gap = Math.max(2, Math.round(S * 0.038));
    const inset = cH + gap + Math.round(S * 0.04);

    // Table + chair SVG elements — colors from CSS vars with fallbacks
    const tSty = `style="fill:var(--tf,rgba(196,149,90,0.3));stroke:var(--ts,#c4955a);stroke-width:1.5"`;
    const cSty = `style="fill:var(--cf,rgba(196,149,90,0.5));stroke:var(--cs,#c4955a);stroke-width:1"`;

    let tEl = '', chairs = '';

    if (shape === 'circle') {
      const r = Math.round(S / 2 - inset);
      tEl    = `<circle cx="${cx}" cy="${cy}" r="${r}" ${tSty}/>`;
      chairs = _circleChairs(cx, cy, r, cap, gap, cW, cH, cR, cSty);

    } else if (shape === 'ellipse') {
      const rx = Math.round(S / 2 - inset * 0.45);
      const ry = Math.round(S / 2 - inset * 1.4);
      tEl    = `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" ${tSty}/>`;
      chairs = _ellipseChairs(cx, cy, rx, ry, cap, gap, cW, cH, cR, cSty);

    } else if (shape === 'rect') {
      // Landscape rectangle
      const tw = Math.round(S - inset * 1.0);
      const th = Math.round(S * 0.40);
      const tx = Math.round(cx - tw / 2), ty = Math.round(cy - th / 2);
      tEl    = `<rect x="${tx}" y="${ty}" width="${tw}" height="${th}" rx="4" ${tSty}/>`;
      chairs = _perimeterChairs(tx, ty, tw, th, cap, gap, cW, cH, cR, cSty);

    } else {
      // square
      const ts = Math.round(S - inset * 2.0);
      const tx = Math.round(cx - ts / 2), ty = Math.round(cy - ts / 2);
      tEl    = `<rect x="${tx}" y="${ty}" width="${ts}" height="${ts}" rx="5" ${tSty}/>`;
      chairs = _perimeterChairs(tx, ty, ts, ts, cap, gap, cW, cH, cR, cSty);
    }

    const gRot = rotation ? ` transform="rotate(${rotation},${cx},${cy})"` : '';
    return `<svg width="${S}" height="${S}" viewBox="0 0 ${S} ${S}" aria-hidden="true"
              style="position:absolute;inset:0;width:100%;height:100%;overflow:visible">
      <g${gRot}>${chairs}${tEl}</g>
    </svg>`;
  }

  /* ── Chair distribution helpers ─────────────────── */

  // Chairs evenly spaced around a circle
  function _circleChairs(cx, cy, r, N, gap, cW, cH, cR, cSty) {
    let h = '';
    const dist = r + gap + cH / 2;
    for (let i = 0; i < N; i++) {
      const a = (2 * Math.PI * i / N) - Math.PI / 2;
      h += _chair(cx + dist * Math.cos(a), cy + dist * Math.sin(a),
                  cW, cH, cR, a * 180 / Math.PI + 90, cSty);
    }
    return h;
  }

  // Chairs evenly spaced around an ellipse (using outward normal)
  function _ellipseChairs(cx, cy, rx, ry, N, gap, cW, cH, cR, cSty) {
    let h = '';
    for (let i = 0; i < N; i++) {
      const t  = (2 * Math.PI * i / N) - Math.PI / 2;
      const px = rx * Math.cos(t), py = ry * Math.sin(t);
      const nx = px / (rx * rx),   ny = py / (ry * ry);
      const nl = Math.sqrt(nx * nx + ny * ny);
      const d  = gap + cH / 2;
      h += _chair(cx + px + d * nx / nl, cy + py + d * ny / nl,
                  cW, cH, cR, Math.atan2(ny / nl, nx / nl) * 180 / Math.PI + 90, cSty);
    }
    return h;
  }

  // Chairs evenly distributed along the 4 sides of a rectangle
  function _perimeterChairs(tx, ty, tw, th, N, gap, cW, cH, cR, cSty) {
    let h = '';
    const perim = 2 * (tw + th);
    for (let i = 0; i < N; i++) {
      const d = ((i + 0.5) / N) * perim;
      let x, y, deg;
      if (d < tw) {
        x = tx + d;             y = ty - gap - cH / 2;       deg = 0;
      } else if (d < tw + th) {
        x = tx + tw + gap + cH / 2; y = ty + (d - tw);       deg = 90;
      } else if (d < 2 * tw + th) {
        x = tx + (tw - (d - tw - th));  y = ty + th + gap + cH / 2; deg = 180;
      } else {
        x = tx - gap - cH / 2;  y = ty + (th - (d - 2 * tw - th)); deg = 270;
      }
      h += _chair(x, y, cW, cH, cR, deg, cSty);
    }
    return h;
  }

  // Draw one chair: a rounded rect centered at (cx,cy) and rotated
  function _chair(cx, cy, w, h, r, deg, cSty) {
    const x = (cx - w / 2).toFixed(1), y = (cy - h / 2).toFixed(1);
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" ${cSty}
              transform="rotate(${deg.toFixed(1)},${cx.toFixed(1)},${cy.toFixed(1)})"/>`;
  }

  /* ── Shape icon SVG for context menu buttons ─────── */
  function _shapeIconSvg(shape, sz) {
    const h = sz, w = sz;
    const col = 'var(--accent,#c4955a)';
    switch (shape) {
      case 'circle':
        return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true">
          <circle cx="${w/2}" cy="${h/2}" r="${w/2-3}" fill="none" stroke="${col}" stroke-width="1.5"/></svg>`;
      case 'ellipse':
        return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true">
          <ellipse cx="${w/2}" cy="${h/2}" rx="${w/2-3}" ry="${h/2-7}" fill="none" stroke="${col}" stroke-width="1.5"/></svg>`;
      case 'rect':
        return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true">
          <rect x="2" y="${h/4}" width="${w-4}" height="${h/2}" rx="3" fill="none" stroke="${col}" stroke-width="1.5"/></svg>`;
      default: // square
        return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true">
          <rect x="3" y="3" width="${w-6}" height="${h-6}" rx="3" fill="none" stroke="${col}" stroke-width="1.5"/></svg>`;
    }
  }

  /* ── Utilities ──────────────────────────────────── */
  function clamp(v, min, max) { return isNaN(v) ? min : Math.min(max, Math.max(min, v)); }

  function _esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // Expose tableSvg for reserve.js
  window.LayoutEditor.tableSvg = tableSvg;

})();
