/**
 * reserve.js — public guest reservation page
 * URL: /reserve/?r={restaurantId}[&date=YYYY-MM-DD&time=HH:MM]
 *
 * Table shapes rendered as top-down floor-plan SVGs (table + chairs).
 * Colors driven by CSS custom properties on each .rv-cell:
 *   .is-free     → amber/gold accent  (--tf, --ts, --cf, --cs in layout.css)
 *   .is-taken    → muted gray
 *   .is-selected → navy
 *   .is-inactive → transparent (no pointer events)
 */
(function () {
  'use strict';

  const DEFAULT_API = 'http://127.0.0.1:8080';
  const SUGGEST_WIN_START = 10 * 60;
  const SUGGEST_WIN_END   = 22 * 60;
  const SLOT_STEP         = 30;

  function getApi() {
    if (window.__MENU_API_BASE__) return window.__MENU_API_BASE__.replace(/\/$/, '');
    const m = document.querySelector('meta[name="menu-api-base"]');
    if (m) { const c = m.getAttribute('content'); if (c) return c.replace(/\/$/, ''); }
    return (location.hostname === 'localhost' || location.hostname === '127.0.0.1') ? DEFAULT_API : '';
  }

  const params = new URLSearchParams(location.search);
  const rid    = params.get('r') || '';
  const BASE   = getApi();

  const $back         = document.getElementById('rvBack');
  const $name         = document.getElementById('rvRestaurantName');
  const $sub          = document.getElementById('rvRestaurantSub');
  const $body         = document.getElementById('rvBody');
  const $dateInput    = document.getElementById('rvDateInput');
  const $timeInput    = document.getElementById('rvTimeInput');
  const $durHost      = document.getElementById('rvDurationHost');
  const $forfeitHint  = document.getElementById('rvForfeitHint');

  let layout     = null;
  let occupied   = [];
  let dayBlocks  = [];
  let selectedId = null;
  let sheetOpen  = false;
  let resConfig  = { allowed: [120], forfeit: 30 };
  let selectDurMin = 120;

  if (!rid || !BASE) {
    _showError(!rid ? 'No restaurant specified (?r=id).' : 'API not configured.');
    return;
  }

  $back.href = '../' + encodeURIComponent(rid) + '/';

  function localYmd(d) {
    const x = d instanceof Date ? d : new Date(d);
    const y = x.getFullYear();
    const m = String(x.getMonth() + 1).padStart(2, '0');
    const day = String(x.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }

  const now = new Date();
  const todayLocal = localYmd(now);
  const paramDate = params.get('date');
  $dateInput.min = todayLocal;
  $dateInput.value = paramDate && paramDate >= todayLocal ? paramDate : todayLocal;
  $timeInput.value = params.get('time') || _roundSlot(now);

  $dateInput.addEventListener('change', () => { _onDateOrTimeChange(); });
  $timeInput.addEventListener('change', () => { _reloadOccupied(); });

  _load();

  function _onDateOrTimeChange() {
    _fetchDayBlocks()
      .then(() => { _renderFloor(); });
  }

  function _parseResConfigFromMenu(root) {
    const cfg = root?.record?.restaurant?.menu?.config || {};
    const raw = cfg.reservation_allowed_durations_minutes;
    let allowed = [120];
    if (Array.isArray(raw) && raw.length) {
      allowed = raw.map(n => parseInt(n, 10)).filter(n => n > 0 && n <= 24 * 60);
    } else if (typeof raw === 'number' && raw > 0) {
      allowed = [raw];
    }
    if (!allowed.length) allowed = [120];
    allowed = [...new Set(allowed)].sort((a, b) => a - b);
    let forfeit = typeof cfg.reservation_forfeit_minutes === 'number' && cfg.reservation_forfeit_minutes >= 0
      ? cfg.reservation_forfeit_minutes
      : 30;
    if (forfeit > 24 * 60) forfeit = 24 * 60;
    return { allowed, forfeit };
  }

  function _applyResConfig() {
    selectDurMin = resConfig.allowed[0] || 120;
    if (!$durHost) {
      return;
    }
    $durHost.style.display = '';
    $durHost.setAttribute('aria-hidden', 'false');
    if (resConfig.allowed.length <= 1) {
      $durHost.style.display = 'none';
      $durHost.setAttribute('aria-hidden', 'true');
      $durHost.innerHTML = '';
    } else {
      $durHost.innerHTML = `<label for="rvGlobalDur" style="margin-left:8px">Duration</label>
        <select class="rv-date-bar__dur" id="rvGlobalDur"></select>`;
      const sel = $durHost.querySelector('#rvGlobalDur');
      resConfig.allowed.forEach(m => {
        const o = document.createElement('option');
        o.value = String(m);
        o.textContent = m >= 60 && m % 60 === 0
          ? `${m / 60} h`
          : `${m} min`;
        if (m === selectDurMin) o.selected = true;
        sel.appendChild(o);
      });
      sel.addEventListener('change', () => {
        selectDurMin = parseInt(sel.value, 10) || 120;
        _reloadOccupied();
        _renderFloor();
      });
    }
    if ($forfeitHint) {
      if (resConfig.forfeit > 0) {
        $forfeitHint.style.display = '';
        $forfeitHint.textContent =
          `Reservations not honoured within ${resConfig.forfeit} minutes of the booked time may be given away.`;
      } else {
        $forfeitHint.style.display = 'none';
        $forfeitHint.textContent = '';
      }
    }
  }

  /* ------------------------------------------------------------------ */
  async function _load() {
    _showLoading();
    try {
      const lr = await fetch(`${BASE}/api/public/layout/${encodeURIComponent(rid)}`);
      layout = (lr.status === 204 || lr.status === 404) ? null
             : lr.ok ? JSON.parse((await lr.json()).configJson)
             : null;
      try {
        const menu = await fetch(`${BASE}/api/public/menu/${encodeURIComponent(rid)}`);
        if (menu.ok) {
          const d = await menu.json();
          resConfig = _parseResConfigFromMenu(d);
          const rest = d?.record?.restaurant;
          if (rest) {
            $name.textContent = rest.name?.en || rest.name?.bg || rid;
            $sub.textContent  = 'Reserve a table';
            document.title    = `Reserve — ${$name.textContent}`;
            document.body.setAttribute('data-theme', 'modern');
          }
        }
      } catch (_) { /* use defaults */ }
      _applyResConfig();
      await _fetchDayBlocks();
      await _reloadOccupied(true);
    } catch (e) { _showError(e.message); }
  }

  async function _fetchDayBlocks() {
    const date = $dateInput.value;
    if (!date) { dayBlocks = []; return; }
    try {
      const r = await fetch(
        `${BASE}/api/public/reservations/${encodeURIComponent(rid)}/day-blocks?date=${date}`
      );
      const j = r.ok ? await r.json() : { blocks: [] };
      dayBlocks = j.blocks || [];
    } catch (_) { dayBlocks = []; }
  }

  async function _reloadOccupied(andRender = true) {
    const date = $dateInput.value;
    if (!date) return;
    const time   = $timeInput.value;
    const dur    = selectDurMin;
    let q = `date=${encodeURIComponent(date)}`;
    if (time) {
      q += `&time=${encodeURIComponent(time)}&durationMinutes=${encodeURIComponent(String(dur))}`;
    }
    try {
      const r = await fetch(
        `${BASE}/api/public/reservations/${encodeURIComponent(rid)}/occupied?${q}`
      );
      occupied = r.ok ? ((await r.json()).occupiedTableIds || []) : [];
    } catch (_) { occupied = []; }
    if (andRender !== false) _renderFloor();
  }

  function _blocksByTable() {
    const m = {};
    (dayBlocks || []).forEach(b => {
      if (!m[b.tableId]) m[b.tableId] = [];
      m[b.tableId].push([b.startMinuteOfDay, b.endMinuteOfDay]);
    });
    return m;
  }

  function _isSlotFree(tStart, dur, tableId, bbt) {
    const tEnd = tStart + dur;
    if (tStart < SUGGEST_WIN_START || tEnd > SUGGEST_WIN_END) return false;
    const segs = bbt[tableId] || [];
    for (let k = 0; k < segs.length; k++) {
      const a = segs[k][0];
      const b = segs[k][1];
      if (tStart < b && a < tEnd) return false;
    }
    return true;
  }

  function _minSlotMinuteForDate(ymd) {
    if (ymd < todayLocal) return SUGGEST_WIN_END;
    if (ymd > todayLocal) return SUGGEST_WIN_START;
    const n = new Date();
    const nowM = n.getHours() * 60 + n.getMinutes();
    return Math.max(SUGGEST_WIN_START, Math.ceil((nowM + 20) / SLOT_STEP) * SLOT_STEP);
  }

  function _computeSlotSuggestions() {
    const ymd   = $dateInput.value;
    const dur   = selectDurMin;
    const tlist = getTableListFromLayout();
    const bbt   = _blocksByTable();
    if (!tlist.length || ymd < todayLocal) return [];

    const minFrom = _minSlotMinuteForDate(ymd);
    const out = [];
    for (let t = minFrom; t + dur <= SUGGEST_WIN_END; t += SLOT_STEP) {
      for (let i = 0; i < tlist.length; i++) {
        const table = tlist[i];
        if (!table || !table.id) continue;
        if (_isSlotFree(t, dur, table.id, bbt)) {
          out.push({ table, startMin: t });
          if (out.length >= 8) return out;
          break;
        }
      }
    }
    return out;
  }

  function getTableListFromLayout() {
    if (!layout) return [];
    if (layout.mode === 'simple') {
      return Array.from({ length: layout.tableCount || 5 }, (_, i) => ({
        id: `t${i + 1}`, label: `T${i + 1}`, capacity: 2, shape: 'square', rotation: 0
      }));
    }
    if (layout.mode === 'tables') return (layout.tables || []).slice();
    if (layout.mode === 'grid') {
      return (layout.cells || []).filter(c => c && c.active);
    }
    return [];
  }

  function _minToHHMM(m) {
    const h = Math.floor(m / 60);
    const min = m % 60;
    return String(h).padStart(2, '0') + ':' + String(min).padStart(2, '0');
  }

  /* ------------------------------------------------------------------ */
  function _renderFloor() {
    if (!layout) { _renderNoLayout(); return; }
    $body.innerHTML = '';
    $body.appendChild(_suggestionStrip());
    $body.appendChild(_legend());
    switch (layout.mode) {
      case 'simple':  _renderSimple();  break;
      case 'tables':  _renderTables();  break;
      case 'grid':    _renderGrid();    break;
      default:        _renderNoLayout();
    }
  }

  function _suggestionStrip() {
    const d = document.createElement('div');
    d.className = 'rv-slot-strip';
    const sugs = _computeSlotSuggestions();
    if (!sugs.length) {
      d.style.display = 'none';
      return d;
    }
    d.style.display = '';
    d.innerHTML = `<div class="rv-slot-strip__title">Suggested times</div>
      <div class="rv-slot-strip__chips" role="list"></div>`;
    const chips = d.querySelector('.rv-slot-strip__chips');
    sugs.forEach(s => {
      const lab = s.table.label || s.table.id;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'rv-slot-chip';
      btn.setAttribute('role', 'listitem');
      btn.textContent = `${_minToHHMM(s.startMin)} · ${lab}`;
      btn.addEventListener('click', () => {
        $timeInput.value = _minToHHMM(s.startMin);
        const g = $durHost && $durHost.querySelector('#rvGlobalDur');
        if (g) g.value = String(selectDurMin);
        _reloadOccupied(false)
          .then(() => { _selectTable(s.table.id, s.table); });
      });
      chips.appendChild(btn);
    });
    return d;
  }

  function _legend() {
    const d = document.createElement('div');
    d.className = 'rv-legend';
    d.innerHTML = `
      <div class="rv-legend__item"><div class="rv-legend__dot rv-legend__dot--free"></div>Available</div>
      <div class="rv-legend__item"><div class="rv-legend__dot rv-legend__dot--taken"></div>Booked (this time)</div>
      <div class="rv-legend__item"><div class="rv-legend__dot rv-legend__dot--sel"></div>Selected</div>`;
    return d;
  }

  function _renderNoLayout() {
    $body.innerHTML = `<div class="rv-loading" style="padding:48px 20px">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2">
        <rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/>
        <rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>
      </svg>
      <span>Floor plan not configured. Please contact the restaurant.</span></div>`;
  }

  function _renderSimple() {
    const tables = getTableListFromLayout();
    _renderTableCards(tables);
  }

  function _renderTables() {
    _renderTableCards(layout.tables || []);
  }

  function _renderTableCards(tables) {
    const stage = document.createElement('div');
    stage.className = 'rv-floor-stage';
    const wrap = document.createElement('div');
    wrap.className = 'rv-table-list';
    tables.forEach(t => {
      const taken = occupied.includes(t.id);
      const sel   = t.id === selectedId;
      const card  = document.createElement('div');
      card.className = 'rv-tcard ' + (sel ? 'is-selected' : taken ? 'is-taken' : 'is-free');
      card.innerHTML = `<span class="rv-tcard__label">${_esc(t.label || t.id)}</span>
                        <span class="rv-tcard__cap">${t.capacity || 2}</span>`;
      if (!taken) card.addEventListener('click', () => _selectTable(t.id, t));
      wrap.appendChild(card);
    });
    stage.appendChild(wrap);
    $body.appendChild(stage);
  }

  function _renderGrid() {
    const LB = typeof window.LayoutBounds !== 'undefined' ? window.LayoutBounds : null;
    const frame = LB && layout.mode === 'grid' ? LB.getFrameOrStored(layout) : null;

    if (!frame || !LB) {
      _renderGridFullBleed();
      return;
    }

    const cols = frame.spanCols;
    const rows = frame.spanRows;
    const originCol = frame.originCol;
    const originRow = frame.originRow;
    const gap = LB.CELL_GAP;
    const pad = LB.CELL_PAD;
    const cells = layout.cells || [];
    const byPos = {};
    cells.forEach(c => { if (c) byPos[`${c.col}_${c.row}`] = c; });

    const headerReserve = 200;
    const availW = Math.max(280, window.innerWidth - 28);
    const availH = Math.max(200, window.innerHeight - headerReserve);
    let cellSz = Math.floor((availW - 2 * pad - gap * (cols - 1)) / cols);
    cellSz = Math.min(cellSz, Math.floor((availH - 2 * pad - gap * (rows - 1)) / rows));
    cellSz = Math.max(40, Math.min(92, cellSz));

    const stage = document.createElement('div');
    stage.className = 'rv-floor-stage';

    const outer = document.createElement('div');
    outer.className = 'rv-canvas-outer';

    const wrap = document.createElement('div');
    wrap.className = 'rv-floor-wrap';

    const zonesLayer = document.createElement('div');
    zonesLayer.className = 'rv-floor-zones';
    (layout.zones || []).forEach(z => {
      if (!z) return;
      if (z.col < originCol || z.col >= originCol + cols || z.row < originRow || z.row >= originRow + rows) return;
      const chip = document.createElement('span');
      chip.className = 'rv-zone-chip';
      chip.textContent = z.label || '';
      chip.style.left = `${pad + (z.col - originCol) * (cellSz + gap)}px`;
      chip.style.top  = `${pad + (z.row - originRow) * (cellSz + gap)}px`;
      zonesLayer.appendChild(chip);
    });

    const canvas = document.createElement('div');
    canvas.className = 'rv-canvas';
    canvas.style.gridTemplateColumns = `repeat(${cols}, ${cellSz}px)`;
    canvas.style.gridTemplateRows    = `repeat(${rows}, ${cellSz}px)`;
    canvas.style.padding = `${pad}px`;

    for (let dr = 0; dr < rows; dr++) {
      for (let dc = 0; dc < cols; dc++) {
        const gc = originCol + dc;
        const gr = originRow + dr;
        const cell = byPos[`${gc}_${gr}`];
        const el = document.createElement('div');
        el.style.width = cellSz + 'px';
        el.style.height = cellSz + 'px';

        if (!cell || !cell.active) {
          el.className = 'rv-cell is-inactive';
        } else {
          const taken = occupied.includes(cell.id);
          const sel = cell.id === selectedId;
          el.className = 'rv-cell ' + (sel ? 'is-selected' : taken ? 'is-taken' : 'is-free');
          el.innerHTML = _tableSvg(cell.shape || 'square', cellSz, cell.capacity || 2, cell.rotation || 0);
          el.innerHTML += `<span class="rv-cell__label">${_esc(cell.label || '')}</span>`;
          if (cell.capacity) el.innerHTML += `<span class="rv-cell__cap">${cell.capacity}</span>`;
          if (!taken) el.addEventListener('click', () => _selectTable(cell.id, cell));
        }
        canvas.appendChild(el);
      }
    }

    wrap.appendChild(zonesLayer);
    wrap.appendChild(canvas);
    outer.appendChild(wrap);
    stage.appendChild(outer);
    $body.appendChild(stage);
  }

  function _renderGridFullBleed() {
    const cols = layout.gridCols || 10;
    const rows = layout.gridRows || 7;
    const cells = layout.cells || [];
    const byPos = {};
    cells.forEach(c => { if (c) byPos[`${c.col}_${c.row}`] = c; });

    const gap = 3;
    const pad = 10;
    const availW = Math.max(280, window.innerWidth - 28);
    const availH = Math.max(200, window.innerHeight - 220);
    let cellSz = Math.floor((availW - 2 * pad - gap * (cols - 1)) / cols);
    cellSz = Math.min(cellSz, Math.floor((availH - 2 * pad - gap * (rows - 1)) / rows));
    cellSz = Math.max(36, Math.min(72, cellSz));

    const stage = document.createElement('div');
    stage.className = 'rv-floor-stage';
    const outer = document.createElement('div');
    outer.className = 'rv-canvas-outer';
    const canvas = document.createElement('div');
    canvas.className = 'rv-canvas';
    canvas.style.gridTemplateColumns = `repeat(${cols}, ${cellSz}px)`;
    canvas.style.gridTemplateRows    = `repeat(${rows}, ${cellSz}px)`;
    canvas.style.padding = `${pad}px`;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cell = byPos[`${c}_${r}`];
        const el = document.createElement('div');
        el.style.width = cellSz + 'px';
        el.style.height = cellSz + 'px';

        if (!cell || !cell.active) {
          el.className = 'rv-cell is-inactive';
        } else {
          const taken = occupied.includes(cell.id);
          const sel = cell.id === selectedId;
          el.className = 'rv-cell ' + (sel ? 'is-selected' : taken ? 'is-taken' : 'is-free');
          el.innerHTML = _tableSvg(cell.shape || 'square', cellSz, cell.capacity || 2, cell.rotation || 0);
          el.innerHTML += `<span class="rv-cell__label">${_esc(cell.label || '')}</span>`;
          if (cell.capacity) el.innerHTML += `<span class="rv-cell__cap">${cell.capacity}</span>`;
          if (!taken) el.addEventListener('click', () => _selectTable(cell.id, cell));
        }
        canvas.appendChild(el);
      }
    }
    outer.appendChild(canvas);
    stage.appendChild(outer);
    $body.appendChild(stage);
  }

  /* ------------------------------------------------------------------ */
  function _tableSvg(shape, S, capacity, rotation) {
    const cx = S / 2, cy = S / 2;
    const cap = Math.max(1, Math.min(capacity || 2, 14));
    const cW   = Math.round(S * 0.135);
    const cH   = Math.round(S * 0.092);
    const cR   = 2;
    const gap  = Math.max(2, Math.round(S * 0.038));
    const inset = cH + gap + Math.round(S * 0.04);

    const tSty = `style="fill:var(--tf,rgba(196,149,90,0.25));stroke:var(--ts,#c4955a);stroke-width:1.5"`;
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
      const tw = Math.round(S - inset * 1.0);
      const th = Math.round(S * 0.40);
      const tx = Math.round(cx - tw/2), ty = Math.round(cy - th/2);
      tEl    = `<rect x="${tx}" y="${ty}" width="${tw}" height="${th}" rx="4" ${tSty}/>`;
      chairs = _perimChairs(tx, ty, tw, th, cap, gap, cW, cH, cR, cSty);
    } else {
      const ts = Math.round(S - inset * 2.0);
      const tx = Math.round(cx - ts/2), ty = Math.round(cy - ts/2);
      tEl    = `<rect x="${tx}" y="${ty}" width="${ts}" height="${ts}" rx="5" ${tSty}/>`;
      chairs = _perimChairs(tx, ty, ts, ts, cap, gap, cW, cH, cR, cSty);
    }

    const gRot = rotation ? ` transform="rotate(${rotation},${cx},${cy})"` : '';
    return `<svg width="${S}" height="${S}" viewBox="0 0 ${S} ${S}" aria-hidden="true"
              style="position:absolute;inset:0;width:100%;height:100%;overflow:visible">
      <g${gRot}>${chairs}${tEl}</g></svg>`;
  }

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

  function _ellipseChairs(cx, cy, rx, ry, N, gap, cW, cH, cR, cSty) {
    let h = '';
    for (let i = 0; i < N; i++) {
      const t  = (2 * Math.PI * i / N) - Math.PI / 2;
      const px = rx * Math.cos(t), py = ry * Math.sin(t);
      const nx = px / (rx * rx),   ny = py / (ry * ry);
      const nl = Math.sqrt(nx * nx + ny * ny);
      const d  = gap + cH / 2;
      h += _chair(cx + px + d * nx / nl, cy + py + d * ny / nl,
        cW, cH, cR, Math.atan2(ny/nl, nx/nl) * 180 / Math.PI + 90, cSty);
    }
    return h;
  }

  function _perimChairs(tx, ty, tw, th, N, gap, cW, cH, cR, cSty) {
    let h = '';
    const perim = 2 * (tw + th);
    for (let i = 0; i < N; i++) {
      const d = ((i + 0.5) / N) * perim;
      let x, y, deg;
      if (d < tw)              { x = tx + d; y = ty - gap - cH/2; deg = 0; }
      else if (d < tw + th)    { x = tx + tw + gap + cH/2; y = ty + (d - tw); deg = 90; }
      else if (d < 2*tw + th)  { x = tx + (tw - (d - tw - th)); y = ty + th + gap + cH/2; deg = 180; }
      else                     { x = tx - gap - cH/2; y = ty + (th - (d - 2*tw - th)); deg = 270; }
      h += _chair(x, y, cW, cH, cR, deg, cSty);
    }
    return h;
  }

  function _chair(cx, cy, w, h, r, deg, cSty) {
    const x = (cx - w/2).toFixed(1), y = (cy - h/2).toFixed(1);
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" ${cSty}
              transform="rotate(${deg.toFixed(1)},${cx.toFixed(1)},${cy.toFixed(1)})"/>`;
  }

  /* ------------------------------------------------------------------ */
  function _selectTable(id, data) {
    if (occupied.includes(id)) return;
    selectedId = id;
    _renderFloor();
    _openSheet(data);
  }

  function _attachSheetSwipe(sheet, onClose) {
    const isDesktop = () => window.matchMedia('(min-width: 768px)').matches;
    let swipeStartY  = 0;
    let swipeCurrent = 0;
    let swipeActive  = false;

    const setTranslate = (dy) => {
      if (isDesktop()) {
        sheet.style.transform = `translateX(-50%) translateY(${dy}px)`;
      } else {
        sheet.style.transform = `translateY(${dy}px)`;
      }
    };

    sheet.addEventListener('touchstart', e => {
      if (sheet.scrollTop > 0) return;
      swipeStartY  = e.touches[0].clientY;
      swipeCurrent = swipeStartY;
      swipeActive  = true;
      sheet.style.transition = 'none';
    }, { passive: true });

    sheet.addEventListener('touchmove', e => {
      if (!swipeActive) return;
      swipeCurrent = e.touches[0].clientY;
      const delta = Math.max(0, swipeCurrent - swipeStartY);
      setTranslate(delta);
    }, { passive: true });

    sheet.addEventListener('touchend', () => {
      if (!swipeActive) return;
      swipeActive = false;
      sheet.style.transition = '';
      const delta = swipeCurrent - swipeStartY;
      if (delta > 110 || delta > sheet.offsetHeight * 0.28) {
        sheet.style.transform = '';
        onClose();
      } else {
        sheet.style.transform = '';
      }
    });
  }

  function _durSelectHtml() {
    if (resConfig.allowed.length <= 1) {
      return `<input type="hidden" id="rvDur" value="${resConfig.allowed[0] || 120}"/>`;
    }
    const opts = resConfig.allowed.map(m => {
      const label = m >= 60 && m % 60 === 0
        ? `${m / 60} hours`
        : `${m} min`;
      const sel = m === selectDurMin ? ' selected' : '';
      return `<option value="${m}"${sel}>${label}</option>`;
    }).join('');
    return `<div class="rv-form__group" id="rvDurRow">
        <label class="rv-form__label" for="rvDur">Duration *</label>
        <select class="rv-form__input" id="rvDur">${opts}</select>
      </div>`;
  }

  function _openSheet(data) {
    if (sheetOpen) _closeSheet(false);
    sheetOpen = true;

    const overlay = document.createElement('div');
    overlay.className = 'rv-sheet-overlay';
    overlay.addEventListener('click', _closeSheet);

    const sheet = document.createElement('div');
    sheet.className = 'rv-sheet';
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-modal', 'true');

    const label = data.label || data.id || '';
    const cap   = data.capacity || 2;
    const durField = _durSelectHtml();
    const ff     = resConfig.forfeit > 0
      ? `<p class="rv-form__forfeit" id="rvForfeitP">Unclaimed reservations may be given away <strong>${resConfig.forfeit} min</strong> after the booked time.</p>`
      : '';

    sheet.innerHTML = `
      <div class="rv-sheet__handle" aria-hidden="true"></div>
      <div class="rv-sheet__head">
        <span class="rv-sheet__title">Book ${label ? 'Table ' + _esc(label) : 'a table'}</span>
        <button class="rv-sheet__close" id="rvClose" type="button" aria-label="Close">×</button>
      </div>
      <form class="rv-form" id="rvForm" novalidate>
        <div class="rv-form__group">
          <label class="rv-form__label" for="rvName">Your name *</label>
          <input class="rv-form__input" id="rvName" type="text" required placeholder="Full name" autocomplete="name"/>
        </div>
        <div class="rv-form__row">
          <div class="rv-form__group">
            <label class="rv-form__label" for="rvContact">Phone / email</label>
            <input class="rv-form__input" id="rvContact" type="text" placeholder="+359…" autocomplete="tel"/>
          </div>
          <div class="rv-form__group">
            <label class="rv-form__label" for="rvParty">Guests *</label>
            <input class="rv-form__input" id="rvParty" type="number" min="1" max="${cap}" value="2" required/>
          </div>
        </div>
        <div class="rv-form__row">
          <div class="rv-form__group">
            <label class="rv-form__label" for="rvDate">Date *</label>
            <input class="rv-form__input" id="rvDate" type="date" required value="${$dateInput.value}"/>
          </div>
          <div class="rv-form__group">
            <label class="rv-form__label" for="rvTime">Time *</label>
            <input class="rv-form__input" id="rvTime" type="time" required value="${$timeInput.value}"/>
          </div>
        </div>
        ${durField}
        <div class="rv-form__group">
          <label class="rv-form__label" for="rvNotes">Notes (optional)</label>
          <input class="rv-form__input" id="rvNotes" type="text" placeholder="Dietary needs, occasion…"/>
        </div>
        ${ff}
        <p class="rv-form__error" id="rvErr" style="display:none"></p>
        <button class="rv-form__submit" id="rvSubmit" type="submit">Confirm reservation</button>
      </form>`;

    document.body.appendChild(overlay);
    document.body.appendChild(sheet);

    _attachSheetSwipe(sheet, _closeSheet);

    sheet.querySelector('#rvClose').addEventListener('click', e => { e.stopPropagation(); _closeSheet(); });
    sheet.addEventListener('click', e => e.stopPropagation());

    const durEl = sheet.querySelector('#rvDur');
    if (durEl && durEl.tagName === 'SELECT') {
      durEl.addEventListener('change', () => { selectDurMin = parseInt(durEl.value, 10) || 120; });
    }

    sheet.querySelector('#rvForm').addEventListener('submit', e => {
      e.preventDefault();
      _submitReservation(sheet, data);
    });

    setTimeout(() => sheet.querySelector('#rvName')?.focus(), 80);
  }

  function _closeSheet(andRender = true) {
    sheetOpen  = false;
    selectedId = null;
    document.querySelectorAll('.rv-sheet-overlay, .rv-sheet').forEach(el => el.remove());
    if (andRender !== false) _renderFloor();
  }

  function _readDuration(sheet) {
    const d = sheet.querySelector('#rvDur');
    if (d) {
      if (d.tagName === 'SELECT') {
        return parseInt(d.value, 10) || (resConfig.allowed[0] || 120);
      }
      return parseInt(d.value, 10) || (resConfig.allowed[0] || 120);
    }
    return selectDurMin;
  }

  async function _submitReservation(sheet, data) {
    const nameEl = sheet.querySelector('#rvName');
    const partyEl= sheet.querySelector('#rvParty');
    const dateEl = sheet.querySelector('#rvDate');
    const timeEl = sheet.querySelector('#rvTime');
    const errEl  = sheet.querySelector('#rvErr');
    const btn    = sheet.querySelector('#rvSubmit');

    const name  = nameEl.value.trim();
    const party = parseInt(partyEl.value, 10);
    const date  = dateEl.value;
    const dur   = _readDuration(sheet);
    errEl.style.display = 'none';

    if (!name)  { _fieldErr(errEl, nameEl,  'Please enter your name.');    return; }
    if (!party) { _fieldErr(errEl, partyEl, 'Please enter number of guests.'); return; }
    if (!date)  { _fieldErr(errEl, dateEl,  'Please select a date.');       return; }
    if (!timeEl.value) { _fieldErr(errEl, timeEl, 'Please pick a time.'); return; }

    btn.disabled = true; btn.textContent = 'Reserving…';

    const timeValue = timeEl.value.length === 5 ? (timeEl.value + ':00') : timeEl.value;

    try {
      const res = await fetch(`${BASE}/api/public/reservations/${encodeURIComponent(rid)}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tableId:         data.id,
          guestName:       name,
          guestContact:    sheet.querySelector('#rvContact').value.trim() || null,
          partySize:       party,
          reservedDate:    date,
          reservedTime:    timeValue,
          durationMinutes: dur,
          notes:           sheet.querySelector('#rvNotes').value.trim() || null,
        }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.message || `HTTP ${res.status}`); }
      $dateInput.value = date;
      $timeInput.value = timeEl.value.length >= 5 ? timeEl.value.slice(0, 5) : timeEl.value;
      selectDurMin = dur;
      _showSuccess(sheet, name, data, date, timeEl.value, dur);
    } catch (e) {
      btn.disabled = false; btn.textContent = 'Confirm reservation';
      errEl.textContent = e.message || 'Failed. Please try again.';
      errEl.style.display = '';
    }
  }

  function _fieldErr(errEl, input, msg) {
    errEl.textContent = msg; errEl.style.display = '';
    input.focus(); input.style.borderColor = '#dc2626';
    input.addEventListener('input', () => { input.style.borderColor = ''; }, { once: true });
  }

  function _showSuccess(sheet, name, data, date, time, dur) {
    const label   = data.label || data.id;
    const dateStr = new Date(date + 'T12:00').toLocaleDateString('en-GB',
      { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const timeDisp = time && time.length >= 5 ? time.slice(0, 5) : time;
    const durText = (typeof dur === 'number' && dur > 0)
      ? (dur >= 60 && dur % 60 === 0 ? ` (${dur / 60} h)` : ` (${dur} min)`)
      : '';
    sheet.querySelector('.rv-form')?.remove();
    sheet.querySelector('.rv-sheet__head')?.remove();
    const div = document.createElement('div');
    div.className = 'rv-success';
    div.innerHTML = `
      <div class="rv-success__icon">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2.5"
             stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      </div>
      <h2 class="rv-success__title">You're booked!</h2>
      <p class="rv-success__body">
        <strong>${_esc(name)}</strong>, your reservation for Table <strong>${_esc(String(label))}</strong>
        on <strong>${_esc(dateStr)}</strong>${timeDisp ? ' at <strong>' + _esc(timeDisp) + '</strong>' : ''}${_esc(durText)} is confirmed.
        <br/><br/>The restaurant will be in touch if needed.
      </p>
      <button class="rv-success__done" type="button" id="rvDone">Done</button>`;
    sheet.appendChild(div);
    sheet.querySelector('#rvDone').addEventListener('click', () => {
      _closeSheet(); _fetchDayBlocks().then(() => { _reloadOccupied(); });
    });
  }

  function _showLoading() {
    $body.innerHTML = `<div class="rv-loading">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
        <circle cx="12" cy="12" r="10" stroke-opacity=".25"/>
        <path d="M12 2a10 10 0 0 1 10 10">
          <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur=".8s" repeatCount="indefinite"/>
        </path>
      </svg><span>Loading floor plan…</span></div>`;
  }

  function _showError(msg) {
    $body.innerHTML = `<div class="rv-error">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg><span>${_esc(msg)}</span></div>`;
  }

  function _roundSlot(d) {
    const m = Math.ceil((d.getHours() * 60 + d.getMinutes()) / 30) * 30;
    const h = Math.floor(m / 60) % 24, mn = m % 60;
    return String(h).padStart(2, '0') + ':' + String(mn).padStart(2, '0');
  }

  function _esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  let _resizeTimer = null;
  window.addEventListener('resize', () => {
    if (sheetOpen || !layout) return;
    clearTimeout(_resizeTimer);
    _resizeTimer = setTimeout(() => { _renderFloor(); }, 180);
  });
})();
