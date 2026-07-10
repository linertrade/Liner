/* ==========================================================================
   AI Trade Assistant — floating widget, loaded on every page.
   Talks to /.netlify/functions/assistant (never calls xAI directly — the API
   key stays server-side). If the visitor is logged in via Supabase, their
   session access token rides along so the assistant can answer questions
   about their own orders; RLS on the server enforces that it can never see
   anyone else's data. Conversation history is in-memory only (resets on
   page reload) — no backend chat history is stored.
   ========================================================================== */

(function () {
  const ENDPOINT = '/.netlify/functions/assistant';
  const history = [];
  let panelBuilt = false;
  let sending = false;

  function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
  }

  function build() {
    if (panelBuilt) return;
    panelBuilt = true;

    const toggle = document.createElement('button');
    toggle.className = 'assistant-toggle';
    toggle.type = 'button';
    toggle.innerHTML = `<span class="dot"></span> Ask Us`;
    toggle.setAttribute('aria-label', 'Open trade assistant chat');

    const panel = document.createElement('div');
    panel.className = 'assistant-panel';
    panel.innerHTML = `
      <div class="assistant-head">
        <div>
          <strong>Trade Assistant</strong>
          <span>Catalog · HS Codes · Your Orders</span>
        </div>
        <button class="assistant-close" type="button" aria-label="Close chat">✕</button>
      </div>
      <div class="assistant-messages" id="assistant-messages"></div>
      <form class="assistant-input-row" id="assistant-form">
        <input type="text" id="assistant-input" placeholder="Ask about a product, HS code, or your order…" autocomplete="off" maxlength="500">
        <button type="submit">Send</button>
      </form>
    `;

    document.body.appendChild(toggle);
    document.body.appendChild(panel);

    const messagesEl = panel.querySelector('#assistant-messages');
    const form = panel.querySelector('#assistant-form');
    const input = panel.querySelector('#assistant-input');

    function open() {
      panel.classList.add('is-open');
      if (!messagesEl.childElementCount) {
        addMessage('bot', "Hi — I can help with product specs, HS codes, container sizing, Incoterms, or your own order status if you're logged in. What do you need?");
      }
      input.focus();
    }
    function close() { panel.classList.remove('is-open'); }

    toggle.addEventListener('click', () => {
      panel.classList.contains('is-open') ? close() : open();
    });
    panel.querySelector('.assistant-close').addEventListener('click', close);

    function addMessage(role, text) {
      const el = document.createElement('div');
      el.className = `assistant-message is-${role}`;
      el.innerHTML = escapeHTML(text);
      messagesEl.appendChild(el);
      messagesEl.scrollTop = messagesEl.scrollHeight;
      return el;
    }

    function setTyping(on) {
      let el = messagesEl.querySelector('.assistant-typing');
      if (on && !el) {
        el = document.createElement('div');
        el.className = 'assistant-typing';
        el.textContent = 'Thinking…';
        messagesEl.appendChild(el);
        messagesEl.scrollTop = messagesEl.scrollHeight;
      } else if (!on && el) {
        el.remove();
      }
    }

    async function getAccessToken() {
      if (!window.LINER_SUPABASE) return null;
      try {
        const { data: { session } } = await window.LINER_SUPABASE.auth.getSession();
        return session ? session.access_token : null;
      } catch {
        return null;
      }
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (!text || sending) return;

      sending = true;
      input.value = '';
      form.querySelector('button').disabled = true;
      addMessage('user', text);
      setTyping(true);

      const accessToken = await getAccessToken();

      try {
        const res = await fetch(ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: text, history, accessToken }),
        });
        const data = await res.json();
        setTyping(false);

        if (!res.ok) {
          addMessage('error', data.error || "Something went wrong — try again in a moment.");
        } else {
          addMessage('bot', data.reply);
          history.push({ role: 'user', content: text });
          history.push({ role: 'assistant', content: data.reply });
        }
      } catch (err) {
        setTyping(false);
        addMessage('error', "Couldn't reach the assistant — check your connection and try again.");
      }

      sending = false;
      form.querySelector('button').disabled = false;
      input.focus();
    });
  }

  document.addEventListener('DOMContentLoaded', build);
})();
