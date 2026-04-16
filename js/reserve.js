/**
 * reserve.js — public guest reservation page
 *
 * URL: /reserve/?r={restaurantId}
 *   or /reserve/?r={restaurantId}&date=YYYY-MM-DD&time=HH:MM
 *
 * Loads the layout from /api/public/layout/{id},
 * occupied table IDs from /api/public/reservations/{id}/occupied?date=…,
 * then renders an interactive floor plan.
 * Tapping a free table opens a booking bottom-sheet form.
 */
(function () {
  'use strict';

  const DEFAULT_API_BASE = 'http://127.0.0.1:8080';

  function getApiBase() {
    if (window.__MENU_API_BASE__) return window.__MENU_API_BASE__.replace(/\/$/, '');
    const meta = document.querySelector('meta[name="menu-api-base"]');
    if (meta) { const c = meta.getAttribute('content'); if (c) return c.replace(/\/$/, ''); }
    const h = location.hostname;
    return (h === 'localhost' || h === '127.0.0.1') ? DEFAULT_API_BASE : '';
  }

  /* ---- URL params ---- */
  const params  = new URLSearchParams(location.search);
  const rid     = params.get('r') || '';
  const BASE    = getApiBase();

  /* ---- DOM ---- */
  const elBack       = document.getElementById('rvBack');
  const elName       = document.getElementById('rvRestaurantName');
  const elSub        = document.getElementById('rvRestaurantSub');
  const elBody       = document.getElementById('rvBody');
  const elDateInput  = document.getElementById('rvDateInput');
  const elTimeInput  = document.getElementById('rvTimeInput');

  /* ---- State ---- */
  let layout     = null;   // parsed layout config
  let occupied   = [];     // array of occupied table IDs for selected date
  let selectedId = null;   // currently selected table id
  let sheetOpen  = false;

  /* ---- Init ---- */
  if (!rid || !BASE) {
    showError(!rid ? 'No restaurant specified (add ?r=restaurant-id to URL).' : 'API base not configured.');
    return;
  }

  // Setup back link
  elBack.href = '../' + encodeURIComponent(rid) + '/';

  // Date/time defaults
  const today = new Date();
  elDateInput.value = params.get('date') || today.toISOString().slice(0, 10);
  elDateInput.min   = today.toISOString().slice(0, 10);
  elTimeInput.value = params.get('time') || roundToSlot(today);

  elDateInput.addEventListener('change', reloadOccupied);
  elTimeInput.addEventListener('change', reloadOccupied);

  load();

  /* ------------------------------------------------------------------ */
  /* Load layout + occupied                                               */
  /* ------------------------------------------------------------------ */
  async function load() {
    showLoading();
    try {
      // Load layout
      const layoutRes = await fetch(`${BASE}/api/public/layout/${encodeURIComponent(rid)}`);
      if (layoutRes.status === 204 || layoutRes.status === 404) {
        layout = null;
      } else if (layoutRes.ok) {
        const data = await layoutRes.json();
        layout = JSON.parse(data.configJson);
        // Try to get restaurant name from menu API
        fetchRestaurantName();
      } else {
        throw new Error(`Layout API: HTTP ${layoutRes.status}`);
      }
      await reloadOccupied(false);
    } catch (err) {
      showError(err.message);
    }
  }

  async function fetchRestaurantName() {
    try {
      const res = await fetch(`${BASE}/api/public/menu/${encodeURIComponent(rid)}`);
      if (!res.ok) return;
      const data = await res.json();
      const r = data?.record?.restaurant;
      if (r) {
        elName.textContent = r.name?.en || r.name?.bg || rid;
        elSub.textContent  = 'Reserve a table';
        document.title = `Reserve — ${elName.textContent}`;
      }
    } catch (_) {}
  }

  async function reloadOccupied(shouldRender = true) {
    const date = elDateInput.value;
    if (!date) return;
    try {
      const res = await fetch(
        `${BASE}/api/public/reservations/${encodeURIComponent(rid)}/occupied?date=${date}`
      );
      if (res.ok) {
        const data = await res.json();
        occupied = data.occupiedTableIds || [];
      } else {
        occupied = [];
      }
    } catch (_) {
      occupied = [];
    }
    if (shouldRender !== false) renderFloorPlan();
  }

  /* ------------------------------------------------------------------ */
  /* Render                                                               */
  /* ------------------------------------------------------------------ */
  function renderFloorPlan() {
    if (!layout) {
      renderNoLayout();
      return;
    }
    elBody.innerHTML = '';
    const legend = buildLegend();
    elBody.appendChild(legend);

    switch (layout.mode) {
      case 'simple':  renderSimple(); break;
      case 'tables':  renderTables(); break;
      case 'grid':    renderGrid();   break;
      default:        renderNoLayout();
    }
  }

  function buildLegend() {
    const d = document.createElement('div');
    d.className = 'rv-legend';
    d.innerHTML = `
      <div class="rv-legend__item"><div class="rv-legend__dot rv-legend__dot--free"></div>Available</div>
      <div class="rv-legend__item"><div class="rv-legend__dot rv-legend__dot--taken"></div>Reserved</div>
      <div class="rv-legend__item"><div class="rv-legend__dot rv-legend__dot--sel"></div>Selected</div>`;
    return d;
  }

  function renderNoLayout() {
    elBody.innerHTML = `<div class="rv-loading" style="padding:48px 20px;color:var(--color-text-muted)">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2">
        <rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/>
        <rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>
      </svg>
      <span>Floor plan not configured yet. Please contact the restaurant directly.</span>
    </div>`;
  }

  /* ---- SIMPLE mode: auto-generate N numbered tables ---- */
  function renderSimple() {
    const count = layout.tableCount || 5;
    const tables = [];
    for (let i = 1; i <= count; i++) {
      tables.push({ id: `t${i}`, label: `T${i}`, capacity: 2, shape: 'square' });
    }
    renderTableCards(tables);
  }

  /* ---- TABLES mode ---- */
  function renderTables() {
    renderTableCards(layout.tables || []);
  }

  function renderTableCards(tables) {
    const wrap = document.createElement('div');
    wrap.className = 'rv-table-list';
    tables.forEach(t => {
      const isTaken = occupied.includes(t.id);
      const isSel   = t.id === selectedId;
      const card = document.createElement('div');
      card.className = 'rv-tcard ' + (isSel ? 'is-selected' : isTaken ? 'is-taken' : 'is-free');
      card.dataset.id = t.id;
      card.innerHTML = `
        <span class="rv-tcard__label">${esc(t.label || t.id)}</span>
        <span class="rv-tcard__cap">${t.capacity || 2} pers.</span>`;
      if (!isTaken) {
        card.addEventListener('click', () => selectTable(t.id, t));
      }
      wrap.appendChild(card);
    });
    elBody.appendChild(wrap);
  }

  /* ---- GRID mode ---- */
  function renderGrid() {
    const cols  = layout.gridCols || 10;
    const rows  = layout.gridRows || 7;
    const cells = layout.cells || [];
    const byPos = {};
    cells.forEach(c => { byPos[`${c.col}_${c.row}`] = c; });

    // Responsive cell size
    const availW  = Math.min(window.innerWidth - 56, 640);
    const cellSz  = Math.max(40, Math.min(56, Math.floor((availW - cols * 4) / cols)));

    const outer = document.createElement('div');
    outer.className = 'rv-canvas-outer';
    const canvas = document.createElement('div');
    canvas.className = 'rv-canvas';
    canvas.style.gridTemplateColumns = `repeat(${cols}, ${cellSz}px)`;
    canvas.style.gridTemplateRows    = `repeat(${rows}, ${cellSz}px)`;
    canvas.style.setProperty('--rv-cell-size', cellSz + 'px');

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cell = byPos[`${c}_${r}`];
        const el = document.createElement('div');
        if (!cell || !cell.active) {
          el.className = 'rv-cell is-inactive';
        } else {
          const isTaken = occupied.includes(cell.id);
          const isSel   = cell.id === selectedId;
          el.className = 'rv-cell ' + (isSel ? 'is-selected' : isTaken ? 'is-taken' : 'is-free');
          el.dataset.id = cell.id;
          if (cell.shape) el.appendChild(buildShapeSvg(cell.shape, cellSz, isSel));
          const lbl = document.createElement('span');
          lbl.className = 'rv-cell__label';
          lbl.textContent = cell.label || '';
          el.appendChild(lbl);
          if (cell.capacity) {
            const cap = document.createElement('span');
            cap.className = 'rv-cell__cap';
            cap.textContent = cell.capacity;
            el.appendChild(cap);
          }
          if (!isTaken) {
            el.addEventListener('click', () => selectTable(cell.id, cell));
          }
        }
        canvas.appendChild(el);
      }
    }
    outer.appendChild(canvas);
    elBody.appendChild(outer);
  }

  /* ---- Build shape SVG ---- */
  function buildShapeSvg(shape, size, selected) {
    const color   = selected ? 'rgba(255,255,255,0.25)' : 'var(--color-accent)';
    const opacity = selected ? '1' : '0.3';
    const cr = 8;
    const s  = size - 8;
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
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'rv-cell__shape');
    svg.setAttribute('width', s);
    svg.setAttribute('height', s);
    svg.setAttribute('viewBox', `0 0 ${s} ${s}`);
    svg.setAttribute('aria-hidden', 'true');
    svg.innerHTML = inner;
    return svg;
  }

  /* ------------------------------------------------------------------ */
  /* Table selection                                                      */
  /* ------------------------------------------------------------------ */
  function selectTable(id, tableData) {
    if (occupied.includes(id)) return;
    selectedId = id;
    renderFloorPlan();
    openSheet(tableData);
  }

  /* ------------------------------------------------------------------ */
  /* Bottom-sheet booking form                                            */
  /* ------------------------------------------------------------------ */
  function openSheet(tableData) {
    if (sheetOpen) closeSheet();
    sheetOpen = true;

    const overlay = document.createElement('div');
    overlay.className = 'rv-sheet-overlay';
    overlay.addEventListener('click', closeSheet);

    const sheet = document.createElement('div');
    sheet.className = 'rv-sheet';
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-modal', 'true');
    sheet.setAttribute('aria-labelledby', 'rvSheetTitle');

    const cap   = tableData.capacity || 2;
    const label = tableData.label || tableData.id || '';

    sheet.innerHTML = `
      <div class="rv-sheet__handle"></div>
      <div class="rv-sheet__head">
        <span class="rv-sheet__title" id="rvSheetTitle">Book ${label ? 'Table ' + esc(label) : 'a table'}</span>
        <button class="rv-sheet__close" id="rvSheetClose" aria-label="Close">×</button>
      </div>
      <form class="rv-form" id="rvForm" novalidate>
        <div class="rv-form__group">
          <label class="rv-form__label" for="rvGuestName">Your name *</label>
          <input class="rv-form__input" id="rvGuestName" type="text" required placeholder="Full name" autocomplete="name" />
        </div>
        <div class="rv-form__row">
          <div class="rv-form__group">
            <label class="rv-form__label" for="rvContact">Phone / email</label>
            <input class="rv-form__input" id="rvContact" type="text" placeholder="+359…" autocomplete="tel" />
          </div>
          <div class="rv-form__group">
            <label class="rv-form__label" for="rvParty">Guests *</label>
            <input class="rv-form__input" id="rvParty" type="number" min="1" max="${cap}" value="2" required />
          </div>
        </div>
        <div class="rv-form__row">
          <div class="rv-form__group">
            <label class="rv-form__label" for="rvFormDate">Date *</label>
            <input class="rv-form__input" id="rvFormDate" type="date" required value="${elDateInput.value}" />
          </div>
          <div class="rv-form__group">
            <label class="rv-form__label" for="rvFormTime">Time</label>
            <input class="rv-form__input" id="rvFormTime" type="time" value="${elTimeInput.value}" />
          </div>
        </div>
        <div class="rv-form__group">
          <label class="rv-form__label" for="rvNotes">Notes (optional)</label>
          <input class="rv-form__input" id="rvNotes" type="text" placeholder="Dietary requirements, occasion…" />
        </div>
        <p class="rv-form__error" id="rvFormError" style="display:none"></p>
        <button class="rv-form__submit" id="rvFormSubmit" type="submit">Confirm reservation</button>
      </form>`;

    document.body.appendChild(overlay);
    document.body.appendChild(sheet);

    sheet.querySelector('#rvSheetClose').addEventListener('click', closeSheet);
    sheet.querySelector('#rvForm').addEventListener('submit', e => {
      e.preventDefault();
      submitReservation(sheet, tableData);
    });

    // Trap focus on first input
    setTimeout(() => sheet.querySelector('#rvGuestName')?.focus(), 80);
  }

  function closeSheet() {
    sheetOpen = false;
    selectedId = null;
    document.querySelectorAll('.rv-sheet-overlay, .rv-sheet').forEach(el => el.remove());
    renderFloorPlan();
  }

  async function submitReservation(sheet, tableData) {
    const nameEl    = sheet.querySelector('#rvGuestName');
    const contactEl = sheet.querySelector('#rvContact');
    const partyEl   = sheet.querySelector('#rvParty');
    const dateEl    = sheet.querySelector('#rvFormDate');
    const timeEl    = sheet.querySelector('#rvFormTime');
    const notesEl   = sheet.querySelector('#rvNotes');
    const errorEl   = sheet.querySelector('#rvFormError');
    const submitBtn = sheet.querySelector('#rvFormSubmit');

    const name  = nameEl.value.trim();
    const party = parseInt(partyEl.value, 10);
    const date  = dateEl.value;

    errorEl.style.display = 'none';
    if (!name)                  { showFormError(errorEl, nameEl, 'Please enter your name.'); return; }
    if (!party || party < 1)    { showFormError(errorEl, partyEl, 'Please enter number of guests.'); return; }
    if (!date)                  { showFormError(errorEl, dateEl, 'Please select a date.'); return; }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Reserving…';

    try {
      const body = {
        tableId:         tableData.id,
        guestName:       name,
        guestContact:    contactEl.value.trim() || null,
        partySize:       party,
        reservedDate:    date,
        reservedTime:    timeEl.value || null,
        durationMinutes: 90,
        notes:           notesEl.value.trim() || null,
      };
      const res = await fetch(
        `${BASE}/api/public/reservations/${encodeURIComponent(rid)}`,
        {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify(body),
        }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `HTTP ${res.status}`);
      }
      showSuccess(sheet, name, tableData, date, timeEl.value);
    } catch (err) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Confirm reservation';
      errorEl.textContent  = err.message || 'Reservation failed. Please try again.';
      errorEl.style.display = '';
    }
  }

  function showFormError(errorEl, inputEl, msg) {
    errorEl.textContent  = msg;
    errorEl.style.display = '';
    inputEl.focus();
    inputEl.style.borderColor = '#dc2626';
    inputEl.addEventListener('input', () => { inputEl.style.borderColor = ''; }, { once: true });
  }

  function showSuccess(sheet, name, tableData, date, time) {
    const label = tableData.label || tableData.id;
    const dateStr = new Date(date + 'T12:00').toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    sheet.querySelector('.rv-form').remove();
    sheet.querySelector('.rv-sheet__head').remove();

    const div = document.createElement('div');
    div.className = 'rv-success';
    div.innerHTML = `
      <div class="rv-success__icon">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>
      </div>
      <h2 class="rv-success__title">You're booked!</h2>
      <p class="rv-success__body">
        <strong>${esc(name)}</strong>, your reservation for Table <strong>${esc(String(label))}</strong>
        on <strong>${esc(dateStr)}</strong>${time ? ' at <strong>' + esc(time) + '</strong>' : ''} is confirmed.
        <br/><br/>The restaurant will be in touch if needed.
      </p>
      <button class="rv-success__done" id="rvDoneBtn">Done</button>`;
    sheet.appendChild(div);

    sheet.querySelector('#rvDoneBtn').addEventListener('click', () => {
      closeSheet();
      reloadOccupied();
    });
  }

  /* ------------------------------------------------------------------ */
  /* Helpers                                                              */
  /* ------------------------------------------------------------------ */
  function showLoading() {
    elBody.innerHTML = `<div class="rv-loading">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true">
        <circle cx="12" cy="12" r="10" stroke-opacity=".3"/>
        <path d="M12 2a10 10 0 0 1 10 10"><animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur=".8s" repeatCount="indefinite"/></path>
      </svg>
      <span>Loading floor plan…</span>
    </div>`;
  }

  function showError(msg) {
    elBody.innerHTML = `<div class="rv-error">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
        <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
      <span>${esc(msg)}</span>
    </div>`;
  }

  function roundToSlot(d) {
    const mins = Math.ceil((d.getHours() * 60 + d.getMinutes()) / 30) * 30;
    const h = Math.floor(mins / 60) % 24;
    const m = mins % 60;
    return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
  }

  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
})();
