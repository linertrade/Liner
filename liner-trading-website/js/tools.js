/* ==========================================================================
   Trade Tools page — CBM / container calculator + Incoterms 2020 guide.
   The container math was unit-tested standalone before being pasted in here
   (see project notes); it intentionally keeps the same maxKG for every
   container size, because road weight limits — not container volume — are
   usually what caps a dense commodity shipment.
   ========================================================================== */

(function () {
  const CONTAINERS = [
    { key: '20ft', label: '20ft Standard', maxCBM: 28, maxKG: 28000, note: 'Best fit when volume and weight are both moderate.' },
    { key: '40ft', label: '40ft Standard', maxCBM: 58, maxKG: 28000, note: 'Same weight cap as a 20ft — it buys you space, not payload.' },
    { key: '40hc', label: '40ft High Cube', maxCBM: 68, maxKG: 28000, note: 'Extra height for light, bulky cargo — weight cap is unchanged.' },
  ];
  const LCL_THRESHOLD = 15;

  function calcShipment({ length, width, height, quantity, weightPerCarton }) {
    const cbmPerCarton = (length * width * height) / 1_000_000;
    const totalCBM = Math.round(cbmPerCarton * quantity * 1000) / 1000;
    const hasWeight = weightPerCarton != null && weightPerCarton > 0;
    const totalKG = hasWeight ? Math.round(weightPerCarton * quantity * 100) / 100 : null;

    if (totalCBM < LCL_THRESHOLD && (!hasWeight || totalKG <= CONTAINERS[0].maxKG)) {
      return { cbmPerCarton, totalCBM, totalKG, mode: 'LCL', binding: null };
    }

    const byVolume = CONTAINERS.find(c => totalCBM <= c.maxCBM) || null;
    const byWeight = hasWeight ? (CONTAINERS.find(c => totalKG <= c.maxKG) || null) : null;

    if (hasWeight && !byWeight) return { cbmPerCarton, totalCBM, totalKG, mode: 'multi', binding: 'weight-over' };
    if (!byVolume) return { cbmPerCarton, totalCBM, totalKG, mode: 'multi', binding: 'volume-over' };

    if (byWeight) {
      const iVol = CONTAINERS.indexOf(byVolume);
      const iWt = CONTAINERS.indexOf(byWeight);
      if (iWt > iVol) return { cbmPerCarton, totalCBM, totalKG, mode: byWeight.key, binding: 'weight', chosen: byWeight };
      if (iVol > iWt) return { cbmPerCarton, totalCBM, totalKG, mode: byVolume.key, binding: 'volume', chosen: byVolume };
      return { cbmPerCarton, totalCBM, totalKG, mode: byVolume.key, binding: 'balanced', chosen: byVolume };
    }
    return { cbmPerCarton, totalCBM, totalKG, mode: byVolume.key, binding: 'volume', chosen: byVolume };
  }

  function renderResult(result) {
    const { totalCBM, totalKG, mode, binding, chosen } = result;
    const fmt = (n) => n.toLocaleString('en-US', { maximumFractionDigits: 2 });

    if (mode === 'LCL') {
      return `<div class="banner"><span class="banner-icon">→</span><div><strong>LCL — shared container</strong><br>Total volume is ${fmt(totalCBM)} CBM${totalKG ? ` / ${fmt(totalKG)} kg` : ''}. Below ${LCL_THRESHOLD} CBM, booking space in a shared container is usually cheaper than a full container load. Ask us for an LCL rate.</div></div>`;
    }
    if (mode === 'multi') {
      const reason = binding === 'weight-over' ? 'total weight exceeds what any single standard container can carry on the road' : 'total volume exceeds even a 40ft High Cube';
      return `<div class="banner banner-warn"><span class="banner-icon">!</span><div><strong>Multiple containers needed</strong><br>${fmt(totalCBM)} CBM / ${totalKG ? fmt(totalKG) + ' kg' : '—'} — ${reason}. Talk to our logistics team about splitting this into multiple containers or a part-load plan.</div></div>`;
    }

    let bindingNote = '';
    if (binding === 'weight') {
      bindingNote = `This shipment is <strong>weight-constrained</strong>: it would fit the volume of a smaller container, but its weight (${fmt(totalKG)} kg) needs the extra payload allowance of a ${chosen.label}.`;
    } else if (binding === 'volume') {
      bindingNote = totalKG ? `This shipment is <strong>volume-constrained</strong>: at ${fmt(totalKG)} kg it's well under the weight cap, but it needs the extra space of a ${chosen.label}.` : `Estimate based on volume only — add a carton weight for a weight-check too.`;
    } else if (binding === 'balanced') {
      bindingNote = `Volume and weight fill this container to a similar degree — a well-balanced load.`;
    }

    return `
      <div class="banner"><span class="banner-icon">✓</span><div>
        <strong>${chosen.label} recommended</strong><br>
        ${fmt(totalCBM)} CBM${totalKG ? ` · ${fmt(totalKG)} kg` : ''} — ${Math.round((totalCBM / chosen.maxCBM) * 100)}% of volume capacity${totalKG ? `, ${Math.round((totalKG / chosen.maxKG) * 100)}% of weight capacity` : ''}.<br>
        <span class="small muted">${bindingNote}</span>
      </div></div>`;
  }

  function initCbmCalculator(form, outputEl) {
    if (!form) return;
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const data = new FormData(form);
      const length = parseFloat(data.get('length'));
      const width = parseFloat(data.get('width'));
      const height = parseFloat(data.get('height'));
      const quantity = parseInt(data.get('quantity'), 10);
      const weightPerCarton = data.get('weight') ? parseFloat(data.get('weight')) : null;

      if ([length, width, height, quantity].some(v => !v || v <= 0)) {
        outputEl.innerHTML = `<div class="banner banner-warn"><span class="banner-icon">!</span><div>Enter carton length, width, height and quantity — all must be greater than zero.</div></div>`;
        return;
      }
      const result = calcShipment({ length, width, height, quantity, weightPerCarton });
      outputEl.innerHTML = renderResult(result);
    });
  }

  /* ---- Incoterms 2020 data (11 rules; verified against ICC guidance) ---- */
  const INCOTERMS = {
    any: [
      { code: 'EXW', name: 'Ex Works', risk: 'At seller\'s premises, before loading', seller: 'Makes goods available at their own site.', buyer: 'Everything from pickup onward: export clearance, all carriage, import, insurance.', bar: 5 },
      { code: 'FCA', name: 'Free Carrier', risk: 'Once handed to the buyer\'s nominated carrier', seller: 'Export clearance, delivery to the named carrier or place.', buyer: 'Main carriage, import clearance, insurance if wanted.', bar: 22 },
      { code: 'CPT', name: 'Carriage Paid To', risk: 'Once handed to the first carrier (not at destination)', seller: 'Pays carriage to the named destination, but risk still passes early.', buyer: 'Insurance (optional), import clearance, final delivery.', bar: 45 },
      { code: 'CIP', name: 'Carriage and Insurance Paid To', risk: 'Once handed to the first carrier', seller: 'Carriage + insurance to destination, at the higher "all-risks" level (Institute Cargo Clauses A, ≥110% of value).', buyer: 'Import clearance, final delivery.', bar: 50 },
      { code: 'DAP', name: 'Delivered at Place', risk: 'On arrival, ready for unloading, at destination', seller: 'Carriage and risk all the way to destination, not unloaded.', buyer: 'Unloading, import duties and clearance.', bar: 78 },
      { code: 'DPU', name: 'Delivered at Place Unloaded', risk: 'Once unloaded at destination', seller: 'Carriage, risk, and unloading at destination.', buyer: 'Import duties and clearance only.', bar: 85 },
      { code: 'DDP', name: 'Delivered Duty Paid', risk: 'On arrival, ready for unloading, duty paid', seller: 'Everything — carriage, risk, import duties and clearance.', buyer: 'Unloading only.', bar: 95 },
    ],
    sea: [
      { code: 'FAS', name: 'Free Alongside Ship', risk: 'Once placed alongside the vessel at the port of loading', seller: 'Delivery alongside the ship, export clearance.', buyer: 'Loading, main carriage, import, insurance.', bar: 25 },
      { code: 'FOB', name: 'Free on Board', risk: 'Once goods are on board the vessel', seller: 'Loading onto the vessel, export clearance.', buyer: 'Main carriage, insurance, import.', bar: 30 },
      { code: 'CFR', name: 'Cost and Freight', risk: 'Once on board at the port of loading (despite seller paying freight)', seller: 'Freight to the destination port, but risk passes at origin.', buyer: 'Insurance (optional), import clearance.', bar: 48 },
      { code: 'CIF', name: 'Cost, Insurance and Freight', risk: 'Once on board at the port of loading', seller: 'Freight + insurance to destination, at the minimum level (Institute Cargo Clauses C).', buyer: 'Import clearance, anything beyond minimum cover.', bar: 50 },
    ],
  };

  function renderIncotermRow(t) {
    return `
      <div class="accordion-item">
        <button class="accordion-trigger" aria-expanded="false" aria-controls="term-${t.code}">
          <span class="flex items-center gap-16"><span class="hs-badge">${t.code}</span> ${t.name}</span>
          <span class="plus">+</span>
        </button>
        <div class="accordion-panel" id="term-${t.code}">
          <div class="accordion-panel-inner">
            <div class="mb-16">
              <div class="field-label">Risk transfers to buyer</div>
              <div class="field-value">${t.risk}</div>
            </div>
            <div class="responsibility-bar" aria-hidden="true">
              <div class="responsibility-fill" style="width:${t.bar}%"></div>
            </div>
            <div class="flex justify-between small muted mb-16"><span>Seller carries more →</span><span>← Buyer carries more</span></div>
            <div class="grid grid-2">
              <div><div class="field-label">Seller handles</div><p class="small">${t.seller}</p></div>
              <div><div class="field-label">Buyer handles</div><p class="small">${t.buyer}</p></div>
            </div>
          </div>
        </div>
      </div>`;
  }

  function initIncotermsGuide(rootEl) {
    if (!rootEl) return;
    const anyList = rootEl.querySelector('[data-incoterms="any"]');
    const seaList = rootEl.querySelector('[data-incoterms="sea"]');
    if (anyList) anyList.innerHTML = INCOTERMS.any.map(renderIncotermRow).join('');
    if (seaList) seaList.innerHTML = INCOTERMS.sea.map(renderIncotermRow).join('');
    window.LINER.initAccordions(rootEl);
  }

  document.addEventListener('DOMContentLoaded', () => {
    initCbmCalculator(document.getElementById('cbm-form'), document.getElementById('cbm-result'));
    initIncotermsGuide(document.getElementById('incoterms-guide'));
  });

  window.LINER_TOOLS = { calcShipment };
})();
