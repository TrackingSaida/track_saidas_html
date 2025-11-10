/* user.js — sessão, identidade e UI (Topbar/Sidebar)
 * - Redireciona para login quando a sessão expirar (401)
 * - Preenche Topbar/Sidebar com: Nome (linha de cima) e Sobrenome (linha de baixo)
 * - Mantém fallback leve usando username/email se o backend não retornar nome/sobrenome
 */

(function () {
  const API_ORIGIN = "https://track-saidas-api.onrender.com";
  const LOGIN_PAGE = "auth-signin-tracking-v2.html"; // relativo às páginas

  function isOnLoginPage() {
    try {
      const u = new URL(window.location.href);
      return (
        u.pathname.endsWith("/auth-signin-tracking-v2.html") ||
        u.pathname.endsWith("auth-signin-tracking-v2.html") ||
        u.pathname.endsWith("auth-signin-tracking.html") ||
        u.pathname.endsWith("auth-signin-basic.html")
      );
    } catch (_) {
      return false;
    }
  }

  function redirectToLogin(reason = "session_expired") {
    if (isOnLoginPage()) return;
    const current = window.location.pathname + window.location.search + window.location.hash;
    const target = `${LOGIN_PAGE}?reason=${encodeURIComponent(reason)}&redirect=${encodeURIComponent(current)}`;
    try {
      localStorage.removeItem("access_token");
      localStorage.removeItem("acess_token");
      localStorage.removeItem("trackingToken");
      localStorage.removeItem("trackingUser");
      sessionStorage.removeItem("access_token");
      sessionStorage.removeItem("acess_token");
      sessionStorage.removeItem("trackingToken");
      sessionStorage.removeItem("trackingUser");
    } catch (_) {}
    window.location.replace(target);
  }

  // --- Interceptor global: redireciona no 401 de qualquer fetch (exceto auth) ---
  (function patchFetchFor401() {
    if (!("fetch" in window)) return;
    const originalFetch = window.fetch;
    window.fetch = async function patchedFetch(input, init) {
      const resp = await originalFetch(input, init);
      const reqUrl =
        typeof input === "string"
          ? input
          : input && input.url
          ? input.url
          : "";
      const isAuthAction = /\/api\/auth\/(login|register|refresh)/.test(reqUrl);
      if (resp && resp.status === 401 && !isOnLoginPage() && !isAuthAction) {
        redirectToLogin("unauthorized");
      }
      return resp;
    };
  })();

  function capitalizeWords(s) {
    return String(s || "").replace(/\b\w/g, (c) => c.toUpperCase());
  }

  async function carregarUsuarioLogado() {
  try {
    const resp = await fetch(`${API_ORIGIN}/api/auth/me`, {
      credentials: "include",
      headers: { Accept: "application/json" },
    });

    if (resp.status === 401) {
      redirectToLogin("session_expired");
      return;
    }
    if (!resp.ok) {
      console.warn("[user] /auth/me não OK:", resp.status);
      return;
    }

    // ✅ Modelo da API: { id, email, username, contato }
    const user = await resp.json();

    const username = (user.username || "").trim();
    const email = (user.email || "").trim();
    const contato = (user.contato || "").trim();

    // Nome exibido prioriza contato > username > email
    const nomeExibicao = username || "Usuário";

    // === Atualiza elementos da UI ===
    document.querySelectorAll(".user-name-text, .sidebar-user-name-text").forEach(el => {
      el.textContent = nomeExibicao;
    });


    const ddHeader = document.querySelector(".dropdown-menu .dropdown-header");
    if (ddHeader) ddHeader.textContent = `Bem-vindo(a) ${nomeExibicao}!`;

    // Substitui placeholders antigos (ex: "Anna Adame")
    document.querySelectorAll("span, div, a, strong, b, h6").forEach(el => {
      if (
        el.childElementCount === 0 &&
        /\bAnna\b|\bAdame\b/i.test(el.textContent || "")
      ) {
        el.textContent = nomeExibicao;
      }
    });

    // Guarda no escopo global (para uso em outras páginas)
    window.__USER__ = { id: user.id, username, email, contato };

  } catch (e) {
    console.error("Erro ao carregar usuário logado:", e);

    // 🔹 Mostra alerta amigável se for falha de rede
    if (e.name === "TypeError" && e.message.includes("NetworkError")) {
      if (window.Swal) {
        Swal.fire({
          icon: "error",
          title: "Falha de conexão",
          text: "Não foi possível conectar ao servidor. Verifique sua internet ou tente novamente mais tarde.",
          confirmButtonText: "OK",
        });
      } else {
        alert("Falha de conexão com o servidor. Verifique sua internet.");
      }
    }
  }
}


  // Revalida ao focar a aba ou ao carregar
  window.addEventListener("focus", () => {
    if (!isOnLoginPage()) carregarUsuarioLogado();
  });
  document.addEventListener("DOMContentLoaded", () => {
    if (!isOnLoginPage()) carregarUsuarioLogado();
  });
})();

