# Liner Trading PLC — Website

A static site (plain HTML/CSS/JS, no build step) with three real backend
integrations: **Airtable** (product catalog), **Supabase** (customer accounts,
order tracking, signed documents), and **xAI's Grok API** (an AI trade
assistant). It's built for **Netlify** specifically, because two of those
integrations need serverless functions to keep API keys off the browser.

## ⚠️ Rotate these before you deploy

Three real secrets were pasted into the chat that built this site. Chat is
not a secure channel, so treat all three as compromised even if they still
work right now:

1. **Airtable Personal Access Token** — Airtable → Developer Hub → Personal
   access tokens → revoke the old one, create a new one scoped to
   `data.records:read` on just the `products` table.
2. **xAI API key** — console.x.ai → API Keys → revoke, create a new one.
3. **Supabase anon key** — this one is designed to be public (see the
   security notes below), so it's lower risk, but if you want to be safe,
   Supabase does let you regenerate it under Project Settings → API.

Use the **new** values everywhere below, not the ones already used to test this.

## What's included

| Page | Feature |
|---|---|
| `index.html` | Home — company overview, three divisions, featured products |
| `about.html` | Company profile, leadership, divisions, markets served |
| `products.html` | **Export catalog**, live from Airtable, with HS codes and spec-sheet modals |
| `import.html` | **Import division** (plastics) — deliberately separate from the export RFQ flow, since it's the opposite trade direction |
| `rfq.html` | Structured RFQ engine — Incoterm, destination, volume, packaging |
| `tools.html` | CBM/container calculator + interactive Incoterms 2020 guide |
| `compliance.html` | Compliance & certificate vault (sample entries — see note there) |
| `portal.html` | **Real client accounts** — sign up, log in, track real orders, download real signed documents |
| `contact.html` | Address, live open/closed status, embedded map, direct support-email button, contact form |

Every page also has a floating **AI trade assistant** (bottom-right) that
answers catalog/HS-code/Incoterms questions and, for a logged-in customer,
their own real order status.

---

## 1) Deploying

Netlify specifically (the two serverless functions require it, or an
equivalent platform you adapt `netlify/functions/*.js` for):

