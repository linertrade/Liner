/* ==========================================================================
   Client Portal — backed by real Supabase accounts.

   - Sign up / log in: real Supabase Auth (email + password).
   - Orders: read-only query against `public.orders`, which Row Level
     Security restricts to rows where customer_id = the logged-in user —
     see supabase/schema.sql. No client-side filtering needed or trusted.
   - Documents: real files in a private Storage bucket. A document only
     shows as downloadable once staff have actually uploaded the signed
     file; until then it honestly shows "Not yet available" rather than a
     placeholder — see supabase/schema.sql's staff workflow notes.
   ========================================================================== */

(function () {
  const sb = window.LINER_SUPABASE;
  const STAGES = ['Order Confirmed', 'Production & QC', 'Export Clearance', 'Loaded at Djibouti Port', 'In Transit', 'Delivered'];
  const DOC_LABELS = { invoice: 'Commercial Invoice', packing: 'Packing List', bl: 'Bill of Lading', coo: 'Certificate of Origin' };
  const DOC_ORDER = ['invoice', 'packing', 'bl', 'coo'];

  function stepperHTML(currentStage) {
    return `<div class="stepper">${STAGES.map((label, i) => `
      <div class="step ${i < currentStage ? 'is-done' : ''} ${i === currentStage ? 'is-current' : ''}">
        <div class="step-dot"></div>
        <div class="step-label">${label}</div>
      </div>`).join('')}</div>`;
  }

  function timeAgo(iso) {
    const diffMs = Date.now() - new Date(iso).getTime();
    const mins = Math.round(diffMs / 60000);
    if (mins < 60) return `${mins} min ago`;
    const hours = Math.round(mins / 60);
    if (hours < 24) return `${hours} hr ago`;
    const days = Math.round(hours / 24);
    return `${days} day${days === 1 ? '' : 's'} ago`;
  }

  function orderCardHTML(order, docs) {
    const docButtons = DOC_ORDER.map(key => {
      const doc = docs.find(d => d.doc_type === key);
      return doc
        ? `<button class="btn btn-outline btn-sm" data-doc="${key}" data-path="${doc.storage_path}">${DOC_LABELS[key]}</button>`
        : `<button class="btn btn-outline btn-sm" disabled title="Not uploaded yet">${DOC_LABELS[key]} — Not Yet Available</button>`;
    }).join('');
    return `
      <div class="card mb-24">
        <div class="flex justify-between items-center mb-8" style="flex-wrap:wrap;gap:10px;">
          <div>
            <span class="field-label">Order</span>
            <span class="field-value" style="font-size:1.1rem;">${escapeHTML(order.order_number)}</span>
          </div>
          <span class="tag tag-grain">${escapeHTML(order.product_name)}</span>
        </div>
        <p class="small muted mb-24">Last updated ${timeAgo(order.updated_at)}</p>
        ${stepperHTML(order.stage)}
        <div class="divider-line" style="margin:28px 0 20px;"></div>
        <div class="field-label mb-16">Documents</div>
        <div class="flex gap-12" style="flex-wrap:wrap;">${docButtons}</div>
      </div>`;
  }

  function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
  }

  function noOrdersHTML() {
    return `<div class="banner"><span class="banner-icon">i</span><div class="small">No orders are linked to this account yet. Once your first shipment is confirmed, our trade team attaches it here — check back after placing an order, or see <a href="rfq.html" style="text-decoration:underline;">Request a Quote</a> to start one.</div></div>`;
  }

  function errorBannerHTML(message) {
    return `<div class="banner banner-warn"><span class="banner-icon">!</span><div class="small">Couldn't load your orders: ${escapeHTML(message)}. Try refreshing — if it keeps happening, contact us.</div></div>`;
  }

  async function handleDocClick(btn) {
    const path = btn.dataset.path;
    const original = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Opening…';
    const { data, error } = await sb.storage.from('order-documents').createSignedUrl(path, 120);
    btn.disabled = false;
    btn.textContent = original;
    if (error || !data) {
      window.LINER.toast("Couldn't open that document — try again in a moment.");
      return;
    }
    window.open(data.signedUrl, '_blank', 'noopener');
  }

  async function loadDashboard(root, user) {
    root.innerHTML = `<p class="muted">Loading your orders…</p>`;

    const { data: orders, error } = await sb
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      root.innerHTML = `
        <div class="flex justify-between items-center mb-24" style="flex-wrap:wrap;gap:12px;">
          <p class="muted small">${escapeHTML(user.email)}</p>
          <button class="btn btn-outline btn-sm" id="portal-logout">Log Out</button>
        </div>
        ${errorBannerHTML(error.message)}`;
      document.getElementById('portal-logout').addEventListener('click', () => logout(root));
      return;
    }

    const orderIds = (orders || []).map(o => o.id);
    let docsByOrder = {};
    if (orderIds.length) {
      const { data: docs } = await sb.from('order_documents').select('*').in('order_id', orderIds);
      (docs || []).forEach(d => {
        (docsByOrder[d.order_id] = docsByOrder[d.order_id] || []).push(d);
      });
    }

    root.innerHTML = `
      <div class="flex justify-between items-center mb-32" style="flex-wrap:wrap;gap:12px;">
        <div>
          <h2 style="font-size:1.6rem;">Welcome back</h2>
          <p class="muted small">${escapeHTML(user.email)}</p>
        </div>
        <button class="btn btn-outline btn-sm" id="portal-logout">Log Out</button>
      </div>
      ${(orders && orders.length) ? orders.map(o => orderCardHTML(o, docsByOrder[o.id] || [])).join('') : noOrdersHTML()}
    `;

    document.getElementById('portal-logout').addEventListener('click', () => logout(root));
    window.LINER.qsa('[data-doc]', root).forEach(btn => {
      btn.addEventListener('click', () => handleDocClick(btn));
    });
  }

  async function logout(root) {
    await sb.auth.signOut();
    showAuth(root);
  }

  function showAuth(root) {
    root.innerHTML = `
      <div class="card" style="max-width:440px;margin:0 auto;">
        <div class="flex gap-12 mb-24" id="auth-tabs">
          <button class="btn btn-ink btn-sm" data-tab="login" type="button">Log In</button>
          <button class="btn btn-outline btn-sm" data-tab="signup" type="button">Sign Up</button>
        </div>
        <form id="auth-form" novalidate>
          <div class="field">
            <label for="auth-email">Email</label>
            <input class="input" id="auth-email" type="email" required autocomplete="email">
          </div>
          <div class="field">
            <label for="auth-password">Password</label>
            <input class="input" id="auth-password" type="password" required minlength="6" autocomplete="current-password">
            <p class="hint">At least 6 characters.</p>
          </div>
          <p class="field-error" id="auth-error" style="display:none;"></p>
          <p class="small muted mb-16" id="auth-hint">New here? Switch to Sign Up. Once your account exists, our trade team links your real orders to it.</p>
          <button class="btn btn-primary btn-block" type="submit" id="auth-submit">Log In</button>
        </form>
      </div>`;

    let mode = 'login';
    const tabs = window.LINER.qsa('[data-tab]', root);
    const hint = document.getElementById('auth-hint');
    const submitBtn = document.getElementById('auth-submit');
    tabs.forEach(btn => btn.addEventListener('click', () => {
      mode = btn.dataset.tab;
      tabs.forEach(b => {
        b.classList.toggle('btn-ink', b === btn);
        b.classList.toggle('btn-outline', b !== btn);
      });
      submitBtn.textContent = mode === 'login' ? 'Log In' : 'Create Account';
      hint.style.display = mode === 'signup' ? 'block' : 'none';
      document.getElementById('auth-error').style.display = 'none';
    }));
    hint.style.display = 'none';

    document.getElementById('auth-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('auth-email').value.trim();
      const password = document.getElementById('auth-password').value;
      const errorEl = document.getElementById('auth-error');
      errorEl.style.display = 'none';
      submitBtn.disabled = true;
      submitBtn.textContent = mode === 'login' ? 'Logging in…' : 'Creating account…';

      const { data, error } = mode === 'login'
        ? await sb.auth.signInWithPassword({ email, password })
        : await sb.auth.signUp({ email, password });

      submitBtn.disabled = false;
      submitBtn.textContent = mode === 'login' ? 'Log In' : 'Create Account';

      if (error) {
        errorEl.textContent = error.message;
        errorEl.style.display = 'block';
        return;
      }

      if (mode === 'signup' && !data.session) {
        // Default Supabase Auth setting requires email confirmation before a
        // session is active — toggle this off in Supabase Auth settings if
        // instant access without verification is preferred.
        root.innerHTML = `
          <div class="card text-center" style="max-width:440px;margin:0 auto;">
            <h3 class="mt-0 mb-16">Check Your Email</h3>
            <p class="small muted mb-24">We sent a confirmation link to <strong>${escapeHTML(email)}</strong>. Click it, then come back and log in.</p>
            <button class="btn btn-outline btn-sm" id="back-to-login">Back to Log In</button>
          </div>`;
        document.getElementById('back-to-login').addEventListener('click', () => showAuth(root));
        return;
      }

      init(root);
    });
  }

  async function init(root) {
    const { data: { session } } = await sb.auth.getSession();
    if (session) {
      await loadDashboard(root, session.user);
    } else {
      showAuth(root);
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    const root = document.getElementById('portal-root');
    if (!root) return;
    if (!sb) {
      root.innerHTML = `<div class="banner banner-warn"><span class="banner-icon">!</span><div class="small">The portal isn't configured yet — check js/supabase-config.js.</div></div>`;
      return;
    }
    init(root);
  });
})();
