/* ==========================================================================
   Shared Airtable fetch logic — used by both netlify/functions/products.js
   (the public catalog endpoint) and netlify/functions/assistant.js (which
   needs the same catalog as context for the AI assistant). Keeping it in one
   place means the two functions can't drift out of sync.
   ========================================================================== */

const BASE_ID = 'app1vejjNisxJMxjR';
const TABLE_NAME = 'products';

function slugify(str) {
  return String(str || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

// Airtable columns -> the shape the site's JS expects. Up to 3 flexible
// "Spec Label N" / "Spec Value N" pairs become the product's spec table.
function normalizeRecord(fields) {
  const spec = {};
  for (let i = 1; i <= 3; i++) {
    const label = fields[`Spec Label ${i}`];
    const value = fields[`Spec Value ${i}`];
    if (label && value) spec[String(label)] = String(value);
  }
  return {
    slug: fields['Slug'] ? String(fields['Slug']) : slugify(fields['Name']),
    name: fields['Name'] ? String(fields['Name']) : 'Untitled Product',
    category: fields['Category'] ? String(fields['Category']) : 'Uncategorized',
    hs: fields['HS Code'] ? String(fields['HS Code']) : '',
    hsDesc: fields['HS Description'] ? String(fields['HS Description']) : '',
    pack: fields['Packaging'] ? String(fields['Packaging']) : '',
    cbmPerCarton: Number(fields['CBM Per Carton']) || 0,
    weightPerCarton: Number(fields['Weight Per Carton (kg)']) || 0,
    moq: fields['MOQ'] ? String(fields['MOQ']) : '',
    spec,
  };
}

async function fetchProducts() {
  const token = process.env.AIRTABLE_TOKEN;
  if (!token) throw new Error('AIRTABLE_TOKEN is not set');

  const url = `https://api.airtable.com/v0/${BASE_ID}/${encodeURIComponent(TABLE_NAME)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json();

  if (!res.ok) {
    throw new Error((data.error && (data.error.message || data.error.type)) || 'Airtable request failed');
  }
  return (data.records || []).map((r) => normalizeRecord(r.fields));
}

module.exports = { fetchProducts, normalizeRecord, slugify, BASE_ID, TABLE_NAME };
