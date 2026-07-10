/* ==========================================================================
   LINER TRADING PLC — Shared app utilities
   Loaded on every page. Holds product data, nav/menu behavior, the
   business-hours "open now" check, and small reusable UI helpers
   (modal, accordion, toast, reveal-on-scroll) used by page-specific JS.
   ========================================================================== */

window.LINER = (function () {

  /* ---- Company config (edit these before going live) ---- */
  const COMPANY = {
    name: 'Liner Trading PLC',
    tagline: 'Where Trade Meets Trust',
    founded: 2015,
    address: {
      line1: 'Garamuleta Building, 1st Floor',
      line2: 'Ethio-China Street, Wello Sefer',
      city: 'Addis Ababa, Ethiopia',
      lat: 8.9918366,
      lng: 38.7736969,
    },
    phone: { display: '+251 93 600 8676', tel: '+251936008676', local: '093 600 8676' },
    email: 'linertradingplc@gmail.com',
    supportEmail: 'linertradingplc@gmail.com',
  };

  /* ---- Business hours (24h "HH:MM"), keyed 0=Sun..6=Sat, in Africa/Addis_Ababa (EAT, UTC+3, no DST) ----
     CONFIRMED from the public listing: opens 8:30 AM Monday. Tue–Sat times below are a
     typical-week placeholder — confirm the real schedule and edit this object. */
  const BUSINESS_HOURS = {
    0: null,
    1: { open: '08:30', close: '17:30' },
    2: { open: '08:30', close: '17:30' },
    3: { open: '08:30', close: '17:30' },
    4: { open: '08:30', close: '17:30' },
    5: { open: '08:30', close: '17:30' },
    6: { open: '08:30', close: '13:00' },
  };

  function nowInAddis() {
    const utcMs = Date.now() + new Date().getTimezoneOffset() * 60000;
    return new Date(utcMs + 3 * 60 * 60000); // EAT = UTC+3, fixed offset, no DST
  }

  function getOpenStatus() {
    const now = nowInAddis();
    const day = now.getDay();
    const hm = now.getHours() * 60 + now.getMinutes();
    const toMin = (s) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
    const today = BUSINESS_HOURS[day];
    if (today && hm >= toMin(today.open) && hm < toMin(today.close)) {
      return { open: true, text: `Open now · Closes ${formatTime(today.close)}` };
    }
    for (let i = 1; i <= 7; i++) {
      const d = (day + i) % 7;
      const sched = BUSINESS_HOURS[d];
      if (sched) {
        const label = i === 1 ? 'tomorrow' : DAY_NAMES[d];
        return { open: false, text: `Closed · Opens ${formatTime(sched.open)} ${label}` };
      }
    }
    return { open: false, text: 'Closed' };
  }

  const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  function formatTime(s) {
    const [h, m] = s.split(':').map(Number);
    const period = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return m === 0 ? `${h12} ${period}` : `${h12}:${String(m).padStart(2, '0')} ${period}`;
  }

  /* ---- Product catalog — loaded from Airtable via a serverless proxy, so the
     Airtable token never reaches the browser (see netlify/functions/products.js).
     Consumers must `await window.LINER.ready` before reading PRODUCTS/CATEGORIES,
     since the fetch happens asynchronously. If the function is unreachable
     (e.g. previewing the raw files without `netlify dev`, or a network hiccup),
     this falls back to a small built-in set so the catalog is never just blank. ---- */
  const AIRTABLE_FUNCTION_URL = '/.netlify/functions/products';

  const FALLBACK_PRODUCTS = [
    { slug: 'green-coffee', name: 'Green Coffee Beans (Arabica)', category: 'Cash Crop', hs: '0901.11', hsDesc: 'Coffee, not roasted, not decaffeinated', pack: '60 kg jute bags, 320 bags/20ft', cbmPerCarton: 0.083, weightPerCarton: 60, moq: '1 x 20ft container (≈19.2 MT)', spec: { Moisture: '≤ 12%', Origin: 'Yirgacheffe, Sidamo, Guji' } },
    { slug: 'chickpeas', name: 'Chickpeas (Kabuli & Desi)', category: 'Pulses', hs: '0713.20', hsDesc: 'Dried, shelled chickpeas (garbanzos)', pack: '50 kg PP bags, 20/pallet', cbmPerCarton: 0.072, weightPerCarton: 50, moq: '25 MT', spec: { Moisture: '≤ 14%', Admixture: '≤ 1%' } },
    { slug: 'red-kidney-beans', name: 'Red Kidney Beans', category: 'Pulses', hs: '0713.33', hsDesc: 'Kidney beans, incl. white pea beans (Phaseolus vulgaris)', pack: '50 kg PP bags, 20/pallet', cbmPerCarton: 0.072, weightPerCarton: 50, moq: '25 MT', spec: { Moisture: '≤ 14%', Purity: '≥ 98%' } },
    { slug: 'iodized-salt', name: 'Iodized Salt', category: 'Industrial', hs: '2501.00', hsDesc: 'Salt, incl. table salt and denatured salt', pack: '25 & 50 kg PP bags', cbmPerCarton: 0.04, weightPerCarton: 50, moq: '25 MT', spec: { Source: 'Semera Industrial Park, Afar Region' } },
  ];
  const USING_FALLBACK_NOTE = 'Showing a small built-in sample list — the live Airtable catalog could not be reached right now.';

  let PRODUCTS = [];
  let CATEGORIES = ['All'];
  let productSource = 'loading';

  function computeCategories() {
    CATEGORIES = ['All', ...Array.from(new Set(PRODUCTS.map(p => p.category)))];
  }

  async function loadProducts() {
    try {
      const res = await fetch(AIRTABLE_FUNCTION_URL);
      if (!res.ok) throw new Error(`Function returned HTTP ${res.status}`);
      const data = await res.json();
      if (!Array.isArray(data) || !data.length) throw new Error('Airtable returned no records');
      PRODUCTS = data;
      productSource = 'airtable';
    } catch (err) {
      console.warn('[Airtable] Falling back to the built-in product list:', err.message);
      PRODUCTS = FALLBACK_PRODUCTS;
      productSource = 'fallback';
    }
    computeCategories();
    return { source: productSource };
  }

  // Kicked off immediately (not waiting for DOMContentLoaded) so the fetch runs
  // in parallel with page parsing. Every page that reads PRODUCTS/CATEGORIES
  // must `await window.LINER.ready` first — see products.js / rfq.js.
  const ready = loadProducts();

  function getProduct(slug) { return PRODUCTS.find(p => p.slug === slug) || null; }

  /* ---- Nav (shared markup + mobile toggle) ---- */
  function initNav() {
    const toggle = document.querySelector('.nav-toggle');
    const links = document.querySelector('.nav-links');
    if (toggle && links) {
      toggle.addEventListener('click', () => {
        const open = links.classList.toggle('is-open');
        toggle.setAttribute('aria-expanded', String(open));
      });
    }
    const path = location.pathname.split('/').pop() || 'index.html';
    document.querySelectorAll('.nav-links a').forEach(a => {
      if (a.getAttribute('href') === path) a.classList.add('active');
    });
    const yearEls = document.querySelectorAll('[data-year]');
    yearEls.forEach(el => { el.textContent = new Date().getFullYear(); });
  }

  /* ---- Business-hours badge (footer + contact page) ---- */
  function initHoursBadge() {
    document.querySelectorAll('[data-hours-badge]').forEach(el => {
      const status = getOpenStatus();
      el.textContent = status.text;
      el.classList.toggle('is-open-badge', status.open);
    });
  }

  /* ---- Reveal-on-scroll (restrained: one fade+rise, respects reduced motion) ---- */
  function initReveal() {
    const items = document.querySelectorAll('.reveal');
    if (!('IntersectionObserver' in window) || !items.length) {
      items.forEach(el => el.classList.add('is-visible'));
      return;
    }
    const obs = new IntersectionObserver((entries) => {
      entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('is-visible'); obs.unobserve(e.target); } });
    }, { threshold: 0.12 });
    items.forEach(el => obs.observe(el));
  }

  /* ---- Accordion (used by Trade Tools + Compliance pages) ---- */
  function initAccordions(root = document) {
    root.querySelectorAll('.accordion-trigger').forEach(btn => {
      btn.addEventListener('click', () => {
        const panel = document.getElementById(btn.getAttribute('aria-controls'));
        const isOpen = btn.getAttribute('aria-expanded') === 'true';
        btn.setAttribute('aria-expanded', String(!isOpen));
        if (!panel) return;
        panel.style.maxHeight = isOpen ? '0px' : panel.scrollHeight + 'px';
      });
    });
  }

  /* ---- Modal (spec sheets, certificate previews, document previews) ---- */
  let modalOverlay;
  function ensureModal() {
    if (modalOverlay) return modalOverlay;
    modalOverlay = document.createElement('div');
    modalOverlay.className = 'modal-overlay';
    modalOverlay.innerHTML = `<div class="modal" role="dialog" aria-modal="true"><button class="modal-close" aria-label="Close">✕</button><div class="modal-body"></div></div>`;
    document.body.appendChild(modalOverlay);
    modalOverlay.addEventListener('click', (e) => { if (e.target === modalOverlay) closeModal(); });
    modalOverlay.querySelector('.modal-close').addEventListener('click', closeModal);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });
    return modalOverlay;
  }
  function openModal(html) {
    const el = ensureModal();
    el.querySelector('.modal-body').innerHTML = html;
    el.classList.add('is-open');
  }
  function closeModal() { if (modalOverlay) modalOverlay.classList.remove('is-open'); }

  /* ---- Toast ---- */
  function toast(message) {
    let el = document.querySelector('.toast');
    if (!el) { el = document.createElement('div'); el.className = 'toast'; document.body.appendChild(el); }
    el.textContent = message;
    el.classList.add('is-visible');
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove('is-visible'), 3200);
  }

  /* ---- Mailto builder (works with zero backend; RFQ/contact forms use this as the
     guaranteed-functional path, alongside an optional webhook — see rfq.js) ---- */
  function buildMailto(to, subject, bodyLines) {
    const body = bodyLines.join('\n');
    return `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }

  function qs(sel, root = document) { return root.querySelector(sel); }
  function qsa(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }

  document.addEventListener('DOMContentLoaded', () => {
    initNav();
    initHoursBadge();
    initReveal();
  });

  return {
    COMPANY,
    get PRODUCTS() { return PRODUCTS; },
    get CATEGORIES() { return CATEGORIES; },
    get isUsingFallbackProducts() { return productSource === 'fallback'; },
    USING_FALLBACK_NOTE,
    ready,
    getProduct, getOpenStatus, initAccordions, openModal, closeModal, toast, buildMailto, qs, qsa,
  };
})();
