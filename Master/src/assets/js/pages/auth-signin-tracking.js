// =========================
// Login - TrackingSaídas
// =========================

// Base da API de autenticação.
// Se não existir window.API_AUTH, usa o endpoint padrão:
const API_AUTH = (typeof window !== 'undefined' && window.API_AUTH)
  ? String(window.API_AUTH)
  : 'https://track-saidas-api.onrender.com/api/auth';

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

// controla spinner/mensagem no botão
function setSigningIn(btn, on) {
  const status = document.getElementById('signinStatus');
  if (!btn) return;

  if (on) {
    if (!btn.dataset.originalHtml) btn.dataset.originalHtml = btn.innerHTML;
    const text = btn.dataset.loading || 'Entrando...';
    btn.innerHTML =
      '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>' +
      text;
    btn.disabled = true;
    btn.setAttribute('aria-busy', 'true');
    if (status) {
      status.textContent = 'Efetuando login…';
      status.classList.remove('d-none');
    }
  } else {
    btn.innerHTML = btn.dataset.originalHtml || 'Entrar';
    btn.disabled = false;
    btn.removeAttribute('aria-busy');
    if (status) status.classList.add('d-none');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  console.log('[signin] init');

  // Preenche login se vier ?login=, ?email= ou ?username=
  (function prefillLogin() {
    const v = getParam('login') || getParam('email') || getParam('username') || '';
    const input = document.getElementById('login')
               || document.getElementById('email')
               || document.getElementById('username');
    if (input && v) input.value = v;
  })();

  // Toggle do "olho" para ver/ocultar senha
  document.querySelectorAll('[data-toggle="ver-senha"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const group = btn.closest('.auth-pass-inputgroup');
      const input = group ? group.querySelector('input') : document.getElementById('password-input');
      if (!input) return;
      input.type = input.type === 'password' ? 'text' : 'password';

      const icon = btn.querySelector('i');
      if (icon) {
        icon.classList.toggle('ri-eye-fill');
        icon.classList.toggle('ri-eye-off-fill');
      }
    });
  });

  // Intercepta o submit do formulário
  const form = document.getElementById('loginForm');
  if (!form) {
    console.error('[signin] #loginForm não encontrado');
    return;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    e.stopPropagation();

    const loginEl = document.getElementById('login')
                  || document.getElementById('email')
                  || document.getElementById('username');
    const rawLogin = loginEl?.value?.trim();
    const password = document.getElementById('password-input')?.value;
    const remember = document.getElementById('auth-remember-check')?.checked || false;
    const btn = document.getElementById('signinBtn');

    if (!rawLogin || !password) {
      showErrorLogin('Preencha login e senha.');
      return;
    }

    // Decide o payload conforme o tipo (e-mail | telefone | username)
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const digits = rawLogin.replace(/\D/g, '');
    let payload;
    if (emailRegex.test(rawLogin)) {
      payload = { email: rawLogin, password, remember };
    } else if (digits.length >= 10) {
      payload = { contato: digits, password, remember };
    } else {
      payload = { username: rawLogin, password, remember };
    }

    // Armazenamento (remember)
    const store = remember ? localStorage : sessionStorage;
    const other = remember ? sessionStorage : localStorage;

    // Loading + mensagens de demora
    let slowTimer1, slowTimer2;
    try {
      if (!API_AUTH) {
        showErrorLogin('URL da API de autenticação não configurada.');
        return;
      }
      const base = API_AUTH.replace(/\/+$/, '');

      setSigningIn(btn, true);
      clearTimeout(slowTimer1); clearTimeout(slowTimer2);
      slowTimer1 = setTimeout(() => {
        const s = document.getElementById('signinStatus');
        if (s && !s.classList.contains('d-none')) s.textContent = 'Ainda tentando conectar…';
      }, 6000);
      slowTimer2 = setTimeout(() => {
        const s = document.getElementById('signinStatus');
        if (s && !s.classList.contains('d-none')) s.textContent = 'A conexão está lenta, continue aguardando…';
      }, 12000);

      const signinPath = (typeof window.TRACK_SIGNIN_ENDPOINT === 'string')
        ? window.TRACK_SIGNIN_ENDPOINT
        : '/login';

      // Login → cria cookie de sessão (ou retorna token)
      const resp = await fetch(base + signinPath, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload)
      });

      if (!resp.ok) {
        clearTimeout(slowTimer1); clearTimeout(slowTimer2);
        const err = await resp.json().catch(() => ({}));
        showErrorLogin(err.detail || 'Usuário ou senha inválidos.');
        setSigningIn(btn, false);
        return;
      }

      // Se a API devolver token, guarda (opcional)
      try {
        const data = await resp.clone().json();
        const access = data?.access_token || data?.acess_token || data?.token;
        if (access) {
          try { store.setItem('access_token', access); } catch (_) {}
        }
      } catch (_) {}

      // Confirma a sessão e lê o usuário (se houver /me)
      let userData = {};
      try {
        const me = await fetch(base + '/me', { credentials: 'include' });
        if (me.ok) userData = await me.json().catch(() => ({}));
      } catch (_) {}

      // Persistência
      other.removeItem('trackingToken');
      other.removeItem('trackingUser');
      store.setItem('trackingToken', 'cookie-session');
      store.setItem('trackingUser', JSON.stringify(userData || {}));

      // Redireciona
      clearTimeout(slowTimer1); clearTimeout(slowTimer2);
      const next = getParam('next');
      window.location.href = next || 'dashboard-tracking-saidas.html';
    } catch (err) {
      clearTimeout(slowTimer1); clearTimeout(slowTimer2);
      console.error('[signin] erro de rede', err);
      showErrorLogin('Falha ao conectar. Tente novamente.');
      setSigningIn(btn, false);
    }
  });
});
