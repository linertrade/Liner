/* ==========================================================================
   Netlify Function: POST /.netlify/functions/assistant
   Proxies Google's Gemini API so the GEMINI_API_KEY never reaches the
   browser. Uses Gemini's OpenAI-compatible endpoint, so the request/response
   shape matches what you'd send to OpenAI or xAI.
   ========================================================================== */

const { fetchProducts } = require('./_lib/airtable');

// Change this if Google retires/renames the model — check https://ai.google.dev/gemini-api/docs/models
// gemini-3.5-flash is free-tier eligible (no payment method required) as of
// mid-2026 — Pro-tier models generally are NOT free, so stick to Flash/Flash-Lite.
const GEMINI_MODEL = 'gemini-3.5-flash';
const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';

const SUPABASE_URL = 'https://bbfmpeavpqbvwigsdkiy.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJiZm1wZWF2cHFidndpZ3Nka2l5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMzMzMwNzMsImV4cCI6MjA5ODkwOTA3M30.ijxgarNCjWS41xtBxQ3GVSH1L6F1EbMcD6Vrre1UrcY';

const STAGE_LABELS = ['Order Confirmed', 'Production & QC', 'Export Clearance', 'Loaded at Djibouti Port', 'In Transit', 'Delivered'];

const INCOTERMS_SUMMARY = `Any mode of transport: EXW (seller does the least — buyer handles everything from pickup), FCA (seller delivers to buyer's carrier), CPT (seller pays carriage, risk still passes early), CIP (like CPT + seller insures at the higher "all-risks" level), DAP (seller delivers, not unloaded), DPU (seller delivers AND unloads), DDP (seller does the most — duty paid, ready to unload).
Sea/inland waterway only: FAS (seller delivers alongside the ship), FOB (risk passes once on board), CFR (seller pays freight, risk still passes at origin port), CIF (like CFR + seller insures at the minimum level).`;

async function fetchCustomerOrders(accessToken) {
  if (!accessToken) return null;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/orders?select=order_number,product_name,stage,updated_at`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function buildSystemPrompt(products, orders) {
  const catalogText = products.length
    ? products.map((p) => `- ${p.name} (HS ${p.hs}): ${p.hsDesc}. Packaging: ${p.pack}. Typical MOQ: ${p.moq}.`).join('\n')
    : '(Catalog temporarily unavailable — do not guess product details; direct the visitor to the Products page.)';

  let orderText = 'The visitor is not logged in. No order data is available — if they ask about "my order" or shipping status, tell them to log in (or sign up) at the Client Portal.';
  if (orders && orders.length) {
    orderText = "The logged-in customer's real orders — use only this, never invent order details:\n" +
      orders.map((o) => `- ${o.order_number}: ${o.product_name}, currently "${STAGE_LABELS[o.stage] || 'Unknown'}", last updated ${o.updated_at}`).join('\n');
  } else if (orders && !orders.length) {
    orderText = 'The visitor is logged in but has no orders linked to their account yet. Tell them their trade contact will attach an order once one is confirmed.';
  }

  return `You are the trade assistant on the Liner Trading PLC website, an Ethiopian agricultural export company in Addis Ababa (est. 2015, "Where Trade Meets Trust").

Scope: only answer questions about Liner Trading PLC's export catalog, HS codes, packaging/container sizing, Incoterms, and — if provided below — the logged-in visitor's own orders. Politely decline anything outside that (general chit-chat is fine briefly, but redirect off-topic or unrelated requests).

Hard rules:
- Never invent HS codes, prices, lead times, or order status. If it's not in the data below, say you don't know and point to the RFQ form (rfq.html) or Contact page.
- Never make commitments on the company's behalf (pricing, guaranteed dates, contract terms).
- Only discuss order data for the account that is actually logged in — you are never given other customers' data, so you cannot leak it.
- Keep answers short and concrete, plain text (no markdown tables).

CATALOG:
${catalogText}

INCOTERMS 2020 QUICK REFERENCE:
${INCOTERMS_SUMMARY}

CUSTOMER ORDER DATA:
${orderText}`;
}

// Different failure types (bad key, no billing, bad model, rate limit) don't
// all shape their error the same way — check a few possibilities instead of
// assuming one, and fall back to the raw response text so we NEVER show a
// blank/generic message again.
function extractApiError(status, data, rawText) {
  if (data) {
    if (data.error) {
      if (typeof data.error === 'string') return data.error;
      if (data.error.message) return data.error.message;
    }
    if (data.message) return data.message;
  }
  if (rawText) return rawText.slice(0, 300);
  return `Gemini returned HTTP ${status} with no error body`;
}

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'GEMINI_API_KEY is not set. Add it in Netlify → Site settings → Environment variables, then redeploy.' }),
    };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request body' }) };
  }

  const message = String(body.message || '').trim().slice(0, 1000);
  const history = Array.isArray(body.history) ? body.history.slice(-10) : [];
  const accessToken = typeof body.accessToken === 'string' ? body.accessToken : null;

  if (!message) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Empty message' }) };
  }

  const [products, orders] = await Promise.all([
    fetchProducts().catch(() => []),
    fetchCustomerOrders(accessToken),
  ]);

  const systemPrompt = buildSystemPrompt(products, orders);

  try {
    const res = await fetch(GEMINI_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: GEMINI_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          ...history.map((h) => ({
            role: h.role === 'assistant' ? 'assistant' : 'user',
            content: String(h.content || '').slice(0, 1000),
          })),
          { role: 'user', content: message },
        ],
      }),
    });

    // Read as text first — error responses aren't always valid JSON, and we
    // don't want to lose the real reason behind a JSON.parse crash.
    const rawText = await res.text();
    let data = null;
    try { data = JSON.parse(rawText); } catch { /* leave data null, use rawText below */ }

    if (!res.ok) {
      const errMsg = extractApiError(res.status, data, rawText);
      console.error('Gemini error', res.status, rawText);
      return { statusCode: res.status, body: JSON.stringify({ error: `Gemini ${res.status}: ${errMsg}` }) };
    }

    // OpenAI-compatible response shape: choices[0].message.content
    const reply = (data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content)
      || "Sorry, I couldn't put together a reply just now — try again, or use the RFQ form.";

    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reply }) };
  } catch (err) {
    return { statusCode: 502, body: JSON.stringify({ error: `Could not reach Gemini: ${err.message}` }) };
  }
};
