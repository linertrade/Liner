/* ==========================================================================
   RFQ Engine — structured quote request form.
   No backend is assumed, so submission has two real, working paths:
   1) "Email This Request" — opens a prefilled mailto: with the full structured
      data (works everywhere, zero setup).
   2) An optional CRM_WEBHOOK_URL below — if set, the same payload POSTs to
      Zapier/Make/HubSpot/a Google Sheet/etc. so requests land in a pipeline
      automatically instead of an inbox. Leave blank to skip this silently.
   ========================================================================== */

(function () {
  // TODO: point this at your CRM/automation webhook (Zapier, Make, HubSpot
  // forms, a Google Apps Script endpoint...) to pipe RFQs straight into your
  // sales pipeline. Leave empty and the form still works via email.
  const CRM_WEBHOOK_URL = '';

  const INCOTERMS = ['EXW', 'FCA', 'FAS', 'FOB', 'CFR', 'CIF', 'CPT', 'CIP', 'DAP', 'DPU', 'DDP'];

  function populateProductSelect(select) {
    select.innerHTML = '<option value="">Select a product…</option>' +
      window.LINER.PRODUCTS.map(p => `<option value="${p.slug}">${p.name} — HS ${p.hs}</option>`).join('') +
      '<option value="other">Other / not listed</option>';
  }

  function populateIncotermSelect(select) {
    select.innerHTML = '<option value="">Select Incoterm…</option>' +
      INCOTERMS.map(code => `<option value="${code}">${code}</option>`).join('');
  }

  function prefillFromQuery(form) {
    const params = new URLSearchParams(location.search);
    const slug = params.get('product');
    if (!slug) return;
    const select = form.querySelector('[name="product"]');
    if (select && [...select.options].some(o => o.value === slug)) {
      select.value = slug;
      const p = window.LINER.getProduct(slug);
      if (p) window.LINER.toast(`Prefilled for ${p.name}`);
    }
  }

  function validate(form) {
    let valid = true;
    window.LINER.qsa('[required]', form).forEach(field => {
      const wrap = field.closest('.field');
      const empty = !field.value || !field.value.trim();
      if (wrap) wrap.classList.toggle('has-error', empty);
      if (empty) valid = false;
    });
    return valid;
  }

  function summaryHTML(data, product) {
    const rows = [
      ['Company', data.company],
      ['Contact', `${data.name} · ${data.email}${data.phone ? ' · ' + data.phone : ''}`],
      ['Country', data.country],
      ['Product', product ? `${product.name} (HS ${product.hs})` : (data.productOther || 'Not specified')],
      ['Quantity', `${data.quantity} ${data.unit}`],
      ['Incoterm', data.incoterm],
      ['Shipping method', data.shipping],
      ['Destination port / city', data.destination],
      ['Target shipment date', data.shipDate || '—'],
      ['Packaging / labeling notes', data.packaging || '—'],
      ['Additional notes', data.notes || '—'],
    ];
    return `
      <div class="sample-doc" style="border-color:var(--line);">
        <div class="sample-doc-inner">
          <span class="sample-flag" style="background:var(--steel);">Quote request summary</span>
          <div class="table-wrap mb-24">
            <table>${rows.map(([k, v]) => `<tr><th style="width:220px;">${k}</th><td>${escapeHTML(String(v))}</td></tr>`).join('')}</table>
          </div>
          <p class="small muted mb-24 no-print">Our trade team will review this and follow up with pricing and next steps.</p>
          <div class="flex gap-12 no-print" style="flex-wrap:wrap;">
            <a class="btn btn-primary btn-sm" id="rfq-email-btn" href="#">Email This Request</a>
            <button class="btn btn-outline btn-sm" onclick="window.print()">Print / Save as PDF</button>
          </div>
        </div>
      </div>`;
  }

  function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function buildEmailLines(data, product) {
    return [
      `New RFQ from ${data.company}`,
      '',
      `Contact: ${data.name} (${data.email}${data.phone ? ', ' + data.phone : ''})`,
      `Country: ${data.country}`,
      `Product: ${product ? `${product.name} — HS ${product.hs}` : (data.productOther || 'Not specified')}`,
      `Quantity: ${data.quantity} ${data.unit}`,
      `Incoterm: ${data.incoterm}`,
      `Shipping method: ${data.shipping}`,
      `Destination: ${data.destination}`,
      `Target shipment date: ${data.shipDate || 'Not specified'}`,
      `Packaging / labeling notes: ${data.packaging || 'None'}`,
      `Additional notes: ${data.notes || 'None'}`,
    ];
  }

  async function maybeSendToWebhook(payload) {
    if (!CRM_WEBHOOK_URL) return;
    try {
      await fetch(CRM_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (err) {
      // Deliberately silent to the buyer — the mailto path already guarantees
      // delivery. Surface this in your own error tracking if you wire one up.
      console.warn('RFQ webhook did not complete:', err);
    }
  }

  async function initRfqForm() {
    const form = document.getElementById('rfq-form');
    if (!form) return;
    const productSelect = form.querySelector('[name="product"]');
    const incotermSelect = form.querySelector('[name="incoterm"]');
    const submitBtn = form.querySelector('button[type="submit"]');

    populateIncotermSelect(incotermSelect);
    productSelect.innerHTML = '<option value="">Loading products…</option>';
    submitBtn.disabled = true;

    await window.LINER.ready;

    populateProductSelect(productSelect);
    prefillFromQuery(form);
    submitBtn.disabled = false;
    if (window.LINER.isUsingFallbackProducts) {
      window.LINER.toast('Showing a small sample list — the live catalog is temporarily unavailable.');
    }

    const otherWrap = document.getElementById('product-other-wrap');
    productSelect.addEventListener('change', () => {
      otherWrap.style.display = productSelect.value === 'other' ? 'block' : 'none';
    });

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!validate(form)) { window.LINER.toast('Please fill in the highlighted fields.'); return; }

      const fd = new FormData(form);
      const data = Object.fromEntries(fd.entries());
      const product = data.product && data.product !== 'other' ? window.LINER.getProduct(data.product) : null;

      const resultEl = document.getElementById('rfq-result');
      resultEl.innerHTML = summaryHTML(data, product);
      resultEl.scrollIntoView({ behavior: 'smooth', block: 'start' });

      const mailto = window.LINER.buildMailto(window.LINER.COMPANY.email, `RFQ — ${data.company}`, buildEmailLines(data, product));
      document.getElementById('rfq-email-btn').setAttribute('href', mailto);

      maybeSendToWebhook({ ...data, hsCode: product ? product.hs : null, submittedAt: new Date().toISOString() });
    });
  }

  document.addEventListener('DOMContentLoaded', initRfqForm);
})();
