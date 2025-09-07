// URL COMPLETA da API (Render)
const API_BASE = 'https://track-saidas-api.onrender.com/api/auth';

function getNextParam() {
  const u = new URL(window.location.href);
  return u.searchParams.get('next');
}

function showError(msg) {
  const el = document.getElementById('loginError');
  el.textContent = msg || 'Falha no login.';
  el.classList.remove('d-none');
}

console.log('[signin] script carregado');

const form = document.getElementById('loginForm');
if (!form) {
  console.error('[signin] Não encontrei #loginForm');
} else {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    console.log('[signin] submit interceptado');

    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password-input').value;
    const remember = document.getElementById('auth-remember-check')?.checked || false;
    const btn = document.getElementById('signinBtn');

    if (!email || !password) { showError('Preencha email e senha.'); return false; }

    btn.disabled = true;

    try {
      console.log('[signin] POST', `${API_BASE}/login`, { email, remember });
      const resp = await fetch(`${API_BASE}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include', // ESSENCIAL p/ cookie cross-site
        body: JSON.stringify({ email, password, remember })
      });

      console.log('[signin] /auth/login status =', resp.status);

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        showError(err.detail || 'Usuário ou senha inválidos.');
        btn.disabled = false;
        return false;
      }

      // Confirma sessão imediatamente na MESMA ORIGEM da API
      const meUrl = `${API_BASE}/me`;
      console.log('[signin] GET', meUrl);
      const me = await fetch(meUrl, { credentials: 'include' });
      console.log('[signin] /auth/me status =', me.status);

      if (!me.ok) {
        showError('Sessão não criada. Verifique as flags do cookie (Secure/SameSite/CORS).');
        btn.disabled = false;
        return false;
      }

      const next = getNextParam();
      window.location.href = next || 'index.html';
      return false;
    } catch (err) {
      console.error('[signin] erro no fetch', err);
      showError('Falha ao conectar. Tente novamente.');
      btn.disabled = false;
      return false;
    }
  });
}