/* =====================================================
   UX extra: alerta de crédito e checagem de sessão
   ===================================================== */
(function (w) {
  "use strict";
  w.UserUX = w.UserUX || {};

  if (!w.UserUX.creditAlert) {
    function hasSwal() {
      return !!(w.Swal && typeof w.Swal.fire === "function");
    }
    function escapeHtml(str) {
      return String(str || "").replace(/[&<>"']/g, (s) =>
        (
          {
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;",
          }
        )[s]
      );
    }
    function openPlans() {
      const url = w.USER_BILLING_URL || "billing.html";
      try {
        w.location.assign(url);
      } catch {
        w.location.href = url;
      }
    }

    w.UserUX.creditAlert = function (message) {
      const msg = message || "Créditos insuficientes para registrar esta saída.";
      if (hasSwal()) {
        return Swal.fire({
          icon: "warning",
          title: "Créditos insuficientes",
          html: `<div class="text-start">${escapeHtml(msg)}</div>`,
          showCancelButton: true,
          confirmButtonText: "Ver planos",
          cancelButtonText: "Fechar",
          buttonsStyling: false,
          customClass: {
            confirmButton: "btn btn-primary",
            cancelButton: "btn btn-light",
          },
        }).then((res) => {
          if (res.isConfirmed) openPlans();
        });
      }
      alert(msg);
      return Promise.resolve();
    };
  }
})(window);

/* =====================================================
   Verificação de autenticação global
   ===================================================== */
(function (w) {
  "use strict";
  if (!w.ensureAuth) {
    const API_ORIGIN = "https://track-saidas-api.onrender.com";
    const API_AUTH = `${API_ORIGIN}/api/auth`;
    function hasMarker() {
      try {
        return (
          w.localStorage.getItem("trackingToken") ||
          w.sessionStorage.getItem("trackingToken") ||
          w.localStorage.getItem("access_token") ||
          w.localStorage.getItem("acess_token") ||
          w.sessionStorage.getItem("access_token") ||
          w.sessionStorage.getItem("acess_token")
        );
      } catch (_) {
        return false;
      }
    }
    async function ensureAuth() {
      try {
        if (hasMarker()) return;
        const cookie = document.cookie
          .split("; ")
          .find((r) => r.startsWith("access_token="));
        if (cookie) {
          try {
            w.localStorage.setItem("trackingToken", "cookie-session");
          } catch (_) {}
          return;
        }
        const r = await fetch(`${API_AUTH}/me`, { credentials: "include" });
        if (r && r.ok) {
          try {
            w.localStorage.setItem("trackingToken", "cookie-session");
          } catch (_) {}
          return;
        }
      } catch (_) {}
      const current = w.location.pathname.split("/").pop();
      w.location.replace(`index.html?next=${encodeURIComponent(current)}`);
    }
    w.ensureAuth = ensureAuth;
  }
})(window);