1. Push this folder to a GitHub repo (or drag-and-drop the folder into
   Netlify's dashboard for a one-off deploy).
2. Netlify auto-detects `netlify.toml`. No build command needed.
3. Site settings → **Environment variables** → add:
   - `AIRTABLE_TOKEN` = your rotated Airtable token
   - `XAI_API_KEY` = your rotated xAI key
4. Redeploy after adding the env vars (they only take effect on a fresh deploy).

To preview locally without functions (catalog will show the small built-in
fallback list, and the assistant will show a connection error — both
expected): `python3 -m http.server 8000` from this folder.

To preview locally **with** functions working: install the Netlify CLI
(`npm install -g netlify-cli`), run `netlify dev` from this folder, and put
your tokens in a local `.env` file (`AIRTABLE_TOKEN=...`, `XAI_API_KEY=...`)
— Netlify CLI loads it automatically. Don't commit `.env`.

---

## 2) Airtable setup (product catalog)

The site reads from a table named **exactly** `products` in your base. Name
your columns exactly as below — the serverless function
(`netlify/functions/_lib/airtable.js`) maps them by these exact names:

| Airtable column | Type | Notes |
|---|---|---|
| `Name` | Single line text | e.g. "Red Kidney Beans" |
| `Slug` | Single line text | URL-safe id, e.g. `red-kidney-beans`. Leave blank and it's auto-generated from Name, but a stable manual slug is safer — RFQ links (`rfq.html?product=slug`) depend on it not changing. |
| `Category` | Single select | e.g. Pulses / Cash Crop / Oil Seeds / Industrial |
| `HS Code` | **Single line text** | Must be text, not Number — a Number field strips the leading structure of codes like `0713.33`. |
| `HS Description` | Single line text | |
| `Packaging` | Single line text | e.g. "50 kg PP bags, 20/pallet" |
| `CBM Per Carton` | Number (decimal) | |
| `Weight Per Carton (kg)` | Number | |
| `MOQ` | Single line text | e.g. "25 MT" |
| `Spec Label 1` / `Spec Value 1` | Single line text × 2 | e.g. "Moisture" / "≤ 14%" |
| `Spec Label 2` / `Spec Value 2` | Single line text × 2 | Up to 3 spec rows per product; leave blank if unused |
| `Spec Label 3` / `Spec Value 3` | Single line text × 2 | |

Add/edit/reorder rows in Airtable and they show up on the site within about
5 minutes (the function caches responses for 5 minutes so it isn't hammering
Airtable's API on every page load).

If the function can't reach Airtable for any reason (env var not set, token
revoked, base/table renamed), the site falls back to a small built-in
product list rather than showing an empty page — you'll see a banner on
`products.html` when that's happening.

---

## 3) Supabase setup (accounts, order tracking, signed documents)

1. Dashboard → **SQL Editor** → New query → paste the entire contents of
   `supabase/schema.sql` → Run. Safe to re-run if you edit it later.
2. Dashboard → **Storage** → confirm a bucket named `order-documents` now
   exists (the SQL script creates it) and that it's marked **Private**.
3. `js/supabase-config.js` and `netlify/functions/assistant.js` already have
   your project URL and anon key filled in — no action needed there.

**Staff workflow (there's no admin UI — this is intentional, to keep scope
contained):**

- **New client, new order:** Supabase Dashboard → Table Editor → `orders` →
  Insert row. `customer_id` is the client's UUID (Authentication → Users →
  copy their UID after they've signed up). Set `order_number`,
  `product_name`, `stage` (0–5, see the comment in `schema.sql` for what each
  stage means).
- **Shipment moves forward:** edit that row's `stage` value.
- **Attach a real signed document:** Storage → `order-documents` → create a
  folder named exactly the order's UUID → upload the signed PDF as
  `invoice.pdf` / `packing.pdf` / `bl.pdf` / `coo.pdf` → then Table Editor →
  `order_documents` → Insert row with `order_id`, `doc_type`, and
  `storage_path` (the exact path you just uploaded to). Until this row
  exists, the portal honestly shows that document as "Not Yet Available"
  rather than faking one — nothing is shown to a customer that isn't a real
  file your team uploaded.

**Why customers can't edit their own orders:** the RLS policies in
`schema.sql` only grant `SELECT`. There's no insert/update/delete policy for
the logged-in customer role, on purpose — status changes are a staff action
via the dashboard (or a separate internal tool using the `service_role` key,
which never appears in this site).

**On email confirmation:** by default, Supabase requires a customer to click
a confirmation link before their account is active. Toggle this off under
Authentication → Settings if you'd rather they get instant access.

### About "getting updates on shipping"

Two different things fall under that phrase, and only one is built right now:

- **Checking status anytime** — done, and real. Log in, see the current
  stage, refresh whenever you want.
- **Proactive alerts** (an email that fires the moment staff move an order to
  the next stage) — **not built yet**, deliberately, rather than faking it
  with something that looks like a notification toggle but doesn't send
  anything. That's a real trust problem if a customer believes they'll be
  emailed and isn't. Building it for real needs one more piece: a
  transactional email provider (Resend is the simplest — generous free tier,
  a few lines of code) wired to a Supabase Database Webhook that fires on
  `orders` UPDATE. Say the word and I'll build that next; I didn't want to
  add a fourth external credential to this thread without you asking for it
  first.

---

## 4) xAI Assistant setup

Reads `XAI_API_KEY` from the environment (never the client). It answers
catalog/HS-code/Incoterms questions using the same Airtable data as the
catalog page, and — only when the visitor is logged in — their own real
order status, fetched using *their* Supabase session token (not an
admin key), so Row Level Security guarantees it can never see another
customer's orders.

The model name is set in `netlify/functions/assistant.js` as `XAI_MODEL`
(currently `grok-4.3`). If xAI renames or retires it, that's the one line to
change — check https://docs.x.ai for the current model list.

No rate limiting is built in. If this gets public traffic and cost/abuse
becomes a concern, add a check (IP-based or otherwise) in
`netlify/functions/assistant.js` before it calls xAI.

---

## 5) Professional-site polish

A few things that separate a template from something you'd actually publish:

- **Favicon** — `favicon.svg` (the stamp-ring mark) plus PNG fallbacks at
  16/32/48px and an `apple-touch-icon.png` (180px) for iOS home-screen icons.
- **Social share previews** — every page has Open Graph + Twitter Card meta
  tags, pointing at `og-image.png` (a branded 1200×630 card). Paste any page
  URL into Slack, WhatsApp, or X and it'll show a real preview instead of a
  bare link.
- **Structured data** — `index.html` includes JSON-LD `Organization` markup
  (name, address, phone, founding date) so Google can potentially show rich
  business info in search results.
- **`robots.txt` + `sitemap.xml`** — standard search-engine discovery files.
- **Custom `404.html`** — on-brand instead of a generic host error page.
- **`privacy.html` + `terms.html`** — real drafts reflecting what this site
  actually does (Supabase accounts, xAI chat processing, no server-side
  storage of RFQ form data), not copy-pasted boilerplate. **Still: have a
  lawyer review both before publishing** — the "Governing Law" section in
  `terms.html` is explicitly left as a placeholder for that reason, and nothing
  here is legal advice.
- **Skip-to-content link** — a visually-hidden link (visible on keyboard
  focus) at the top of every page, standard accessibility practice for
  keyboard/screen-reader users to bypass the nav.
- **`/supabase/schema.sql` is blocked from public access** via a redirect
  rule in `netlify.toml` — with `publish = "."`, every file in this folder
  is served as a static asset by default unless excluded, and there's no
  reason your DB schema should be publicly downloadable even though nothing
  in it is secret.

### ⚠️ One placeholder to replace everywhere

`https://YOUR-DOMAIN-HERE.com` appears in `robots.txt`, `sitemap.xml`, and
every page's `<head>` (canonical URL, `og:url`, `og:image`, `twitter:image`,
and the JSON-LD `url`/`logo` fields in `index.html`). Once you know your real
domain, find-and-replace that placeholder across every file — e.g. from this
folder: `grep -rl 'YOUR-DOMAIN-HERE.com' . | xargs sed -i 's#https://YOUR-DOMAIN-HERE.com#https://your-real-domain.com#g'`
(adjust `your-real-domain.com` to the real one first).

