/* ==========================================================================
   Netlify Function: POST /.netlify/functions/assistant
   Proxies xAI's Grok API so the XAI_API_KEY never reaches the browser — same
   pattern as products.js for the Airtable token. Read from the XAI_API_KEY
   environment variable (Netlify → Site settings → Environment variables).

   If an accessToken is included in the request body (the visitor's own
   Supabase session, sent by js/assistant.js only when they're logged in),
   this function fetches THEIR orders using THAT token — not the anon key,
   not a service_role key — so Row Level Security enforces the same "only
   your own orders" rule it always does. There is no path here that can see
   another customer's data.
   ========================================================================== */

const { fetchProducts } = require('./_lib/airtable');

// Change this if xAI retires/renames the model — check https://docs.x.ai
const XAI_MODEL = 'grok-3-latest';
const XAI_ENDPOINT = 'https://api.x.ai/v1/chat/completions';

// Same public URL + anon key as js/supabase-config.js (safe to duplicate —
// neither is secret; RLS is the actual access boundary, see supabase/schema.sql).
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

function extractReplyText(xaiResponse) {
  // chat/completions format: choices[0].message.content
  return (xaiResponse.choices &&
    xaiResponse.choices[0] &&
    xaiResponse.choices[0].message &&
    xaiResponse.choices[0].message.content) || null;
}

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'XAI_API_KEY is not set. Add it in Netlify → Site settings → Environment variables, then redeploy.' }),
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
    const res = await fetch(XAI_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: XAI_MODEL,
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

    const data = await res.json();
    if (!res.ok) {
      return { statusCode: res.status, body: JSON.stringify({ error: (data.error && data.error.message) || 'xAI request failed' }) };
    }

    const reply = extractReplyText(data) || "Sorry, I couldn't put together a reply just now — try again, or use the RFQ form.";
    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reply }) };
  } catch (err) {
    return { statusCode: 502, body: JSON.stringify({ error: `Could not reach xAI: ${err.message}` }) };
  }
};
