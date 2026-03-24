/**
 * admin/qr-flyers.js — A4 QR flyer templates + print (uses global QRious from CDN)
 */
(function (window) {
  'use strict';

  const SERVICE = {
    brand:     'e-Menu',
    phone:     '+359 898 513 566',
    email:     'denistiano@gmail.com',
    lineBg:    'Дигитално меню, QR код и админ панел за вашия ресторант.',
    lineEn:    'Digital menu, QR codes & admin for your restaurant.'
  };

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

  /* ── Shared print + base sheet styles (injected into print window) ── */
  const PRINT_CSS = `
    @page { size: A4; margin: 10mm; }
    * { box-sizing: border-box; }
    body { margin: 0; background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .qr-sheet {
      width: 210mm;
      min-height: 277mm;
      padding: 12mm 14mm;
      margin: 0 auto;
      font-family: 'Inter', system-ui, sans-serif;
      color: #3d3d3d;
      position: relative;
    }
    .qr-sheet__qr {
      display: block;
      width: 46mm;
      height: 46mm;
      margin: 0 auto;
      image-rendering: pixelated;
    }
  `;

  function forkKnifeRow() {
    return `
      <div style="display:flex;justify-content:space-between;align-items:flex-end;padding:0 8mm 6mm;">
        <svg width="22" height="52" viewBox="0 0 22 52" fill="none" aria-hidden="true" style="opacity:.45">
          <path d="M6 2v14M10 2v14M6 16v34" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
        </svg>
        <svg width="22" height="52" viewBox="0 0 22 52" fill="none" aria-hidden="true" style="opacity:.45">
          <path d="M11 2v50M8 8h6M8 14h6M8 20h6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
        </svg>
      </div>`;
  }

  function buildClassic(d) {
    const bg = '#f4f2eb';
    return `
      <div class="qr-sheet" style="background:${bg};background-image:radial-gradient(rgba(0,0,0,.025) 1px,transparent 1px);background-size:4px 4px;">
        ${forkKnifeRow()}
        <h1 style="font-family:'Great Vibes',cursive;font-size:42px;font-weight:400;text-align:center;color:#5c5c5c;margin:0 0 4mm;line-height:1.1;">${esc(d.nameLine)}</h1>
        <svg viewBox="0 0 400 24" style="width:72%;height:16px;margin:0 auto 5mm;display:block;opacity:.35" preserveAspectRatio="none">
          <path d="M0 18 Q 200 4 400 18" fill="none" stroke="currentColor" stroke-width="1.2"/>
        </svg>
        <p style="text-align:center;font-size:11px;letter-spacing:.28em;text-transform:uppercase;color:#6a6a6a;margin:0 0 2mm;font-weight:600;">Сканирайте за менюто</p>
        <p style="text-align:center;font-size:10px;letter-spacing:.22em;text-transform:uppercase;color:#888;margin:0 0 8mm;">Scan for the menu</p>
        <div style="border:2px dashed #b8b4a8;border-radius:10px;padding:7mm 6mm;max-width:62mm;margin:0 auto 6mm;text-align:center;background:rgba(255,255,255,.35);">
          <img class="qr-sheet__qr" src="${esc(d.qrDataUrl)}" alt=""/>
        </div>
        <p style="text-align:center;font-size:12px;color:#666;line-height:1.5;margin:0 0 10mm;max-width:160mm;margin-left:auto;margin-right:auto;">${esc(d.hintLine)}</p>
        <div style="border-top:1px solid #c9c5bb;padding-top:5mm;margin-top:auto;">
          <p style="text-align:center;font-size:10px;color:#888;margin:0 0 2mm;">${esc(d.descLine)}</p>
          <p style="text-align:center;font-size:9px;color:#999;margin:0 0 4mm;">Powered by <strong>${esc(SERVICE.brand)}</strong> · ${esc(SERVICE.lineBg)}</p>
          <p style="text-align:center;font-size:11px;font-weight:600;color:#444;margin:0;">${esc(SERVICE.phone)} · ${esc(SERVICE.email)}</p>
        </div>
      </div>`;
  }

  function buildFine(d) {
    return `
      <div class="qr-sheet" style="background:linear-gradient(180deg,#faf9f7 0%,#f0ebe3 100%);border:1px solid #d9d3c8;">
        <div style="text-align:center;padding:4mm 0 2mm;">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" style="opacity:.4;margin-bottom:3mm" aria-hidden="true">
            <path d="M8 22h8M12 15v7M9 2h6l-1 8h-4L9 2z" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <h1 style="font-family:'Cormorant Garamond',Georgia,serif;font-size:38px;font-weight:600;color:#2c2c2c;margin:0;letter-spacing:.02em;">${esc(d.nameLine)}</h1>
          <p style="font-family:'Cormorant Garamond',Georgia,serif;font-size:15px;font-style:italic;color:#666;margin:3mm 0 0;">${esc(d.tagline)}</p>
        </div>
        <div style="width:50mm;height:1px;background:linear-gradient(90deg,transparent,#8a7a68,transparent);margin:6mm auto;"></div>
        <p style="text-align:center;font-size:10px;letter-spacing:.25em;text-transform:uppercase;color:#7a6f62;margin:0 0 8mm;">Digital menu</p>
        <div style="text-align:center;padding:5mm;border:1px solid #c4b8a8;border-radius:2px;max-width:58mm;margin:0 auto 8mm;background:#fff;">
          <img class="qr-sheet__qr" src="${esc(d.qrDataUrl)}" alt=""/>
        </div>
        <p style="text-align:center;font-size:12px;color:#555;max-width:150mm;margin:0 auto 12mm;line-height:1.55;">${esc(d.hintLine)}</p>
        <div style="margin-top:auto;padding-top:6mm;border-top:1px solid #d9d3c8;">
          <p style="text-align:center;font-size:10px;color:#888;margin:0 0 3mm;">${esc(SERVICE.lineEn)}</p>
          <p style="text-align:center;font-family:'Cormorant Garamond',serif;font-size:14px;font-weight:600;color:#3a342c;">${esc(SERVICE.brand)} · ${esc(SERVICE.phone)}</p>
          <p style="text-align:center;font-size:11px;color:#666;margin:2mm 0 0;">${esc(SERVICE.email)}</p>
        </div>
      </div>`;
  }

  function buildFamily(d) {
    return `
      <div class="qr-sheet" style="background:#fffaf3;border-radius:0;">
        <div style="display:flex;justify-content:center;gap:14px;padding:5mm 0 3mm;opacity:.5;">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none"><path d="M18 8h1a4 4 0 0 1 0 8h-1M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z" stroke="currentColor" stroke-width="1.4"/></svg>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="7" r="3" stroke="currentColor" stroke-width="1.4"/><path d="M5 21v-2a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v2" stroke="currentColor" stroke-width="1.4"/></svg>
        </div>
        <h1 style="font-family:'Nunito',sans-serif;font-size:32px;font-weight:700;text-align:center;color:#4a4038;margin:0 0 3mm;">${esc(d.nameLine)}</h1>
        <p style="text-align:center;font-family:'Nunito',sans-serif;font-size:14px;color:#7a6b5c;margin:0 0 8mm;font-weight:500;">${esc(d.tagline)}</p>
        <p style="text-align:center;font-size:12px;color:#8a7d6f;margin:0 0 6mm;">Сканирай с телефона · Scan with your phone</p>
        <div style="background:#fff;border:3px solid #e8dfd0;border-radius:20px;padding:6mm;max-width:64mm;margin:0 auto 8mm;box-shadow:0 8px 24px rgba(74,64,56,.08);">
          <img class="qr-sheet__qr" src="${esc(d.qrDataUrl)}" alt=""/>
        </div>
        <p style="text-align:center;font-size:13px;color:#5c534c;line-height:1.5;max-width:155mm;margin:0 auto 10mm;">${esc(d.hintLine)}</p>
        <div style="background:#efe6d8;border-radius:14px;padding:5mm 6mm;text-align:center;">
          <p style="font-size:11px;color:#6a5f54;margin:0 0 2mm;font-weight:600;">Нуждаете се от е-меню?</p>
          <p style="font-size:10px;color:#7a6f66;margin:0 0 3mm;">${esc(SERVICE.lineBg)}</p>
          <p style="font-size:12px;font-weight:700;color:#3d3530;">${esc(SERVICE.phone)}</p>
          <p style="font-size:11px;color:#5a5048;margin:1mm 0 0;">${esc(SERVICE.email)}</p>
        </div>
      </div>`;
  }

  function buildTerrace(d) {
    return `
      <div class="qr-sheet" style="background:linear-gradient(165deg,#fff9e6 0%,#f5ecd8 45%,#faf6ef 100%);">
        <div style="text-align:center;padding-top:2mm;">
          <svg width="44" height="44" viewBox="0 0 24 24" fill="none" style="opacity:.55;color:#c9a227" aria-hidden="true">
            <circle cx="12" cy="12" r="5" stroke="currentColor" stroke-width="1.3"/>
            <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.93 4.93l2.12 2.12M16.95 16.95l2.12 2.12M4.93 19.07l2.12-2.12M16.95 7.05l2.12-2.12" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
          </svg>
        </div>
        <h1 style="font-family:'Playfair Display',Georgia,serif;font-size:34px;font-weight:700;text-align:center;color:#3d3528;margin:4mm 0 2mm;">${esc(d.nameLine)}</h1>
        <p style="text-align:center;font-size:13px;color:#7a6a4a;font-style:italic;margin:0 0 2mm;">${esc(d.tagline)}</p>
        <p style="text-align:center;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#9a8548;margin:0 0 8mm;">Лятно меню · Summer menu</p>
        <div style="border:2px solid #d4c49a;border-radius:8px;padding:5mm;max-width:56mm;margin:0 auto 7mm;background:rgba(255,255,255,.65);">
          <img class="qr-sheet__qr" src="${esc(d.qrDataUrl)}" alt=""/>
        </div>
        <p style="text-align:center;font-size:12px;color:#5c5344;line-height:1.55;max-width:158mm;margin:0 auto 11mm;">${esc(d.hintLine)}</p>
        <div style="border-top:2px solid #e0d4b8;padding-top:5mm;">
          <p style="text-align:center;font-size:10px;color:#8a7a58;margin:0 0 3mm;">${esc(SERVICE.lineEn)}</p>
          <p style="text-align:center;font-size:12px;font-weight:600;color:#4a4030;">${esc(SERVICE.brand)} — ${esc(SERVICE.phone)}</p>
          <p style="text-align:center;font-size:11px;color:#6a5a40;margin-top:2mm;">${esc(SERVICE.email)}</p>
        </div>
      </div>`;
  }

  function buildBistro(d) {
    return `
      <div class="qr-sheet" style="background:#f2f0ec;padding:0;">
        <div style="padding:12mm 14mm 8mm;">
          <div style="display:flex;align-items:center;justify-content:center;gap:10px;margin-bottom:5mm;opacity:.4;">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none"><path d="M9 2v6M12 2v20M15 2v6M9 8h6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
          </div>
          <h1 style="font-family:'Playfair Display',Georgia,serif;font-size:36px;font-weight:700;text-align:center;color:#1e1c1a;margin:0 0 3mm;">${esc(d.nameLine)}</h1>
          <p style="text-align:center;font-size:13px;color:#5a5650;margin:0 0 8mm;">${esc(d.tagline)}</p>
          <p style="text-align:center;font-size:10px;letter-spacing:.2em;text-transform:uppercase;color:#777;margin:0 0 7mm;">Taproom & kitchen · QR menu</p>
          <div style="background:#fff;border:1px solid #c8c4bc;padding:6mm;max-width:58mm;margin:0 auto 8mm;">
            <img class="qr-sheet__qr" src="${esc(d.qrDataUrl)}" alt=""/>
          </div>
          <p style="text-align:center;font-size:12px;color:#444;line-height:1.5;max-width:155mm;margin:0 auto;">${esc(d.hintLine)}</p>
        </div>
        <div style="background:#2a2826;color:#e8e4dc;padding:7mm 14mm;margin-top:8mm;">
          <p style="text-align:center;font-size:10px;letter-spacing:.15em;text-transform:uppercase;color:#a09890;margin:0 0 3mm;">Need a digital menu?</p>
          <p style="text-align:center;font-size:12px;line-height:1.45;margin:0 0 4mm;color:#d0c8c0;">${esc(SERVICE.lineEn)}</p>
          <p style="text-align:center;font-size:14px;font-weight:700;color:#fff;">${esc(SERVICE.phone)}</p>
          <p style="text-align:center;font-size:12px;color:#c5bdb5;margin-top:2mm;">${esc(SERVICE.email)}</p>
          <p style="text-align:center;font-size:10px;color:#8a8580;margin-top:4mm;">${esc(SERVICE.brand)}</p>
        </div>
      </div>`;
  }

  const TEMPLATES = [
    { id: 'classic', label: 'Classic table tent', labelBg: 'Класическа шаблон — маса', build: buildClassic },
    { id: 'fine',    label: 'Fine dining',         labelBg: 'Фино гастрономия',       build: buildFine },
    { id: 'family',  label: 'Family & café',       labelBg: 'Семейно / кафе',         build: buildFamily },
    { id: 'terrace', label: 'Terrace / summer',    labelBg: 'Тераса / лято',          build: buildTerrace },
    { id: 'bistro',  label: 'Bistro & pub',        labelBg: 'Бистро / пъб',           build: buildBistro }
  ];

  let selectedId = 'classic';
  let lastQrUrl = '';
  let getRestaurant = null;
  let getMenuUrlFn  = null;

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
    if (typeof getMenuUrlFn === 'function') return getMenuUrlFn();
    return window.location.href;
  }

  function generateQrDataUrl(url) {
    return new Promise((resolve, reject) => {
      try {
        if (typeof QRious === 'undefined') {
          reject(new Error('QR library not loaded. Check your connection.'));
          return;
        }
        const canvas = document.createElement('canvas');
        new QRious({
          element:   canvas,
          value:     url,
          size:      512,
          padding:   20,
          background: '#ffffff',
          foreground: '#2a2a2a',
          level:     'M'
        });
        resolve(canvas.toDataURL('image/png'));
      } catch (e) {
        reject(e);
      }
    });
  }

  function renderPreview() {
    const host = document.getElementById('qrPreviewHost');
    const status = document.getElementById('qrFlyerStatus');
    if (!host) return;

    const url = (document.getElementById('qrMenuUrl') && document.getElementById('qrMenuUrl').value.trim()) || getMenuUrl();
    lastQrUrl = url;

    status.textContent = 'Generating QR…';

    generateQrDataUrl(url)
      .then(qrDataUrl => {
        const copy = gatherCopy();
        const tpl = TEMPLATES.find(t => t.id === selectedId) || TEMPLATES[0];
        const html = tpl.build({ ...copy, qrDataUrl });
        host.innerHTML = html;
        status.textContent = 'Preview updated.';
        track('admin_qr_preview_ok', {
          restaurant_id: String((getRestaurant && getRestaurant().id) || '').slice(0, 40),
          template_id:   selectedId.slice(0, 40)
        });
      })
      .catch(e => {
        host.innerHTML = `<p class="qr-flyer__err">${esc(e.message)}</p>`;
        status.textContent = 'QR generation failed.';
        track('admin_qr_preview_fail', { error: (e.message || '').slice(0, 100) });
      });
  }

  function printSelected() {
    const url = (document.getElementById('qrMenuUrl') && document.getElementById('qrMenuUrl').value.trim()) || getMenuUrl();
    track('admin_qr_print', {
      restaurant_id: String((getRestaurant && getRestaurant().id) || '').slice(0, 40),
      template_id:   selectedId.slice(0, 40)
    });

    generateQrDataUrl(url)
      .then(qrDataUrl => {
        const copy = gatherCopy();
        const tpl = TEMPLATES.find(t => t.id === selectedId) || TEMPLATES[0];
        const bodyHtml = tpl.build({ ...copy, qrDataUrl });
        const fontLink = 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,600;1,400&family=Great+Vibes&family=Inter:wght@400;500;600&family=Nunito:wght@400;600;700&family=Playfair+Display:wght@400;700&display=swap';
        const w = window.open('', '_blank');
        if (!w) {
          showToastLocal('Pop-up blocked — allow pop-ups to print.');
          return;
        }
        w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"/><title>QR Flyer</title>
          <link rel="stylesheet" href="${fontLink}"/>
          <style>${PRINT_CSS}</style></head><body>${bodyHtml}</body></html>`);
        w.document.close();
        w.focus();
        setTimeout(() => {
          try { w.print(); } catch (_) {}
        }, 400);
      })
      .catch(e => showToastLocal(e.message));
  }

  function showToastLocal(msg) {
    const t = document.getElementById('toast');
    if (t) {
      t.textContent = msg;
      t.className = 'toast error';
      setTimeout(() => { t.className = 'toast hidden'; }, 4000);
    } else {
      alert(msg);
    }
  }

  function buildTemplatePicker() {
    const wrap = document.getElementById('qrTemplatePicker');
    if (!wrap) return;
    wrap.innerHTML = '';
    TEMPLATES.forEach(t => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'qr-tpl-card' + (t.id === selectedId ? ' qr-tpl-card--active' : '');
      btn.dataset.tpl = t.id;
      btn.innerHTML = `<span class="qr-tpl-card__name">${esc(t.label)}</span><span class="qr-tpl-card__bg">${esc(t.labelBg)}</span>`;
      btn.addEventListener('click', () => {
        selectedId = t.id;
        wrap.querySelectorAll('.qr-tpl-card').forEach(b => b.classList.toggle('qr-tpl-card--active', b.dataset.tpl === selectedId));
        track('admin_qr_template_select', { template_id: t.id.slice(0, 40) });
        renderPreview();
      });
      wrap.appendChild(btn);
    });
  }

  function init(opts) {
    getRestaurant = opts.getRestaurant;
    getMenuUrlFn  = opts.getMenuUrl;

    const urlInput = document.getElementById('qrMenuUrl');
    if (urlInput && !urlInput.dataset.bound) {
      urlInput.dataset.bound = '1';
      urlInput.addEventListener('change', () => {
        track('admin_qr_url_change', {});
        renderPreview();
      });
    }

    const btnUpd = document.getElementById('qrBtnUpdate');
    const btnPrt = document.getElementById('qrBtnPrint');
    if (btnUpd && !btnUpd.dataset.bound) {
      btnUpd.dataset.bound = '1';
      btnUpd.addEventListener('click', () => {
        track('admin_qr_regenerate', {});
        renderPreview();
      });
    }
    if (btnPrt && !btnPrt.dataset.bound) {
      btnPrt.dataset.bound = '1';
      btnPrt.addEventListener('click', printSelected);
    }

    buildTemplatePicker();
    renderPreview();
  }

  function refresh() {
    const urlInput = document.getElementById('qrMenuUrl');
    if (urlInput && getMenuUrlFn) {
      urlInput.value = getMenuUrlFn();
    }
    renderPreview();
  }

  window.AdminQrFlyers = { init, refresh, TEMPLATES };
})(window);