---

## Before you publish — remaining checklist

- [ ] Rotate the three secrets listed at the top of this file.
- [ ] Set `AIRTABLE_TOKEN` and `XAI_API_KEY` in Netlify's environment
      variables and redeploy.
- [ ] Run `supabase/schema.sql` and confirm the `order-documents` bucket
      exists and is private.
- [ ] Populate your Airtable base with real products using the exact column
      names above.
- [ ] Confirm business hours in `js/app.js` → `BUSINESS_HOURS` (Monday's
      8:30 AM opening is confirmed from the public listing; the rest of the
      week is a typical-week placeholder).
- [ ] Verify HS codes with a customs broker for each destination country —
      the codes here are correct at the international 6-digit level, but
      national tariff schedules often add more digits.
- [ ] Replace the compliance vault's sample documents with your actual
      current certificates.
- [ ] Add real product/facility photography (none is used currently, to
      avoid using anyone else's images without rights).
- [ ] Replace `YOUR-DOMAIN-HERE.com` sitewide once you know your real domain
      (see above).
- [ ] Have a lawyer review `privacy.html` and `terms.html` before relying on
      them — especially the governing-law placeholder in the terms.
- [ ] Decide on proactive shipping-update emails (see above) if you want them.

---

## Structure

```
liner-trading/
├── index.html, about.html, products.html, import.html, rfq.html,
│   tools.html, compliance.html, portal.html, contact.html
├── privacy.html, terms.html, 404.html
├── robots.txt, sitemap.xml
├── favicon.svg, favicon-16/32/48.png, apple-touch-icon.png, og-image.svg/png
├── netlify.toml
├── css/style.css
├── supabase/schema.sql           — tables, RLS policies, storage bucket + policy
├── netlify/functions/
│   ├── _lib/airtable.js          — shared Airtable fetch/normalize logic
│   ├── products.js               — GET catalog (proxies Airtable)
│   └── assistant.js              — POST chat (proxies xAI, reads Supabase w/ user's own token)
└── js/
    ├── app.js                    — shared: nav, product loading, business hours, utilities
    ├── supabase-config.js        — Supabase client (URL + anon key — public by design)
    ├── products.js                — catalog rendering + filter + spec sheets
    ├── rfq.js                     — RFQ form logic
    ├── tools.js                   — CBM calculator + Incoterms guide
    ├── portal.js                  — real auth, real orders, real signed documents
    └── assistant.js               — floating AI chat widget
```

Fonts load from Google Fonts via CDN (`Big Shoulders Display`, `IBM Plex
Sans`, `IBM Plex Mono`); Supabase's client library loads from jsDelivr. Both
need an internet connection for visitors — normal for a live site, just
worth knowing if you're previewing somewhere offline.
