// =========================
// Login - TrackingSaídas
// =========================

// Base da API de autenticação
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

// spinner
function setSigningIn(btn, on) {
  const status = document.getElementById('signinStatus');
  if (!btn) return;

  if (on) {
    if (!btn.dataset.originalHtml) btn.dataset.originalHtml = btn.innerHTML;
    const text = btn.dataset.loading || 'Entrando...';
    btn.innerHTML =
      '<span class="spinner-border spinner-border-sm me-2" role="status"></span>' + text;
    btn.disabled = true;
    if (status) {
      status.textContent = 'Efetuando login…';
      status.classList.remove('d-none');
    }
  } else {
    btn.innerHTML = btn.dataset.originalHtml || 'Entrar';
    btn.disabled = false;
    if (status) status.classList.add('d-none');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  console.log('[signin] init');

  // Pre-fill
  (function prefillLogin() {
    const v = getParam('login') || getParam('email') || getParam('username') || '';
    const input = document.getElementById('login');
    if (input && v) input.value = v;
  })();

  // Mostrar senha
  document.querySelectorAll('[data-toggle="ver-senha"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const input = document.getElementById('password-input');
      if (!input) return;
      input.type = input.type === 'password' ? 'text' : 'password';

      const icon = btn.querySelector('i');
      icon.classList.toggle('ri-eye-fill');
      icon.classList.toggle('ri-eye-off-fill');
    });
  });

  // ==========================================
  // 🔥 CORRIGIDO — "Esqueceu a senha?"
  // ==========================================
  const forgot = document.getElementById("forgotPass");

  if (forgot) {
    forgot.addEventListener("click", (e) => {
      e.preventDefault();
      const login = document.getElementById("login")?.value?.trim();

      if (!login) {
        Swal.fire({
          icon: "warning",
          title: "Informe seu login",
          text: "Digite seu e-mail, usuário ou telefone antes de recuperar a senha."
        });
        return;
      }

      window.location.href =
        `auth-pass-change-cover.html?identifier=${encodeURIComponent(login)}`;
    });
  }

  // ==========================================
  // SUBMIT DO LOGIN
  // ==========================================
  const form = document.getElementById('loginForm');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const loginEl = document.getElementById('login');
    const rawLogin = loginEl.value.trim();
    const password = document.getElementById('password-input').value;
    const remember = document.getElementById('auth-remember-check').checked;
    const btn = document.getElementById('signinBtn');

    if (!rawLogin || !password) {
      showErrorLogin('Preencha login e senha.');
      return;
    }

    // payload
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const digits = rawLogin.replace(/\D/g, '');
    let payload;

    if (emailRegex.test(rawLogin)) payload = { email: rawLogin, password, remember };
    else if (digits.length >= 10) payload = { contato: rawLogin, password, remember };
    else payload = { username: rawLogin, password, remember };

    let slow1, slow2;

    try {
      const base = API_AUTH.replace(/\/+$/, '');

      setSigningIn(btn, true);

      slow1 = setTimeout(() => {
        const st = document.getElementById("signinStatus");
        st.textContent = "Ainda tentando conectar…";
      }, 6000);

      slow2 = setTimeout(() => {
        const st = document.getElementById("signinStatus");
        st.textContent = "A conexão está lenta, continue aguardando…";
      }, 12000);

      const signinPath = window.TRACK_SIGNIN_ENDPOINT || "/login";

      const resp = await fetch(base + signinPath, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload)
      });

// ======================================================
// 🔥 403 — Owner Bloqueado → mostrar modal no login
// ======================================================
if (resp.status === 403) {
  window.location.href =
    "auth-signin-tracking-v2.html?reason=owner_blocked";
  return;
}

// ======================================================
// ⚠️ Outros erros (401, 422, etc.)
// ======================================================
if (!resp.ok) {
  const err = await resp.json().catch(() => ({}));
  showErrorLogin(err.detail || "Usuário ou senha inválidos.");
  setSigningIn(btn, false);
  return;
}



      // /me
      let userData = {};
      try {
        const me = await fetch(base + "/me", { credentials: "include" });
        if (me.ok) userData = await me.json();
      } catch (_) {}

      // Redirecionamento por role
      const role = Number(userData?.role || 0);

      let destino;
      if (role === 1) destino = "dashboard-tracking-overview.html";
      else destino = "dashboard-tracking-saidas.html";

      window.location.href = destino;

    } catch (err) {
      console.error(err);
      showErrorLogin("Falha ao conectar.");
    } finally {
      clearTimeout(slow1);
      clearTimeout(slow2);
      setSigningIn(btn, false);
    }
  });
});
