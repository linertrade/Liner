/* ==========================================================================
   Products page — renders the catalog from window.LINER.PRODUCTS, filters by
   category, and shows a print-friendly spec sheet in the shared modal.
   "Request Quote" hands off to rfq.html?product=slug, which prefills the RFQ form.
   ========================================================================== */

(function () {
  function specRows(product) {
    return Object.entries(product.spec).map(([label, v]) => `<tr><th>${label}</th><td>${v}</td></tr>`).join('');
  }

  function openSpecSheet(product) {
    const html = `
      <div class="sample-doc">
        <div class="sample-doc-inner">
          <span class="sample-flag">Sample spec sheet — confirm with QA before quoting</span>
          <div class="flex justify-between items-center mb-16" style="flex-wrap:wrap;gap:10px;">
            <h3 class="mt-0">${product.name}</h3>
            <span class="hs-badge">${product.hs}</span>
          </div>
          <p class="small muted mb-24">${product.hsDesc}</p>
          <div class="table-wrap mb-24">
            <table>
              <tr><th>Category</th><td>${product.category}</td></tr>
              <tr><th>Standard packaging</th><td>${product.pack}</td></tr>
              <tr><th>Est. volume</th><td class="mono">${product.cbmPerCarton} CBM / carton or bag</td></tr>
              <tr><th>Est. weight</th><td class="mono">${product.weightPerCarton} kg / carton or bag</td></tr>
              <tr><th>Typical MOQ</th><td>${product.moq}</td></tr>
              ${specRows(product)}
            </table>
          </div>
          <div class="flex gap-12 no-print" style="flex-wrap:wrap;">
            <button class="btn btn-outline btn-sm" onclick="window.print()">Print / Save as PDF</button>
            <a class="btn btn-primary btn-sm" href="rfq.html?product=${product.slug}">Request Quote</a>
          </div>
        </div>
      </div>`;
    window.LINER.openModal(html);
  }

  function cardHTML(p) {
    return `
      <div class="card card-hover">
        <div class="flex justify-between items-center mb-8" style="flex-wrap:wrap;gap:8px;">
          <span class="tag">${p.category}</span>
          <span class="hs-badge">${p.hs}</span>
        </div>
        <h3 style="font-size:1.15rem;margin-bottom:10px;">${p.name}</h3>
        <p class="small muted mb-16">${p.hsDesc}</p>
        <div class="grid grid-2 small mb-24" style="gap:10px;">
          <div><span class="field-label">Packaging</span><span class="field-value" style="font-size:0.82rem;">${p.pack}</span></div>
          <div><span class="field-label">Typical MOQ</span><span class="field-value" style="font-size:0.82rem;">${p.moq}</span></div>
        </div>
        <div class="flex gap-12" style="flex-wrap:wrap;">
          <button class="btn btn-outline btn-sm" data-spec="${p.slug}">View Spec Sheet</button>
          <a class="btn btn-primary btn-sm" href="rfq.html?product=${p.slug}">Request Quote</a>
        </div>
      </div>`;
  }

  function render(list, grid) {
    grid.innerHTML = list.length
      ? list.map(cardHTML).join('')
      : `<p class="muted">No products in this category yet — try "All" or <a href="rfq.html" style="text-decoration:underline;">send us a custom request</a>.</p>`;
    window.LINER.qsa('[data-spec]', grid).forEach(btn => {
      btn.addEventListener('click', () => openSpecSheet(window.LINER.getProduct(btn.dataset.spec)));
    });
  }

  async function initFilters() {
    const grid = document.getElementById('product-grid');
    const tabWrap = document.getElementById('category-tabs');
    const fallbackNote = document.getElementById('fallback-note');
    if (!grid || !tabWrap) return;

    grid.innerHTML = `<p class="muted">Loading catalog…</p>`;
    await window.LINER.ready;

    if (window.LINER.isUsingFallbackProducts && fallbackNote) {
      fallbackNote.textContent = window.LINER.USING_FALLBACK_NOTE;
      fallbackNote.style.display = 'flex';
    }

    tabWrap.innerHTML = window.LINER.CATEGORIES.map((c, i) =>
      `<button class="btn ${i === 0 ? 'btn-ink' : 'btn-outline'} btn-sm" data-cat="${c}">${c}</button>`
    ).join('');

    render(window.LINER.PRODUCTS, grid);

    tabWrap.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-cat]');
      if (!btn) return;
      window.LINER.qsa('[data-cat]', tabWrap).forEach(b => b.classList.remove('btn-ink'));
      window.LINER.qsa('[data-cat]', tabWrap).forEach(b => { if (!b.classList.contains('btn-ink')) b.classList.add('btn-outline'); });
      btn.classList.add('btn-ink');
      btn.classList.remove('btn-outline');
      const cat = btn.dataset.cat;
      render(cat === 'All' ? window.LINER.PRODUCTS : window.LINER.PRODUCTS.filter(p => p.category === cat), grid);
    });
  }

  document.addEventListener('DOMContentLoaded', initFilters);
})();
