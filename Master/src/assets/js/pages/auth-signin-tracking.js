// =========================
// Login - TrackingSaídas
// =========================
const API_AUTH = 'https://track-saidas-api.onrender.com/api/auth';

function getParam(name) {
  const u = new URL(window.location.href);
  return u.searchParams.get(name);
}

function showErrorLogin(msg) {
  const el = document.getElementById('loginError');
  if (!el) return;
  el.textContent = msg || 'Falha no login.';
  el.classList.remove('d-none');
}

document.addEventListener('DOMContentLoaded', () => {
  console.log('[signin] init');

  // 1) Autopreenche o e-mail se vier ?email=...
  (function prefillEmail() {
    const email = getParam('email');
    if (email) {
      const input = document.getElementById('email');
      if (input) input.value = email;
    }
  })();

  // 2) Intercepta o submit do formulário
  const form = document.getElementById('loginForm'); // existe no HTML de login
  if (!form) {
    console.error('[signin] #loginForm não encontrado');
    return;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    e.stopPropagation();

    const email = document.getElementById('email')?.value.trim();
    const password = document.getElementById('password-input')?.value;
    const remember = document.getElementById('auth-remember-check')?.checked || false;
    const btn = document.getElementById('signinBtn');

    if (!email || !password) {
      showErrorLogin('Preencha e-mail e senha.');
      return;
    }

    const store = remember ? localStorage : sessionStorage;
    const other = remember ? sessionStorage : localStorage;

    try {
      btn && (btn.disabled = true);

      // 3) Login → cria cookie de sessão
      const resp = await fetch(`${API_AUTH}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include', // importante para cookie cross-site
        body: JSON.stringify({ email, password, remember })
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        showErrorLogin(err.detail || 'Usuário ou senha inválidos.');
        btn && (btn.disabled = false);
        return;
      }

      // 4) Confirma a sessão e lê o usuário
      const me = await fetch(`${API_AUTH}/me`, { credentials: 'include' });
      if (!me.ok) {
        showErrorLogin('Sessão não criada. Verifique flags do cookie (Secure/SameSite/CORS).');
        btn && (btn.disabled = false);
        return;
      }
      const userData = await me.json().catch(() => ({}));

      // 5) Persistência (marcador para o index + cache do usuário)

other.removeItem('trackingToken');
other.removeItem('trackingUser');
store.setItem('trackingToken', 'cookie-session');
store.setItem('trackingUser', JSON.stringify(userData || {}));

      // 6) Redireciona
      const next = getParam('next');
      window.location.href = next || 'dashboard-tracking-saidas.html';
    } catch (err) {
      console.error('[signin] erro de rede', err);
      showErrorLogin('Falha ao conectar. Tente novamente.');
      btn && (btn.disabled = false);
    }
  });
});
