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

function resolvePostLoginDestino(userData) {
  const role = Number(userData?.role || 0);
  const ignorarColeta = userData?.ignorar_coleta === true;
  const modoColeta = userData?.modo_operacao || "codigo";

  if (role === 0) return "dashboard-admin.html";
  if ((role === 0 || role === 1) && ignorarColeta) return "dashboard-saidas.html";
  if (role === 1) return "dashboard-visao-360.html";
  if (role === 3 && !ignorarColeta && ["codigo", "ambos"].includes(modoColeta)) {
    return "tracking-coleta-leitura.html";
  }
  if (role === 3) return "tracking-leitura.html";
  return "tracking-leitura.html";
}

async function handleSuccessfulLogin(base, loginData) {
  // Root: precisa escolher sub_base antes de receber cookie/sessão
  if (loginData && loginData.needs_sub_base_selection) {
    const subBases = Array.isArray(loginData.sub_bases) ? loginData.sub_bases.filter(Boolean) : [];
    if (!subBases.length) {
      showErrorLogin("Nenhuma base disponível para acesso.");
      return;
    }

    const loginEl = document.getElementById("login");
    const rawLogin = (loginEl?.value || "").trim();
    const password = document.getElementById("password-input")?.value || "";
    const remember = !!document.getElementById("auth-remember-check")?.checked;

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const digits = rawLogin.replace(/\D/g, "");
    let selectPayload;
    if (emailRegex.test(rawLogin)) {
      selectPayload = { email: rawLogin, password, remember };
    } else if (digits.length >= 10) {
      selectPayload = { contato: rawLogin, password, remember };
    } else {
      selectPayload = { username: rawLogin, password, remember };
    }

    const optionsHtml = subBases
      .map((sb) => `<option value="${String(sb).replace(/"/g, "&quot;")}">${String(sb)}</option>`)
      .join("");

    const { value: chosen, isConfirmed } = await Swal.fire({
      title: "Selecione a base",
      html: `<select id="swal-root-subbase" class="swal2-select" style="width:100%">${optionsHtml}</select>`,
      focusConfirm: false,
      showCancelButton: true,
      confirmButtonText: "Continuar",
      cancelButtonText: "Cancelar",
      preConfirm: () => {
        const el = document.getElementById("swal-root-subbase");
        const v = (el?.value || "").trim();
        if (!v) {
          Swal.showValidationMessage("Selecione uma base.");
          return false;
        }
        return v;
      },
    });

    if (!isConfirmed || !chosen) {
      showErrorLogin("Selecione uma base para continuar.");
      return;
    }

    const selectResp = await fetch(base + "/root-select-subbase", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ ...selectPayload, sub_base: chosen }),
    });

    if (selectResp.status === 403) {
      const errBody = await selectResp.json().catch(() => ({}));
      if (errBody?.detail === "owner_blocked") {
        window.location.href = "auth-signin-tracking-v2.html?reason=owner_blocked";
        return;
      }
      showErrorLogin(errBody.detail || "Não foi possível acessar a base selecionada.");
      return;
    }

    if (!selectResp.ok) {
      const err = await selectResp.json().catch(() => ({}));
      showErrorLogin(err.detail || "Não foi possível selecionar a base.");
      return;
    }

    loginData = await selectResp.json().catch(() => ({}));
  }

  const loginUser = loginData && loginData.user ? loginData.user : null;

  if (loginUser && loginUser.must_change_password) {
    await Swal.fire({
      icon: "info",
      title: "Defina uma nova senha",
      html: "Sua senha atual é temporária. Defina uma nova senha para continuar usando o sistema.",
      confirmButtonText: "Trocar senha agora",
    });
    const url = new URL(window.location.origin + "/profile-settings-tracking.html");
    url.searchParams.set("force_password_change", "1");
    window.location.href = url.toString();
    return;
  }

  let userData = loginUser || {};
  if (!userData || userData.role === undefined || userData.role === null) {
    try {
      const me = await fetch(base + "/me", { credentials: "include" });
      if (me.ok) userData = await me.json();
    } catch (_) {}
  }

  window.location.href = resolvePostLoginDestino(userData);
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
  const err403 = await resp.json().catch(() => ({}));
  // Root sem bases ativas (ou outros 403) não devem cair no fluxo de owner bloqueado
  if (err403?.detail === "owner_blocked") {
    window.location.href =
      "auth-signin-tracking-v2.html?reason=owner_blocked";
    return;
  }
  showErrorLogin(err403.detail || "Acesso negado.");
  setSigningIn(btn, false);
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

      let loginData = {};
      try {
        loginData = await resp.json();
      } catch (_) {
        loginData = {};
      }

      await handleSuccessfulLogin(base, loginData);

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
