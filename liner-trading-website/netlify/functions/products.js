/* ==========================================================================
   Netlify Function: GET /.netlify/functions/products
   Proxies the Airtable "products" table so the Airtable token never has to
   live in client-side JS. The token is read from the AIRTABLE_TOKEN
   environment variable (Netlify dashboard → Site settings → Environment
   variables) — it is NOT stored in this file or anywhere in the repo.
   ========================================================================== */

const { fetchProducts } = require('./_lib/airtable');

exports.handler = async function () {
  if (!process.env.AIRTABLE_TOKEN) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'AIRTABLE_TOKEN is not set. Add it in Netlify → Site settings → Environment variables, then redeploy.' }),
    };
  }

  try {
    const products = await fetchProducts();
    if (!products.length) throw new Error('Airtable returned no records — check the base/table name and that rows exist.');

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        // Short cache so a catalog edit in Airtable shows up within 5 minutes
        // without hammering the API on every page load.
        'Cache-Control': 'public, max-age=300',
      },
      body: JSON.stringify(products),
    };
  } catch (err) {
    return { statusCode: 502, body: JSON.stringify({ error: err.message }) };
  }
};
