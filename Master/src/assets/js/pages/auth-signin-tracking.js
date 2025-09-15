// =========================
// Login - TrackingSaídas
// =========================
window.API_AUTH = 'https://track-saidas-api.onrender.com/api/auth'; 

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

  // 1) Autopreenche login se vier ?login=, ?email= ou ?username=
  (function prefillLogin() {
    const v = getParam('login') || getParam('email') || getParam('username') || '';
    const input = document.getElementById('login')
               || document.getElementById('email')
               || document.getElementById('username');
    if (input && v) input.value = v;
  })();

  // 2) Toggle do "olho" para ver/ocultar senha (login)  ⬅️ AGORA FORA DO SUBMIT
  document.querySelectorAll('[data-toggle="ver-senha"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const group = btn.closest('.auth-pass-inputgroup');
      const input = group ? group.querySelector('input') : document.getElementById('password-input');
      if (!input) return;

      input.type = input.type === 'password' ? 'text' : 'password';

      // alterna o ícone (opcional)
      const icon = btn.querySelector('i');
      if (icon) {
        icon.classList.toggle('ri-eye-fill');
        icon.classList.toggle('ri-eye-off-fill');
      }
    });
  });

  // 3) Intercepta o submit do formulário
  const form = document.getElementById('loginForm'); // existe no HTML de login
  if (!form) {
    console.error('[signin] #loginForm não encontrado');
    return;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    e.stopPropagation();

    // pega o valor do campo (suporta ids antigos e o novo #login)
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

    // decide o payload conforme o tipo (e-mail | telefone | username)
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

    const store = remember ? localStorage : sessionStorage;
    const other = remember ? sessionStorage : localStorage;

    try {
      btn && (btn.disabled = true);

      const base = String(window.API_AUTH || '').replace(/\/+$/, '');
      if (!base) {
        showErrorLogin('URL da API (API_AUTH) não configurada.');
        btn && (btn.disabled = false);
        return;
      }

      const signinPath = (typeof window.TRACK_SIGNIN_ENDPOINT === 'string')
        ? window.TRACK_SIGNIN_ENDPOINT
        : '/login';

      // 4) Login → cria cookie de sessão (ou retorna token)
      const resp = await fetch(base + signinPath, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload)
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        showErrorLogin(err.detail || 'Usuário ou senha inválidos.');
        btn && (btn.disabled = false);
        return;
      }

      // tenta ler token (se a API devolver) — opcional
      try {
        const data = await resp.clone().json();
        const access = data?.access_token || data?.acess_token || data?.token;
        if (access) {
          try { store.setItem('access_token', access); } catch (_) {}
        }
      } catch (_) {}

      // 5) Confirma a sessão e lê o usuário (se houver /me)
      let userData = {};
      try {
        const me = await fetch(base + '/me', { credentials: 'include' });
        if (me.ok) userData = await me.json().catch(() => ({}));
      } catch (_) {}

      // 6) Persistência
      other.removeItem('trackingToken');
      other.removeItem('trackingUser');
      store.setItem('trackingToken', 'cookie-session');
      store.setItem('trackingUser', JSON.stringify(userData || {}));

      // 7) Redireciona
      const next = getParam('next');
      window.location.href = next || 'dashboard-tracking-saidas.html';
    } catch (err) {
      console.error('[signin] erro de rede', err);
      showErrorLogin('Falha ao conectar. Tente novamente.');
      btn && (btn.disabled = false);
    }
  });
});



