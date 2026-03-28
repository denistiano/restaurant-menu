/**
 * admin/qr-flyers.js — QR media: styles (STARTERS) × paper sizes (FORMATS) independently,
 * light page builder, localStorage customs. (global QRious from CDN)
 */
(function (window) {
  'use strict';

  const SERVICE = {
    brand:  'e-Menu',
    phone:  '+359 898 513 566',
    email:  'denistiano@gmail.com',
    lineBg: 'Дигитално меню, QR код и админ панел за вашия ресторант.',
    lineEn: 'Digital menu, QR codes & admin for your restaurant.'
  };

  const STORAGE_KEY = 'qr_media_designs_v2';

  /** ISO & common print sizes (mm). `shortLabel` = compact chip text. */
  const FORMATS = {
    a4:   { id: 'a4',   label: 'A4 portrait',     shortLabel: 'A4',   w: 210,   h: 297,   qr: 46,  pad: 12, scale: 1,    page: '210mm 297mm' },
    a5:   { id: 'a5',   label: 'A5 portrait',     shortLabel: 'A5',   w: 148,   h: 210,   qr: 36,  pad: 10, scale: 0.82, page: '148mm 210mm' },
    a6:   { id: 'a6',   label: 'A6 portrait',     shortLabel: 'A6',   w: 105,   h: 148,   qr: 28,  pad: 7,  scale: 0.68, page: '105mm 148mm' },
    dl:   { id: 'dl',   label: 'DL / flyer',      shortLabel: 'DL',   w: 110,   h: 220,   qr: 38,  pad: 9,  scale: 0.72, page: '110mm 220mm' },
    card: { id: 'card', label: 'ISO card 85×54', shortLabel: 'Card', w: 85.6,  h: 53.98, qr: 22,  pad: 3,  scale: 0.42, page: '85.6mm 53.98mm' }
  };

  const STARTERS = [
    { id: 'classic', label: 'Classic', labelBg: 'Класика', build: buildClassic },
    { id: 'fine',    label: 'Fine dining', labelBg: 'Фино', build: buildFine },
    { id: 'family',  label: 'Family / café', labelBg: 'Семейно', build: buildFamily },
    { id: 'terrace', label: 'Terrace', labelBg: 'Тераса', build: buildTerrace },
    { id: 'bistro',  label: 'Bistro', labelBg: 'Бистро', build: buildBistro },
    { id: 'luxury',  label: 'Luxury scan', labelBg: 'Лукс скан', build: buildLuxuryScan },
    { id: 'noir',    label: 'Noir split', labelBg: 'Ноар', build: buildNoirSplit },
    { id: 'weave',   label: 'Soft weave', labelBg: 'Плетка', build: buildWeave },
    { id: 'sunset',  label: 'Sunset', labelBg: 'Залез', build: buildSunset },
    { id: 'lineart', label: 'Line frame', labelBg: 'Рамка', build: buildLineArt },
    { id: 'metro',   label: 'Metro grid', labelBg: 'Метро', build: buildMetro }
  ];

  const FONT_OPTIONS = [
    { v: '', l: '— template default —' },
    { v: "'Great Vibes',cursive", l: 'Great Vibes' },
    { v: "'Playfair Display',Georgia,serif", l: 'Playfair Display' },
    { v: "'Cormorant Garamond',Georgia,serif", l: 'Cormorant Garamond' },
    { v: "'Nunito',sans-serif", l: 'Nunito' },
    { v: "'Inter',system-ui,sans-serif", l: 'Inter' },
    { v: 'Georgia,serif', l: 'Georgia' }
  ];

  const ZONES = [
    { id: 'sheet',    label: 'Page background' },
    { id: 'title',    label: 'Title (restaurant name)' },
    { id: 'subtitle', label: 'Subtitle / tagline' },
    { id: 'cta',      label: 'Scan / call-to-action lines' },
    { id: 'body',     label: 'Hint paragraph' },
    { id: 'footer',   label: 'Footer (contact block)' }
  ];

  function esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function track(name, params) {
    if (typeof window.trackEvent === 'function') window.trackEvent(name, params || {});
  }

  let getRestaurant = null;
  let getMenuUrlFn  = null;
  /** Set from AdminQrFlyers.init — Cloudinary upload like logo/cover (admin.js). */
  let uploadSheetBackgroundFn = null;
  let editMode      = false;

  let designState = {
    starterId: 'classic',
    formatId:  'a4',
    styles:    {},
    text:      { title: '', subtitle: '' }
  };

  function getFmt() {
    return FORMATS[designState.formatId] || FORMATS.a4;
  }

  function deepClone(o) {
    return JSON.parse(JSON.stringify(o || {}));
  }

  /** Gold accent for modern templates (≈ reference flyer) */
  const GOLD = '#c59d2a';

  function defaultZoneStyle(zone) {
    const z = {};
    if (zone === 'sheet') {
      return { background: '', backgroundImage: '', backgroundOverlay: null, paddingMm: null };
    }
    return {
      fontFamily: '',
      fontSize:   null,
      color:      '',
      textAlign:  '',
      fontWeight: ''
    };
  }

  function getEffectiveStyles() {
    const out = {};
    ZONES.forEach(z => {
      const def = defaultZoneStyle(z.id);
      const raw = designState.styles[z.id] || {};
      out[z.id] = { ...def };
      Object.keys(raw).forEach(k => {
        const v = raw[k];
        if (v !== '' && v != null) out[z.id][k] = v;
      });
    });
    return out;
  }

  /** Flex column shell: fixed height page, main grows, footer pinned bottom */
  function sheetShellOpen(fmt, es, extraSheetStyle) {
    const sh = es.sheet || {};
    const bg = sh.background || extraSheetStyle.bg || '#f4f2eb';
    const pad = sh.paddingMm != null ? sh.paddingMm : fmt.pad;
    return `
      <div class="qr-sheet" data-fmt="${esc(fmt.id)}"
           style="width:${fmt.w}mm;height:${fmt.h}mm;min-height:${fmt.h}mm;max-height:${fmt.h}mm;
                  box-sizing:border-box;padding:${pad}mm;margin:0;
                  display:flex;flex-direction:column;align-items:stretch;
                  font-family:'Inter',system-ui,sans-serif;color:#3d3d3d;position:relative;
                  ${extraSheetStyle.extra || ''} background:${bg};">`;
  }

  function sheetMainOpen() {
    return '<div class="qr-sheet__main" style="flex:1 1 auto;min-height:0;display:flex;flex-direction:column;align-items:stretch;">';
  }

  function sheetMainClose() {
    return '</div>';
  }

  function sheetShellClose() {
    return '</div>';
  }

  function qrImgTag(qrDataUrl, fmt) {
    return `<img class="qr-sheet__qr" src="${esc(qrDataUrl)}" alt="" style="width:${fmt.qr}mm;height:${fmt.qr}mm;display:block;margin:0 auto;object-fit:contain;image-rendering:pixelated;"/>`;
  }

  function sPx(basePx, fmt) {
    return Math.max(8, Math.round(basePx * fmt.scale));
  }

  function forkKnifeRow(fmt) {
    if (fmt.id === 'card') return '';
    const s = fmt.scale;
    return `
      <div style="display:flex;justify-content:space-between;align-items:flex-end;padding:0 ${4 * s}mm ${3 * s}mm;opacity:.45;">
        <svg width="${18 * s}" height="${44 * s}" viewBox="0 0 22 52" fill="none" aria-hidden="true">
          <path d="M6 2v14M10 2v14M6 16v34" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
        </svg>
        <svg width="${18 * s}" height="${44 * s}" viewBox="0 0 22 52" fill="none" aria-hidden="true">
          <path d="M11 2v50M8 8h6M8 14h6M8 20h6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
        </svg>
      </div>`;
  }

  function buildClassic(d, fmt, es) {
    const sc = fmt.scale;
    if (fmt.id === 'card') {
      const extra = { bg: '#f4f2eb', extra: 'background-image:radial-gradient(rgba(0,0,0,.02) 1px,transparent 1px);background-size:3px 3px;' };
      return sheetShellOpen(fmt, es, extra) +
        sheetMainOpen() +
        `<div style="flex:1;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;gap:1.5mm;">
          <h1 data-qr="title" style="font-family:'Great Vibes',cursive;font-size:${sPx(28, fmt)}px;font-weight:400;margin:0;line-height:1.1;color:#5c5c5c;">${esc(d.nameLine)}</h1>
          <div style="border:1.5px dashed #b8b4a8;border-radius:6px;padding:2mm;background:rgba(255,255,255,.4);">${qrImgTag(d.qrDataUrl, fmt)}</div>
        </div>` +
        classicFooter(d, fmt, es) +
        sheetMainClose() + sheetShellClose();
    }

    const extra = {
      bg: '#f4f2eb',
      extra: 'background-image:radial-gradient(rgba(0,0,0,.025) 1px,transparent 1px);background-size:4px 4px;'
    };
    return sheetShellOpen(fmt, es, extra) +
      sheetMainOpen() +
      forkKnifeRow(fmt) +
      `<h1 data-qr="title" style="font-family:'Great Vibes',cursive;font-size:${sPx(42, fmt)}px;font-weight:400;text-align:center;color:#5c5c5c;margin:0 0 ${2 * sc}mm;line-height:1.1;">${esc(d.nameLine)}</h1>
      <svg viewBox="0 0 400 24" style="width:72%;height:${12 * sc}px;margin:0 auto ${4 * sc}mm;display:block;opacity:.35" preserveAspectRatio="none">
        <path d="M0 18 Q 200 4 400 18" fill="none" stroke="currentColor" stroke-width="1.2"/>
      </svg>
      <p data-qr="cta" style="text-align:center;font-size:${sPx(11, fmt)}px;letter-spacing:.28em;text-transform:uppercase;color:#6a6a6a;margin:0 0 1mm;font-weight:600;">Сканирайте за менюто</p>
      <p data-qr="cta" style="text-align:center;font-size:${sPx(10, fmt)}px;letter-spacing:.22em;text-transform:uppercase;color:#888;margin:0 0 ${6 * sc}mm;">Scan for the menu</p>
      <div style="border:2px dashed #b8b4a8;border-radius:10px;padding:${5 * sc}mm;max-width:${fmt.id === 'a6' ? 48 : 62}mm;margin:0 auto ${4 * sc}mm;text-align:center;background:rgba(255,255,255,.35);">
        ${qrImgTag(d.qrDataUrl, fmt)}
      </div>
      <p data-qr="body" style="text-align:center;font-size:${sPx(12, fmt)}px;color:#666;line-height:1.5;margin:0 ${2 * sc}mm ${6 * sc}mm;max-width:100%;">${esc(d.hintLine)}</p>` +
      classicFooter(d, fmt, es) +
      sheetMainClose() + sheetShellClose();
  }

  function classicFooter(d, fmt, es) {
    const sc = fmt.scale;
    return `
      <footer data-qr="footer" class="qr-sheet__footer" style="flex-shrink:0;margin-top:auto;width:100%;box-sizing:border-box;border-top:1px solid #c9c5bb;padding-top:${3 * sc}mm;padding-bottom:0;">
        <p data-qr="subtitle" style="text-align:center;font-size:${sPx(10, fmt)}px;color:#888;margin:0 0 1mm;">${esc(d.descLine)}</p>
        <p style="text-align:center;font-size:${sPx(9, fmt)}px;color:#999;margin:0 0 2mm;">Powered by <strong>${esc(SERVICE.brand)}</strong> · ${esc(SERVICE.lineBg)}</p>
        <p style="text-align:center;font-size:${sPx(11, fmt)}px;font-weight:600;color:#444;margin:0;">${esc(SERVICE.phone)} · ${esc(SERVICE.email)}</p>
      </footer>`;
  }

  function buildFine(d, fmt, es) {
    const sc = fmt.scale;
    return sheetShellOpen(fmt, es, { bg: 'linear-gradient(180deg,#faf9f7 0%,#f0ebe3 100%)', extra: 'border:1px solid #d9d3c8;' }) +
      sheetMainOpen() +
      `<div style="text-align:center;padding:${3 * sc}mm 0 1mm;">
        <svg width="${32 * sc}" height="${32 * sc}" viewBox="0 0 24 24" fill="none" style="opacity:.4;margin-bottom:2mm" aria-hidden="true">
          <path d="M8 22h8M12 15v7M9 2h6l-1 8h-4L9 2z" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <h1 data-qr="title" style="font-family:'Cormorant Garamond',Georgia,serif;font-size:${sPx(38, fmt)}px;font-weight:600;color:#2c2c2c;margin:0;letter-spacing:.02em;">${esc(d.nameLine)}</h1>
        <p data-qr="subtitle" style="font-family:'Cormorant Garamond',Georgia,serif;font-size:${sPx(15, fmt)}px;font-style:italic;color:#666;margin:${2 * sc}mm 0 0;">${esc(d.tagline)}</p>
      </div>
      <div style="width:${40 * sc}mm;height:1px;background:linear-gradient(90deg,transparent,#8a7a68,transparent);margin:${4 * sc}mm auto;"></div>
      <p data-qr="cta" style="text-align:center;font-size:${sPx(10, fmt)}px;letter-spacing:.25em;text-transform:uppercase;color:#7a6f62;margin:0 0 ${6 * sc}mm;">Digital menu</p>
      <div style="text-align:center;padding:${4 * sc}mm;border:1px solid #c4b8a8;border-radius:2px;max-width:${fmt.w - 2 * fmt.pad - 10}mm;margin:0 auto ${6 * sc}mm;background:#fff;">
        ${qrImgTag(d.qrDataUrl, fmt)}
      </div>
      <p data-qr="body" style="text-align:center;font-size:${sPx(12, fmt)}px;color:#555;max-width:100%;margin:0 auto ${8 * sc}mm;line-height:1.55;">${esc(d.hintLine)}</p>` +
      `<footer data-qr="footer" class="qr-sheet__footer" style="flex-shrink:0;margin-top:auto;width:100%;box-sizing:border-box;border-top:1px solid #d9d3c8;padding-top:${4 * sc}mm;">
        <p style="text-align:center;font-size:${sPx(10, fmt)}px;color:#888;margin:0 0 2mm;">${esc(SERVICE.lineEn)}</p>
        <p style="text-align:center;font-family:'Cormorant Garamond',serif;font-size:${sPx(14, fmt)}px;font-weight:600;color:#3a342c;">${esc(SERVICE.brand)} · ${esc(SERVICE.phone)}</p>
        <p style="text-align:center;font-size:${sPx(11, fmt)}px;color:#666;margin:${1 * sc}mm 0 0;">${esc(SERVICE.email)}</p>
      </footer>` +
      sheetMainClose() + sheetShellClose();
  }

  function buildFamily(d, fmt, es) {
    const sc = fmt.scale;
    return sheetShellOpen(fmt, es, { bg: '#fffaf3', extra: '' }) +
      sheetMainOpen() +
      (fmt.id === 'card' ? '' : `<div style="display:flex;justify-content:center;gap:${10 * sc}px;padding:${4 * sc}mm 0 2mm;opacity:.5;">
        <svg width="${24 * sc}" height="${24 * sc}" viewBox="0 0 24 24" fill="none"><path d="M18 8h1a4 4 0 0 1 0 8h-1M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z" stroke="currentColor" stroke-width="1.4"/></svg>
        <svg width="${24 * sc}" height="${24 * sc}" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="7" r="3" stroke="currentColor" stroke-width="1.4"/><path d="M5 21v-2a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v2" stroke="currentColor" stroke-width="1.4"/></svg>
      </div>`) +
      `<h1 data-qr="title" style="font-family:'Nunito',sans-serif;font-size:${sPx(32, fmt)}px;font-weight:700;text-align:center;color:#4a4038;margin:0 0 ${2 * sc}mm;">${esc(d.nameLine)}</h1>
      <p data-qr="subtitle" style="text-align:center;font-family:'Nunito',sans-serif;font-size:${sPx(14, fmt)}px;color:#7a6b5c;margin:0 0 ${6 * sc}mm;font-weight:500;">${esc(d.tagline)}</p>
      <p data-qr="cta" style="text-align:center;font-size:${sPx(12, fmt)}px;color:#8a7d6f;margin:0 0 ${4 * sc}mm;">Сканирай · Scan</p>
      <div style="background:#fff;border:3px solid #e8dfd0;border-radius:${14 * sc}px;padding:${4 * sc}mm;max-width:${fmt.w - 2 * fmt.pad - 8}mm;margin:0 auto ${6 * sc}mm;text-align:center;">
        ${qrImgTag(d.qrDataUrl, fmt)}
      </div>
      <p data-qr="body" style="text-align:center;font-size:${sPx(13, fmt)}px;color:#5c534c;line-height:1.5;max-width:100%;margin:0 auto ${6 * sc}mm;">${esc(d.hintLine)}</p>` +
      `<footer data-qr="footer" class="qr-sheet__footer" style="flex-shrink:0;margin-top:auto;width:100%;box-sizing:border-box;background:#efe6d8;border-radius:${10 * sc}px;padding:${4 * sc}mm;text-align:center;">
        <p style="font-size:${sPx(11, fmt)}px;color:#6a5f54;margin:0 0 1mm;font-weight:600;">Нуждаете се от е-меню?</p>
        <p style="font-size:${sPx(10, fmt)}px;color:#7a6f66;margin:0 0 2mm;">${esc(SERVICE.lineBg)}</p>
        <p style="font-size:${sPx(12, fmt)}px;font-weight:700;color:#3d3530;">${esc(SERVICE.phone)}</p>
        <p style="font-size:${sPx(11, fmt)}px;color:#5a5048;margin:${1 * sc}mm 0 0;">${esc(SERVICE.email)}</p>
      </footer>` +
      sheetMainClose() + sheetShellClose();
  }

  function buildTerrace(d, fmt, es) {
    const sc = fmt.scale;
    return sheetShellOpen(fmt, es, { bg: 'linear-gradient(165deg,#fff9e6 0%,#f5ecd8 45%,#faf6ef 100%)', extra: '' }) +
      sheetMainOpen() +
      (fmt.id === 'card' ? '' : `<div style="text-align:center;padding-top:1mm;">
        <svg width="${36 * sc}" height="${36 * sc}" viewBox="0 0 24 24" fill="none" style="opacity:.55;color:#c9a227" aria-hidden="true">
          <circle cx="12" cy="12" r="5" stroke="currentColor" stroke-width="1.3"/>
          <path d="M12 2v3M12 19v3M2 12h3M19 12h3" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
        </svg>
      </div>`) +
      `<h1 data-qr="title" style="font-family:'Playfair Display',Georgia,serif;font-size:${sPx(34, fmt)}px;font-weight:700;text-align:center;color:#3d3528;margin:${2 * sc}mm 0 1mm;">${esc(d.nameLine)}</h1>
      <p data-qr="subtitle" style="text-align:center;font-size:${sPx(13, fmt)}px;color:#7a6a4a;font-style:italic;margin:0 0 1mm;">${esc(d.tagline)}</p>
      <p data-qr="cta" style="text-align:center;font-size:${sPx(11, fmt)}px;letter-spacing:.12em;text-transform:uppercase;color:#9a8548;margin:0 0 ${6 * sc}mm;">Лятно меню · Summer</p>
      <div style="border:2px solid #d4c49a;border-radius:8px;padding:${4 * sc}mm;max-width:${fmt.w - 2 * fmt.pad - 6}mm;margin:0 auto ${5 * sc}mm;background:rgba(255,255,255,.65);text-align:center;">
        ${qrImgTag(d.qrDataUrl, fmt)}
      </div>
      <p data-qr="body" style="text-align:center;font-size:${sPx(12, fmt)}px;color:#5c5344;line-height:1.55;max-width:100%;margin:0 auto ${6 * sc}mm;">${esc(d.hintLine)}</p>` +
      `<footer data-qr="footer" class="qr-sheet__footer" style="flex-shrink:0;margin-top:auto;width:100%;box-sizing:border-box;border-top:2px solid #e0d4b8;padding-top:${4 * sc}mm;">
        <p style="text-align:center;font-size:${sPx(10, fmt)}px;color:#8a7a58;margin:0 0 2mm;">${esc(SERVICE.lineEn)}</p>
        <p style="text-align:center;font-size:${sPx(12, fmt)}px;font-weight:600;color:#4a4030;">${esc(SERVICE.brand)} — ${esc(SERVICE.phone)}</p>
        <p style="text-align:center;font-size:${sPx(11, fmt)}px;color:#6a5a40;margin-top:1mm;">${esc(SERVICE.email)}</p>
      </footer>` +
      sheetMainClose() + sheetShellClose();
  }

  function buildBistro(d, fmt, es) {
    const sc = fmt.scale;
    const mainPad = `${fmt.pad}mm ${fmt.pad + 2}mm`;
    return sheetShellOpen(fmt, es, { bg: '#f2f0ec', extra: 'padding:0;' }) +
      sheetMainOpen() +
      `<div style="padding:${mainPad};flex:1 1 auto;display:flex;flex-direction:column;min-height:0;">
        <div style="display:flex;align-items:center;justify-content:center;gap:8px;margin-bottom:${3 * sc}mm;opacity:.4;">
          <svg width="${28 * sc}" height="${28 * sc}" viewBox="0 0 24 24" fill="none"><path d="M9 2v6M12 2v20M15 2v6M9 8h6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
        </div>
        <h1 data-qr="title" style="font-family:'Playfair Display',Georgia,serif;font-size:${sPx(36, fmt)}px;font-weight:700;text-align:center;color:#1e1c1a;margin:0 0 ${2 * sc}mm;">${esc(d.nameLine)}</h1>
        <p data-qr="subtitle" style="text-align:center;font-size:${sPx(13, fmt)}px;color:#5a5650;margin:0 0 ${6 * sc}mm;">${esc(d.tagline)}</p>
        <p data-qr="cta" style="text-align:center;font-size:${sPx(10, fmt)}px;letter-spacing:.2em;text-transform:uppercase;color:#777;margin:0 0 ${5 * sc}mm;">Taproom · QR menu</p>
        <div style="background:#fff;border:1px solid #c8c4bc;padding:${4 * sc}mm;max-width:${fmt.w - 2 * fmt.pad - 8}mm;margin:0 auto ${6 * sc}mm;text-align:center;">
          ${qrImgTag(d.qrDataUrl, fmt)}
        </div>
        <p data-qr="body" style="text-align:center;font-size:${sPx(12, fmt)}px;color:#444;line-height:1.5;max-width:100%;margin:0 auto;">${esc(d.hintLine)}</p>
      </div>` +
      `<footer data-qr="footer" class="qr-sheet__footer" style="flex-shrink:0;margin-top:auto;width:100%;box-sizing:border-box;background:#2a2826;color:#e8e4dc;padding:${5 * sc}mm ${fmt.pad + 2}mm;">
        <p style="text-align:center;font-size:${sPx(10, fmt)}px;letter-spacing:.15em;text-transform:uppercase;color:#a09890;margin:0 0 2mm;">Need a digital menu?</p>
        <p style="text-align:center;font-size:${sPx(12, fmt)}px;line-height:1.45;margin:0 0 3mm;color:#d0c8c0;">${esc(SERVICE.lineEn)}</p>
        <p style="text-align:center;font-size:${sPx(14, fmt)}px;font-weight:700;color:#fff;">${esc(SERVICE.phone)}</p>
        <p style="text-align:center;font-size:${sPx(12, fmt)}px;color:#c5bdb5;margin-top:1mm;">${esc(SERVICE.email)}</p>
        <p style="text-align:center;font-size:${sPx(10, fmt)}px;color:#8a8580;margin-top:3mm;">${esc(SERVICE.brand)}</p>
      </footer>` +
      sheetMainClose() + sheetShellClose();
  }

  /** Gold L-brackets around QR (reference flyer style). */
  function qrGoldBracketFrame(qrDataUrl, fmt, sc) {
    const qr = fmt.qr;
    const t = Math.max(0.35, 0.55 * sc);
    const L = 8 * sc;
    return `
      <div style="position:relative;display:inline-block;line-height:0;">
        <img class="qr-sheet__qr" src="${esc(qrDataUrl)}" alt="" style="width:${qr}mm;height:${qr}mm;display:block;object-fit:contain;image-rendering:pixelated;"/>
        <span style="position:absolute;left:${-1.2 * sc}mm;top:${-1.2 * sc}mm;width:${L}mm;height:${L}mm;border-left:${t}mm solid ${GOLD};border-top:${t}mm solid ${GOLD};pointer-events:none;"></span>
        <span style="position:absolute;right:${-1.2 * sc}mm;top:${-1.2 * sc}mm;width:${L}mm;height:${L}mm;border-right:${t}mm solid ${GOLD};border-top:${t}mm solid ${GOLD};pointer-events:none;"></span>
        <span style="position:absolute;left:${-1.2 * sc}mm;bottom:${-1.2 * sc}mm;width:${L}mm;height:${L}mm;border-left:${t}mm solid ${GOLD};border-bottom:${t}mm solid ${GOLD};pointer-events:none;"></span>
        <span style="position:absolute;right:${-1.2 * sc}mm;bottom:${-1.2 * sc}mm;width:${L}mm;height:${L}mm;border-right:${t}mm solid ${GOLD};border-bottom:${t}mm solid ${GOLD};pointer-events:none;"></span>
      </div>`;
  }

  /** Luxury vertical overlay — reference: dark column, gold accents, script “Menu”, footer bar. */
  function buildLuxuryScan(d, fmt, es) {
    const sc = fmt.scale;
    const sh = es.sheet || {};
    const defaultBg =
      'linear-gradient(rgba(0,0,0,.52), rgba(0,0,0,.58)), url(https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=1600&q=80) center/cover no-repeat';
    const sheetBg = sh.background && !sh.backgroundImage ? sh.background : defaultBg;
    const pad = sh.paddingMm != null ? sh.paddingMm : fmt.pad;
    const colW = fmt.id === 'card' ? '100%' : '72%';
    const scanEn = 'Scan for';
    const scanBg = 'Сканирайте за';
    const menuWord = d.lang === 'bg' ? 'Меню' : 'Menu';
    return `
      <div class="qr-sheet" data-fmt="${esc(fmt.id)}"
           style="width:${fmt.w}mm;height:${fmt.h}mm;min-height:${fmt.h}mm;max-height:${fmt.h}mm;
                  box-sizing:border-box;padding:0;margin:0;position:relative;
                  display:flex;flex-direction:column;align-items:center;
                  font-family:'Montserrat',system-ui,sans-serif;color:#fff;
                  background:${sheetBg};background-size:cover;background-position:center;">
        <div class="qr-sheet__main" style="flex:1 1 auto;width:${colW};max-width:100%;min-height:0;display:flex;flex-direction:column;
                    align-items:center;box-sizing:border-box;padding:${pad}mm ${3 * sc}mm;
                    background:rgba(0,0,0,.58);margin:${2 * sc}mm auto 0;">
          <div style="margin-bottom:${3 * sc}mm;opacity:.95;color:${GOLD};">
            <svg width="${28 * sc}" height="${28 * sc}" viewBox="0 0 48 48" fill="none" aria-hidden="true">
              <path d="M14 8v14M18 8v14M14 22v18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
              <path d="M24 4v40M21 12h6M21 18h6M21 24h6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
              <ellipse cx="34" cy="10" rx="9" ry="5" stroke="currentColor" stroke-width="1.8"/>
              <path d="M25 10h18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
            </svg>
          </div>
          <h1 data-qr="title" style="font-family:'Cinzel',Georgia,serif;font-size:${sPx(17, fmt)}px;font-weight:600;letter-spacing:.35em;
            text-transform:uppercase;color:#fff;margin:0 0 ${2 * sc}mm;text-align:center;line-height:1.25;">${esc(d.nameLine)}</h1>
          <p data-qr="subtitle" style="font-family:'Montserrat',sans-serif;font-size:${sPx(9, fmt)}px;color:rgba(255,255,255,.7);margin:0 0 ${4 * sc}mm;text-align:center;">${esc(d.tagline)}</p>
          <p style="font-size:${sPx(11, fmt)}px;font-weight:500;color:rgba(255,255,255,.92);margin:0 0 ${1 * sc}mm;text-align:center;">${d.lang === 'bg' ? scanBg : scanEn}</p>
          <p data-qr="cta" style="font-family:'Great Vibes',cursive;font-size:${sPx(40, fmt)}px;font-weight:400;color:${GOLD};margin:0 0 ${4 * sc}mm;line-height:1;text-align:center;">${esc(menuWord)}</p>
          <p data-qr="body" style="font-size:${sPx(10, fmt)}px;line-height:1.55;color:rgba(255,255,255,.78);text-align:center;margin:0 0 ${5 * sc}mm;max-width:100%;">${esc(d.hintLine)}</p>
          <div style="text-align:center;margin-bottom:${4 * sc}mm;">${qrGoldBracketFrame(d.qrDataUrl, fmt, sc)}</div>
        </div>
        <footer data-qr="footer" class="qr-sheet__footer" style="flex-shrink:0;width:100%;margin-top:auto;background:${GOLD};color:#fff;
                    padding:${3.5 * sc}mm ${pad}mm;text-align:center;box-sizing:border-box;">
          <p style="font-family:'Montserrat',sans-serif;font-size:${sPx(11, fmt)}px;letter-spacing:.28em;text-transform:lowercase;margin:0;font-weight:500;">${esc(getMenuUrl().replace(/^https?:\/\//i, ''))}</p>
          <p style="font-size:${sPx(8, fmt)}px;margin:${2 * sc}mm 0 0;opacity:.85;">${esc(SERVICE.brand)} · ${esc(SERVICE.phone)}</p>
        </footer>
      </div>`;
  }

  function buildNoirSplit(d, fmt, es) {
    const sc = fmt.scale;
    return sheetShellOpen(fmt, es, {
      bg: '#0a0a0c',
      extra: 'background:linear-gradient(180deg,#0a0a0c 0%,#0a0a0c 48%,#f5f2ec 48%,#f5f2ec 100%);color:#e8e4dc;padding:0;'
    }) +
      sheetMainOpen() +
      `<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:${6 * sc}mm ${fmt.pad}mm;color:#e8e4dc;">
        <p data-qr="cta" style="font-size:${sPx(10, fmt)}px;letter-spacing:.4em;text-transform:uppercase;margin:0 0 ${3 * sc}mm;color:${GOLD};opacity:.9;">Scan</p>
        <h1 data-qr="title" style="font-family:'Playfair Display',Georgia,serif;font-size:${sPx(36, fmt)}px;font-weight:700;margin:0 0 ${2 * sc}mm;line-height:1.1;">${esc(d.nameLine)}</h1>
        <p data-qr="subtitle" style="font-size:${sPx(12, fmt)}px;color:rgba(255,255,255,.55);margin:0 0 ${5 * sc}mm;">${esc(d.tagline)}</p>
        <div style="width:${18 * sc}mm;height:1px;background:${GOLD};margin:0 auto ${5 * sc}mm;opacity:.8;"></div>
        ${qrImgTag(d.qrDataUrl, fmt)}
      </div>
      <div style="background:#f5f2ec;padding:${5 * sc}mm ${fmt.pad}mm;text-align:center;color:#2a2824;">
        <p data-qr="body" style="font-size:${sPx(11, fmt)}px;line-height:1.5;margin:0 0 ${4 * sc}mm;max-width:100%;">${esc(d.hintLine)}</p>
        <footer data-qr="footer" style="font-size:${sPx(10, fmt)}px;color:#5c5a56;">
          <span>${esc(SERVICE.phone)}</span> · <span>${esc(SERVICE.email)}</span>
        </footer>
      </div>` +
      sheetMainClose() + sheetShellClose();
  }

  function buildWeave(d, fmt, es) {
    const sc = fmt.scale;
    const extra = {
      bg: '#e8e4dc',
      extra: 'background-image:repeating-linear-gradient(45deg,rgba(0,0,0,.03) 0,rgba(0,0,0,.03) 1px,transparent 1px,transparent 8px),linear-gradient(145deg,#f0ebe3,#e2dcd2);'
    };
    return sheetShellOpen(fmt, es, extra) +
      sheetMainOpen() +
      `<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:${5 * sc}mm;">
        <div style="background:rgba(255,255,255,.72);backdrop-filter:blur(8px);border-radius:${12 * sc}px;padding:${6 * sc}mm ${5 * sc}mm;max-width:${fmt.w - 2 * fmt.pad - 6}mm;box-shadow:0 12px 40px rgba(0,0,0,.08);border:1px solid rgba(255,255,255,.6);text-align:center;">
          <h1 data-qr="title" style="font-family:'Cormorant Garamond',Georgia,serif;font-size:${sPx(34, fmt)}px;font-weight:600;color:#2c2c2c;margin:0 0 ${2 * sc}mm;">${esc(d.nameLine)}</h1>
          <p data-qr="subtitle" style="font-size:${sPx(13, fmt)}px;color:#666;font-style:italic;margin:0 0 ${5 * sc}mm;">${esc(d.tagline)}</p>
          <p data-qr="cta" style="font-size:${sPx(9, fmt)}px;letter-spacing:.25em;text-transform:uppercase;color:#8a7a68;margin:0 0 ${4 * sc}mm;">Digital menu</p>
          ${qrImgTag(d.qrDataUrl, fmt)}
          <p data-qr="body" style="font-size:${sPx(11, fmt)}px;color:#555;line-height:1.5;margin:${5 * sc}mm 0 0;">${esc(d.hintLine)}</p>
        </div>
      </div>
      <footer data-qr="footer" class="qr-sheet__footer" style="flex-shrink:0;text-align:center;padding-bottom:${3 * sc}mm;font-size:${sPx(9, fmt)}px;color:#777;">
        ${esc(SERVICE.brand)} · ${esc(SERVICE.phone)}
      </footer>` +
      sheetMainClose() + sheetShellClose();
  }

  function buildSunset(d, fmt, es) {
    const sc = fmt.scale;
    return sheetShellOpen(fmt, es, {
      bg: 'linear-gradient(165deg,#1a0f2e 0%,#4a2c4a 40%,#c76b4a 85%,#e8a05a 100%)',
      extra: 'color:#fff;'
    }) +
      sheetMainOpen() +
      `<div style="flex:1;display:flex;flex-direction:column;align-items:center;text-align:center;padding:${8 * sc}mm ${fmt.pad}mm;">
        <h1 data-qr="title" style="font-family:'Montserrat',sans-serif;font-size:${sPx(30, fmt)}px;font-weight:800;letter-spacing:-.02em;margin:0 0 ${2 * sc}mm;text-shadow:0 2px 20px rgba(0,0,0,.2);">${esc(d.nameLine)}</h1>
        <p data-qr="subtitle" style="font-size:${sPx(12, fmt)}px;opacity:.9;margin:0 0 ${6 * sc}mm;">${esc(d.tagline)}</p>
        <p data-qr="cta" style="font-size:${sPx(10, fmt)}px;letter-spacing:.3em;text-transform:uppercase;opacity:.85;margin:0 0 ${5 * sc}mm;">Tap · Scan · Enjoy</p>
        <div style="background:rgba(255,255,255,.12);border-radius:${14 * sc}px;padding:${4 * sc}mm;border:1px solid rgba(255,255,255,.25);">
          ${qrImgTag(d.qrDataUrl, fmt)}
        </div>
        <p data-qr="body" style="font-size:${sPx(11, fmt)}px;line-height:1.5;margin:${6 * sc}mm 0 0;opacity:.92;max-width:100%;">${esc(d.hintLine)}</p>
      </div>
      <footer data-qr="footer" class="qr-sheet__footer" style="flex-shrink:0;text-align:center;font-size:${sPx(10, fmt)}px;padding-bottom:${4 * sc}mm;opacity:.88;">
        ${esc(SERVICE.email)} · ${esc(SERVICE.phone)}
      </footer>` +
      sheetMainClose() + sheetShellClose();
  }

  function buildLineArt(d, fmt, es) {
    const sc = fmt.scale;
    return sheetShellOpen(fmt, es, { bg: '#fafafa', extra: 'border:1px solid #ddd;' }) +
      sheetMainOpen() +
      `<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:${7 * sc}mm ${fmt.pad + 2}mm;text-align:center;color:#111;">
        <div style="border:2px solid #111;padding:${2 * sc}mm ${8 * sc}mm;margin-bottom:${6 * sc}mm;">
          <span style="font-size:${sPx(9, fmt)}px;letter-spacing:.5em;">QR</span>
        </div>
        <h1 data-qr="title" style="font-family:'Inter',system-ui,sans-serif;font-size:${sPx(26, fmt)}px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;margin:0 0 ${3 * sc}mm;">${esc(d.nameLine)}</h1>
        <p data-qr="subtitle" style="font-size:${sPx(11, fmt)}px;color:#666;margin:0 0 ${2 * sc}mm;">${esc(d.tagline)}</p>
        <p data-qr="cta" style="font-size:${sPx(9, fmt)}px;letter-spacing:.2em;color:#999;margin:0 0 ${6 * sc}mm;">MENU ACCESS</p>
        <div style="border:1px solid #ccc;padding:${4 * sc}mm;display:inline-block;">
          ${qrImgTag(d.qrDataUrl, fmt)}
        </div>
        <p data-qr="body" style="font-size:${sPx(10, fmt)}px;color:#555;line-height:1.5;margin:${6 * sc}mm 0 0;max-width:100%;">${esc(d.hintLine)}</p>
      </div>
      <footer data-qr="footer" class="qr-sheet__footer" style="flex-shrink:0;border-top:1px solid #ddd;padding-top:${4 * sc}mm;text-align:center;font-size:${sPx(9, fmt)}px;color:#888;">
        ${esc(SERVICE.brand)} · ${esc(SERVICE.phone)}
      </footer>` +
      sheetMainClose() + sheetShellClose();
  }

  function buildMetro(d, fmt, es) {
    const sc = fmt.scale;
    const grid = 'background-image:linear-gradient(rgba(255,255,255,.04) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.04) 1px,transparent 1px);background-size:12mm 12mm;';
    return sheetShellOpen(fmt, es, { bg: '#0f1419', extra: grid + 'color:#e6edf3;' }) +
      sheetMainOpen() +
      `<div style="flex:1;display:flex;flex-direction:column;padding:${fmt.pad}mm;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:${4 * sc}mm;margin-bottom:${6 * sc}mm;">
          <div style="text-align:left;">
            <h1 data-qr="title" style="font-family:'Inter',system-ui,sans-serif;font-size:${sPx(22, fmt)}px;font-weight:800;letter-spacing:-.03em;margin:0 0 ${1 * sc}mm;line-height:1.15;">${esc(d.nameLine)}</h1>
            <p data-qr="subtitle" style="font-size:${sPx(10, fmt)}px;color:#8b9cad;margin:0;">${esc(d.tagline)}</p>
          </div>
          <p data-qr="cta" style="font-size:${sPx(8, fmt)}px;letter-spacing:.2em;text-transform:uppercase;color:${GOLD};margin:0;">Scan →</p>
        </div>
        <div style="flex:1;display:flex;align-items:center;justify-content:center;">
          <div style="background:#fff;padding:${3 * sc}mm;border-radius:4px;box-shadow:0 8px 32px rgba(0,0,0,.35);">
            ${qrImgTag(d.qrDataUrl, fmt)}
          </div>
        </div>
        <p data-qr="body" style="font-size:${sPx(10, fmt)}px;color:#9dafbf;line-height:1.5;margin:${6 * sc}mm 0 0;text-align:center;">${esc(d.hintLine)}</p>
      </div>
      <footer data-qr="footer" class="qr-sheet__footer" style="flex-shrink:0;border-top:1px solid rgba(255,255,255,.08);padding:${4 * sc}mm ${fmt.pad}mm;font-size:${sPx(9, fmt)}px;color:#7d8fa3;text-align:center;">
        ${esc(SERVICE.phone)} · ${esc(SERVICE.email)}
      </footer>` +
      sheetMainClose() + sheetShellClose();
  }

  function buildHtml(d, qrDataUrl) {
    const starter = STARTERS.find(s => s.id === designState.starterId) || STARTERS[0];
    const fmt = getFmt();
    const copy = { ...d, qrDataUrl };
    return starter.build(copy, fmt, getEffectiveStyles());
  }

  function applyDesignToDom(host) {
    const es = getEffectiveStyles();
    ZONES.forEach(z => {
      const cfg = es[z.id];
      if (!cfg) return;
      const nodes = host.querySelectorAll(`[data-qr="${z.id}"]`);
      nodes.forEach(el => {
        if (z.id === 'sheet') return;
        if (cfg.fontFamily) el.style.fontFamily = cfg.fontFamily;
        if (cfg.fontSize != null && cfg.fontSize !== '') el.style.fontSize = typeof cfg.fontSize === 'number' ? cfg.fontSize + 'px' : cfg.fontSize;
        if (cfg.color) el.style.color = cfg.color;
        if (cfg.textAlign) el.style.textAlign = cfg.textAlign;
        if (cfg.fontWeight) el.style.fontWeight = cfg.fontWeight;
      });
    });
    const sheet = host.querySelector('.qr-sheet');
    if (sheet && es.sheet) {
      const sh = es.sheet;
      const overlay = sh.backgroundOverlay != null && sh.backgroundOverlay !== ''
        ? Math.min(0.92, Math.max(0, Number(sh.backgroundOverlay)))
        : null;
      const img = (sh.backgroundImage && String(sh.backgroundImage).trim()) || '';

      if (img) {
        const safe = img.replace(/\\/g, '/').replace(/"/g, '\\"');
        const ov = overlay != null ? overlay : 0.45;
        sheet.style.background = `linear-gradient(rgba(0,0,0,${ov}), rgba(0,0,0,${ov})), url("${safe}")`;
        sheet.style.backgroundSize = 'cover';
        sheet.style.backgroundPosition = 'center';
        sheet.style.backgroundRepeat = 'no-repeat';
      } else if (sh.background) {
        sheet.style.background = sh.background;
        sheet.style.backgroundSize = '';
        sheet.style.backgroundPosition = '';
        sheet.style.backgroundRepeat = '';
      }
      if (es.sheet.paddingMm != null) sheet.style.padding = es.sheet.paddingMm + 'mm';
    }
  }

  function patchTitleSubtitle(host, d) {
    const t = designState.text.title && designState.text.title.trim();
    const s = designState.text.subtitle && designState.text.subtitle.trim();
    if (t) {
      host.querySelectorAll('[data-qr="title"]').forEach(el => { el.textContent = t; });
    }
    if (s) {
      host.querySelectorAll('[data-qr="subtitle"]').forEach(el => { el.textContent = s; });
    }
  }

  function getPrintCss(fmt) {
    const w = fmt.w;
    const h = fmt.h;
    /* Single page for every format: @page size matches FORMATS; in print, html/body/sheet use 100% of the page box
       so mm rounding cannot spill onto a second sheet (common with A5/DL/card vs A4). */
    return `
    @page { size: ${fmt.page}; margin: 0; }
    * { box-sizing: border-box; }
    html {
      margin: 0 !important;
      padding: 0 !important;
      width: ${w}mm;
      height: ${h}mm;
      overflow: hidden !important;
      background: #fff;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    body {
      position: relative;
      margin: 0 !important;
      padding: 0 !important;
      width: ${w}mm !important;
      height: ${h}mm !important;
      min-height: ${h}mm !important;
      max-height: ${h}mm !important;
      overflow: hidden !important;
      background: #fff !important;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .qr-sheet {
      position: absolute;
      left: 0;
      top: 0;
      width: ${w}mm !important;
      height: ${h}mm !important;
      margin: 0 !important;
      page-break-after: avoid !important;
      page-break-inside: avoid !important;
      break-inside: avoid !important;
      break-after: avoid !important;
      overflow: hidden !important;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .qr-sheet__main {
      flex: 1 1 auto;
      min-height: 0;
      overflow: hidden;
    }
    .qr-sheet__footer { flex-shrink: 0; }
    .qr-sheet__qr { image-rendering: pixelated; max-width: 100%; }
    @media print {
      html {
        width: 100% !important;
        height: 100% !important;
        max-height: 100% !important;
        overflow: clip !important;
      }
      body {
        width: 100% !important;
        height: 100% !important;
        min-height: 0 !important;
        max-height: 100% !important;
        overflow: clip !important;
      }
      .qr-sheet {
        width: 100% !important;
        height: 100% !important;
        min-height: 0 !important;
        max-height: 100% !important;
        left: 0 !important;
        top: 0 !important;
        box-sizing: border-box !important;
      }
    }
    `;
  }

  function gatherCopy() {
    const r = getRestaurant ? getRestaurant() : {};
    const lang = (r.default_language || 'bg') === 'en' ? 'en' : 'bg';
    const nameBg = (r.name && r.name.bg) || '';
    const nameEn = (r.name && r.name.en) || '';
    const nameLine = lang === 'bg' ? (nameBg || nameEn || 'Вашият ресторант') : (nameEn || nameBg || 'Your restaurant');
    const desc = r.description || {};
    const descLine = (lang === 'bg' ? (desc.bg || desc.en) : (desc.en || desc.bg)) || '';
    const tagline = descLine.slice(0, 120) || (lang === 'bg' ? 'Добре дошли!' : 'Welcome!');
    const hintLine = lang === 'bg'
      ? 'Сканирайте с телефона си за достъп до нашето дигитално меню.'
      : 'Scan with your phone to open our digital menu.';
    return { nameLine, descLine: descLine.slice(0, 200), tagline: tagline.slice(0, 140), hintLine, lang };
  }

  function getMenuUrl() {
    return typeof getMenuUrlFn === 'function' ? getMenuUrlFn() : window.location.href;
  }

  function generateQrDataUrl(url) {
    return new Promise((resolve, reject) => {
      try {
        if (typeof QRious === 'undefined') {
          reject(new Error('QR library not loaded.'));
          return;
        }
        const canvas = document.createElement('canvas');
        new QRious({
          element: canvas, value: url, size: 512, padding: 20,
          background: '#ffffff', foreground: '#2a2a2a', level: 'M'
        });
        resolve(canvas.toDataURL('image/png'));
      } catch (e) { reject(e); }
    });
  }

  function previewScaleFor(fmt) {
    if (fmt.id === 'card') return 0.92;
    if (fmt.id === 'a6') return 0.58;
    if (fmt.id === 'a5') return 0.52;
    if (fmt.id === 'dl') return 0.48;
    return 0.46;
  }

  function updatePreviewChrome() {
    const fmt = getFmt();
    const zoom = document.querySelector('.qr-preview-zoom');
    if (zoom) {
      zoom.style.setProperty('--qr-w-mm', fmt.w + 'mm');
      zoom.style.setProperty('--qr-h-mm', fmt.h + 'mm');
      zoom.style.setProperty('--qr-preview-scale', String(previewScaleFor(fmt)));
    }
    const urlEl = document.getElementById('qrUrlDisplay');
    if (urlEl) urlEl.textContent = getMenuUrl();
  }

  function renderPreview() {
    const host = document.getElementById('qrPreviewHost');
    const status = document.getElementById('qrFlyerStatus');
    if (!host) return;

    const url = getMenuUrl();
    updatePreviewChrome();
    status.textContent = 'Generating QR…';

    generateQrDataUrl(url)
      .then(qrDataUrl => {
        const copy = gatherCopy();
        host.innerHTML = buildHtml(copy, qrDataUrl);
        patchTitleSubtitle(host, copy);
        applyDesignToDom(host);
        host.classList.toggle('qr-preview-host--editing', editMode);
        status.textContent = editMode ? 'Edit mode — adjust the panel below.' : 'Preview updated.';
        track('admin_qr_preview_ok', {
          restaurant_id: String((getRestaurant && getRestaurant().id) || '').slice(0, 40),
          template_id:   designState.starterId.slice(0, 24),
          format_id:     designState.formatId.slice(0, 24)
        });
      })
      .catch(e => {
        host.innerHTML = `<p class="qr-flyer__err">${esc(e.message)}</p>`;
        status.textContent = 'QR generation failed.';
        track('admin_qr_preview_fail', { error: (e.message || '').slice(0, 100) });
      });
  }

  function printSelected() {
    track('admin_qr_print', {
      restaurant_id: String((getRestaurant && getRestaurant().id) || '').slice(0, 40),
      template_id:   designState.starterId.slice(0, 24),
      format_id:     designState.formatId.slice(0, 24)
    });

    const url = getMenuUrl();
    const fmt = getFmt();

    generateQrDataUrl(url)
      .then(qrDataUrl => {
        const copy = gatherCopy();
        const bodyHtml = buildHtml({ ...copy, qrDataUrl }, qrDataUrl);
        const fontLink = 'https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600&family=Cormorant+Garamond:ital,wght@0,400;0,600;1,400&family=Great+Vibes&family=Inter:wght@400;500;600;700;800&family=Montserrat:wght@400;500;600;700;800&family=Nunito:wght@400;600;700&family=Playfair+Display:wght@400;700&display=swap';
        const w = window.open('', '_blank');
        if (!w) {
          showToastLocal('Pop-up blocked — allow pop-ups to print.');
          return;
        }
        const holder = document.createElement('div');
        holder.innerHTML = bodyHtml;
        patchTitleSubtitle(holder, copy);
        applyDesignToDom(holder);
        w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"/><title>QR media</title>
          <link rel="stylesheet" href="${fontLink}"/>
          <style>${getPrintCss(fmt)}</style></head><body>${holder.innerHTML}</body></html>`);
        w.document.close();
        w.focus();
        setTimeout(() => { try { w.print(); } catch (_) {} }, 450);
      })
      .catch(e => showToastLocal(e.message));
  }

  function showToastLocal(msg) {
    const t = document.getElementById('toast');
    if (t) {
      t.textContent = msg;
      t.className = 'toast error';
      setTimeout(() => { t.className = 'toast hidden'; }, 4000);
    } else alert(msg);
  }

  /* ── localStorage: per-restaurant custom layouts ── */
  function storeRoot() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    } catch (_) {
      return {};
    }
  }

  function saveStore(root) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(root));
    } catch (_) {}
  }

  function listCustoms() {
    const rid = (getRestaurant && getRestaurant().id) || '';
    const root = storeRoot();
    return Array.isArray(root[rid]) ? root[rid] : [];
  }

  function persistCustom(entry) {
    const rid = (getRestaurant && getRestaurant().id) || 'default';
    const root = storeRoot();
    if (!Array.isArray(root[rid])) root[rid] = [];
    const i = root[rid].findIndex(x => x.id === entry.id);
    if (i >= 0) root[rid][i] = entry;
    else root[rid].push(entry);
    saveStore(root);
  }

  function deleteCustom(id) {
    const rid = (getRestaurant && getRestaurant().id) || 'default';
    const root = storeRoot();
    if (!Array.isArray(root[rid])) return;
    root[rid] = root[rid].filter(x => x.id !== id);
    saveStore(root);
  }

  function snapshotDesign(name) {
    return {
      id:        'c_' + Date.now(),
      name:      name || 'Custom layout',
      updatedAt: Date.now(),
      state:     deepClone(designState)
    };
  }

  function applySnapshot(entry) {
    if (!entry || !entry.state) return;
    designState = deepClone(entry.state);
    syncEditorControlsFromState();
    buildStarterPicker();
    buildFormatBar();
    if (editMode) {
      const zs = document.getElementById('qrZoneSelect');
      if (zs) fillZoneEditor(zs.value);
    }
    renderPreview();
  }

  function syncEditorControlsFromState() {
    const z = document.getElementById('qrZoneSelect') && document.getElementById('qrZoneSelect').value;
    if (z) fillZoneEditor(z);

    const t1 = document.getElementById('qrTextTitle');
    const t2 = document.getElementById('qrTextSubtitle');
    if (t1) t1.value = designState.text.title || '';
    if (t2) t2.value = designState.text.subtitle || '';
  }

  function ensureStyleZone(zone) {
    if (!designState.styles[zone]) designState.styles[zone] = {};
    return designState.styles[zone];
  }

  /** Preview URL for sheet background (HTTPS, data, or filename → restaurant resources). */
  function resolveSheetBgPreviewUrl(val) {
    if (!val) return null;
    if (/^https?:\/\//i.test(val) || val.startsWith('/') || val.startsWith('data:')) return val;
    const r = getRestaurant && getRestaurant();
    if (r && r.id) {
      try {
        return new URL(`../resources/${encodeURI(r.id)}/${val}`, window.location.href).href;
      } catch (_) {
        return `../resources/${r.id}/${val}`;
      }
    }
    return null;
  }

  function fillZoneEditor(zone) {
    const es = getEffectiveStyles()[zone];
    const panel = document.getElementById('qrZoneFields');
    if (!panel) return;

    if (zone === 'sheet') {
      const ov = es.backgroundOverlay != null && es.backgroundOverlay !== ''
        ? Number(es.backgroundOverlay)
        : '';
      panel.innerHTML = `
        <div class="qr-field-grid">
          <label class="qr-mini-label">Background color</label>
          <input type="color" id="qrFldBg" class="field-input" value="${sheetBgToColorInput(es.background)}" />
          <label class="qr-mini-label qr-sheet-bg-label">Background image</label>
          <div class="field-url-wrap qr-sheet-bg-url-wrap">
            <div class="field-url-input-row">
              <input type="text" id="qrFldBgImg" class="field-input" value="${esc(es.backgroundImage || '')}" placeholder="https://… or cover.jpg" autocomplete="off" spellcheck="false" />
              <button type="button" class="btn-upload-img" id="qrFldBgImgUpload" title="Upload to Cloudinary" ${uploadSheetBackgroundFn ? '' : 'disabled'}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></svg>
                Upload
              </button>
            </div>
            <div class="field-url-preview" id="qrFldBgImgPreview"></div>
          </div>
          <label class="qr-mini-label">Image darkening (0–0.85)</label>
          <input type="number" id="qrFldOv" class="field-input" min="0" max="0.85" step="0.05" value="${ov === '' ? '' : ov}" placeholder="0.45 default" />
          <label class="qr-mini-label">Padding (mm)</label>
          <input type="number" id="qrFldPad" class="field-input" min="0" max="30" step="0.5" value="${es.paddingMm != null ? es.paddingMm : ''}" placeholder="auto" />
          <div class="qr-sheet-actions">
            <button type="button" class="btn-qr-secondary" id="qrFldBgImgClear">Clear image</button>
          </div>
          <p class="qr-zone-fields__hint">Paste a URL, a filename (e.g. <code>cover.jpg</code> in your restaurant folder), or <strong>Upload</strong> like logo/cover. Darkening overlays the image for readability.</p>
        </div>`;
      const bind = (sel, fn) => {
        const el = panel.querySelector(sel);
        if (!el) return;
        el.addEventListener('input', fn);
        el.addEventListener('change', fn);
      };
      const previewEl = panel.querySelector('#qrFldBgImgPreview');
      const showBgThumb = () => {
        if (!previewEl) return;
        const raw = (panel.querySelector('#qrFldBgImg') && panel.querySelector('#qrFldBgImg').value.trim()) || '';
        if (!raw) {
          previewEl.innerHTML = '';
          return;
        }
        const src = resolveSheetBgPreviewUrl(raw);
        if (!src) {
          previewEl.innerHTML = '';
          return;
        }
        previewEl.innerHTML = `<img src="${esc(src)}" alt="" onerror="this.parentElement.innerHTML='<span class=\\'url-preview-err\\'>Preview failed</span>'" />`;
      };
      bind('#qrFldBg', e => {
        ensureStyleZone('sheet').background = e.target.value;
        renderPreview();
      });
      bind('#qrFldBgImg', e => {
        ensureStyleZone('sheet').backgroundImage = e.target.value.trim();
        showBgThumb();
        renderPreview();
      });
      bind('#qrFldOv', e => {
        const v = e.target.value.trim();
        const z = ensureStyleZone('sheet');
        if (v === '') delete z.backgroundOverlay;
        else z.backgroundOverlay = parseFloat(v);
        renderPreview();
      });
      bind('#qrFldPad', e => {
        const v = e.target.value.trim();
        ensureStyleZone('sheet').paddingMm = v === '' ? null : parseFloat(v);
        renderPreview();
      });
      showBgThumb();
      const upBtn = panel.querySelector('#qrFldBgImgUpload');
      const imgInp = panel.querySelector('#qrFldBgImg');
      if (upBtn && imgInp && uploadSheetBackgroundFn) {
        upBtn.addEventListener('click', () => {
          uploadSheetBackgroundFn(imgInp, previewEl);
        });
      }
      panel.querySelector('#qrFldBgImgClear')?.addEventListener('click', () => {
        const z = ensureStyleZone('sheet');
        delete z.backgroundImage;
        delete z.backgroundOverlay;
        const inp = panel.querySelector('#qrFldBgImg');
        const ovi = panel.querySelector('#qrFldOv');
        if (inp) inp.value = '';
        if (ovi) ovi.value = '';
        if (previewEl) previewEl.innerHTML = '';
        renderPreview();
      });
      return;
    }

    const ff = es.fontFamily || '';
    const fs = es.fontSize != null ? es.fontSize : '';
    let optsHtml = '';
    FONT_OPTIONS.forEach(o => {
      const selAttr = o.v === ff ? ' selected' : '';
      optsHtml += '<option value="' + String(o.v).replace(/"/g, '&quot;') + '"' + selAttr + '>' + esc(o.l) + '</option>';
    });
    panel.innerHTML = `
      <div class="qr-field-grid">
        <label class="qr-mini-label">Font</label>
        <select id="qrFldFont" class="field-input field-select">${optsHtml}</select>
        <label class="qr-mini-label">Size (px)</label>
        <input type="number" id="qrFldSize" class="field-input" min="8" max="120" step="1" value="${fs === '' ? '' : fs}" placeholder="auto" />
        <label class="qr-mini-label">Color</label>
        <input type="color" id="qrFldColor" class="field-input" value="${colorToHex(es.color || '#333333')}" />
        <label class="qr-mini-label">Align</label>
        <select id="qrFldAlign" class="field-input field-select">
          <option value="" ${!es.textAlign ? 'selected' : ''}>— default —</option>
          <option value="left" ${es.textAlign === 'left' ? 'selected' : ''}>Left</option>
          <option value="center" ${es.textAlign === 'center' ? 'selected' : ''}>Center</option>
          <option value="right" ${es.textAlign === 'right' ? 'selected' : ''}>Right</option>
        </select>
        <label class="qr-mini-label">Weight</label>
        <select id="qrFldWeight" class="field-input field-select">
          <option value="" ${!es.fontWeight ? 'selected' : ''}>— default —</option>
          <option value="400" ${es.fontWeight === '400' ? 'selected' : ''}>Normal</option>
          <option value="600" ${es.fontWeight === '600' ? 'selected' : ''}>Semi-bold</option>
          <option value="700" ${es.fontWeight === '700' ? 'selected' : ''}>Bold</option>
        </select>
      </div>`;

    const zcfg = ensureStyleZone(zone);
    const bind = (id, key, parse) => {
      const el = panel.querySelector(id);
      if (!el) return;
      const handler = () => {
        let v = el.value;
        if (parse === 'num') v = v === '' ? null : parseFloat(v);
        if (v === '' || v == null) delete zcfg[key];
        else zcfg[key] = v;
        renderPreview();
      };
      // 'input' fires live for text/number/color; selects fire 'change' reliably across browsers
      el.addEventListener('input', handler);
      el.addEventListener('change', handler);
    };
    bind('#qrFldFont', 'fontFamily');
    bind('#qrFldSize', 'fontSize', 'num');
    bind('#qrFldColor', 'color');
    bind('#qrFldAlign', 'textAlign');
    bind('#qrFldWeight', 'fontWeight');
  }

  function colorToHex(c) {
    if (!c || typeof c !== 'string' || !c.startsWith('#') || c.includes('gradient')) return '#333333';
    if (c.length === 4) return '#' + c[1] + c[1] + c[2] + c[2] + c[3] + c[3];
    return c.slice(0, 7);
  }

  function sheetBgToColorInput(c) {
    if (!c || typeof c !== 'string' || c.includes('gradient')) return '#f4f2eb';
    return colorToHex(c) === '#333333' ? '#f4f2eb' : colorToHex(c);
  }

  function buildStarterPicker() {
    const wrap = document.getElementById('qrTemplatePicker');
    if (!wrap) return;
    wrap.innerHTML = '';
    STARTERS.forEach(t => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'qr-tpl-chip' + (t.id === designState.starterId ? ' qr-tpl-chip--active' : '');
      btn.dataset.tpl = t.id;
      btn.innerHTML = `<span>${esc(t.label)}</span>`;
      btn.title = t.labelBg;
      btn.addEventListener('click', () => {
        designState.starterId = t.id;
        track('admin_qr_template_select', { template_id: t.id.slice(0, 40) });
        buildStarterPicker();
        buildFormatBar();
        renderPreview();
      });
      wrap.appendChild(btn);
    });
  }

  /** Paper size — pill buttons only (independent from style). */
  function buildFormatBar() {
    const bar = document.getElementById('qrFormatBar');
    if (!bar) return;
    bar.innerHTML = '';
    Object.values(FORMATS).forEach(f => {
      const b = document.createElement('button');
      b.type = 'button';
      const active = designState.formatId === f.id;
      b.className = 'qr-format-chip' + (active ? ' qr-format-chip--active' : '');
      b.textContent = f.shortLabel || f.id;
      b.title = `${f.label} — ${f.w}×${f.h} mm`;
      b.addEventListener('click', () => {
        designState.formatId = f.id;
        buildFormatBar();
        updatePreviewChrome();
        renderPreview();
        track('admin_qr_format', { format_id: f.id.slice(0, 24), source: 'chip' });
      });
      bar.appendChild(b);
    });
  }

  function populateSavedSelect() {
    const sel = document.getElementById('qrSavedSelect');
    if (!sel) return;
    const cur = sel.value;
    sel.innerHTML = '<option value="">— Load saved —</option>';
    listCustoms().forEach(c => {
      const o = document.createElement('option');
      o.value = c.id;
      o.textContent = c.name;
      sel.appendChild(o);
    });
    if (cur && [...sel.options].some(o => o.value === cur)) sel.value = cur;
  }

  function wireEditorPanel() {
    const zoneSel = document.getElementById('qrZoneSelect');

    if (zoneSel && !zoneSel.dataset.bound) {
      zoneSel.dataset.bound = '1';
      zoneSel.innerHTML = ZONES.map(z => `<option value="${esc(z.id)}">${esc(z.label)}</option>`).join('');
      zoneSel.addEventListener('change', () => fillZoneEditor(zoneSel.value));
    }

    document.getElementById('qrBtnEditToggle')?.addEventListener('click', () => {
      editMode = !editMode;
      const p = document.getElementById('qrEditorPanel');
      const b = document.getElementById('qrBtnEditToggle');
      if (p) p.classList.toggle('hidden', !editMode);
      if (b) b.textContent = editMode ? 'Done editing' : 'Edit layout';
      renderPreview();
      if (editMode) fillZoneEditor(zoneSel ? zoneSel.value : 'title');
      track('admin_qr_edit_toggle', { on: editMode ? 1 : 0 });
    });

    document.getElementById('qrTextTitle')?.addEventListener('input', e => {
      designState.text.title = e.target.value;
      renderPreview();
    });
    document.getElementById('qrTextSubtitle')?.addEventListener('input', e => {
      designState.text.subtitle = e.target.value;
      renderPreview();
    });

    document.getElementById('qrBtnSaveCustom')?.addEventListener('click', () => {
      const name = (document.getElementById('qrCustomName')?.value || '').trim() || 'My layout';
      const entry = snapshotDesign(name);
      persistCustom(entry);
      populateSavedSelect();
      document.getElementById('qrSavedSelect').value = entry.id;
      const t = document.getElementById('toast');
      if (t) {
        t.textContent = 'Saved “' + name + '” on this device.';
        t.className = 'toast success';
        setTimeout(() => { t.className = 'toast hidden'; }, 3200);
      }
      track('admin_qr_custom_save', { name: name.slice(0, 60) });
    });

    document.getElementById('qrSavedSelect')?.addEventListener('change', e => {
      const id = e.target.value;
      if (!id) return;
      const list = listCustoms();
      const found = list.find(x => x.id === id);
      if (found) applySnapshot(found);
      track('admin_qr_custom_load', {});
    });

    document.getElementById('qrBtnDeleteCustom')?.addEventListener('click', () => {
      const sel = document.getElementById('qrSavedSelect');
      const id = sel && sel.value;
      if (!id) return;
      deleteCustom(id);
      populateSavedSelect();
      showToastLocal('Layout removed from this device.');
      track('admin_qr_custom_delete', {});
    });

    document.getElementById('qrBtnRefresh')?.addEventListener('click', () => {
      track('admin_qr_regenerate', {});
      renderPreview();
    });
  }

  function init(opts) {
    getRestaurant = opts.getRestaurant;
    getMenuUrlFn  = opts.getMenuUrl;
    uploadSheetBackgroundFn = typeof opts.uploadSheetBackground === 'function' ? opts.uploadSheetBackground : null;

    wireEditorPanel();
    syncEditorControlsFromState();
    buildStarterPicker();
    buildFormatBar();
    populateSavedSelect();

    const btnPrt = document.getElementById('qrBtnPrint');
    if (btnPrt && !btnPrt.dataset.bound) {
      btnPrt.dataset.bound = '1';
      btnPrt.addEventListener('click', printSelected);
    }

    renderPreview();
  }

  function refresh() {
    populateSavedSelect();
    updatePreviewChrome();
    buildFormatBar();
    renderPreview();
  }

  /** @deprecated No bundled presets — use style + paper size independently. */
  const PRESETS = [];

  window.AdminQrFlyers = { init, refresh, STARTERS, FORMATS, PRESETS };
})(window);
