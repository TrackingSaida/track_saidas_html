(function () {
  // ==========================================================
  // CONFIG
  // ==========================================================
  const API_ORIGIN = "https://track-saidas-api.onrender.com";
  const LOGIN_PAGE = "auth-signin-tracking-v2.html";

  // ==========================================================
  // STATE (global)
  // ==========================================================
  window.__USER__ = null;
  window.IGNORAR_COLETA = false;

  // ==========================================================
  // Helpers
  // ==========================================================
  function isOnLoginPage() {
    try {
      const p = window.location.pathname;
      return (
        p.endsWith("/auth-signin-tracking-v2.html") ||
        p.endsWith("/auth-signin-tracking.html") ||
        p.endsWith("/auth-signin-basic.html")
      );
    } catch (_) {
      return false;
    }
  }

  function clearAuthMarkers() {
    try {
      localStorage.removeItem("trackingToken");
      localStorage.removeItem("access_token");
      localStorage.removeItem("acess_token");
      localStorage.removeItem("trackingUser");
      localStorage.removeItem("ignorar_coleta");
      sessionStorage.clear();
    } catch (_) {}
  }

  function redirectToLogin(reason = "session_expired") {
    if (isOnLoginPage()) return;

    const current =
      window.location.pathname +
      window.location.search +
      window.location.hash;

    clearAuthMarkers();

    const target =
      `${LOGIN_PAGE}?reason=${encodeURIComponent(reason)}` +
      `&redirect=${encodeURIComponent(current)}`;

    window.location.replace(target);
  }

  // ==========================================================
  // FETCH INTERCEPTOR (401 / 403)
  // ==========================================================
  (function patchFetch() {
    if (!window.fetch) return;

    const originalFetch = window.fetch;

    window.fetch = async function (input, init) {
      const resp = await originalFetch(input, init);

      const url =
        typeof input === "string"
          ? input
          : input && input.url
          ? input.url
          : "";

      const isAuthCall = /\/api\/auth\/(login|token|me)/.test(url);

      if (resp.status === 401 && !isAuthCall && !isOnLoginPage()) {
        redirectToLogin("session_expired");
        return resp;
      }

      if (resp.status === 403) {
        try {
          const data = await resp.clone().json();
          const msg =
            data?.detail ||
            "Sua conta foi bloqueada pelo administrador.";

          if (window.Swal) {
            await Swal.fire({
              icon: "error",
              title: "Acesso bloqueado",
              text: msg,
              confirmButtonText: "OK",
            });
          } else {
            alert(msg);
          }
        } catch (_) {}
        redirectToLogin("owner_blocked");
      }

      return resp;
    };
  })();

  // ==========================================================
  // LOAD LOGGED USER (/auth/me)
  // ==========================================================
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

      if (resp.status === 403) {
        redirectToLogin("owner_blocked");
        return;
      }

      if (!resp.ok) return;

      const user = await resp.json();
      window.__USER__ = user;

      // ----------------------------
      // IGNORAR_COLETA (vem do JWT)
      // ----------------------------
      window.IGNORAR_COLETA = !!user?.ignorar_coleta;
      try {
        localStorage.setItem(
          "ignorar_coleta",
          window.IGNORAR_COLETA ? "1" : "0"
        );
      } catch (_) {}

      // ----------------------------
      // UI
      // ----------------------------
      const nome =
        (user.username || "").trim() ||
        (user.email || "").trim() ||
        "Usuário";

      document
        .querySelectorAll(".user-name-text, .sidebar-user-name-text")
        .forEach((el) => (el.textContent = nome));

      const ddHeader = document.querySelector(
        ".dropdown-menu .dropdown-header"
      );
      if (ddHeader) ddHeader.textContent = `Bem-vindo(a) ${nome}!`;

    } catch (e) {
      // Não logar falhas de rede/API indisponível para reduzir ruído no console
      const isNetworkError =
        e?.name === "TypeError" &&
        (e?.message?.includes("fetch") || e?.message?.includes("Failed to fetch") || e?.message?.includes("NetworkError"));
      if (!isNetworkError) {
        console.error("[auth] erro ao carregar usuário:", e);
      }
    }
  }

  // ==========================================================
  // BOOT
  // ==========================================================
  document.addEventListener("DOMContentLoaded", () => {
    if (!isOnLoginPage()) carregarUsuarioLogado();
  });

  window.addEventListener("focus", () => {
    if (!isOnLoginPage()) carregarUsuarioLogado();
  });

})();

/* ==========================================================
   ensureAuth — versão simplificada (cookie-only)
   ========================================================== */
(function (w) {
  "use strict";

  if (w.ensureAuth) return;

  const API_ORIGIN = "https://track-saidas-api.onrender.com";
  const API_ME = `${API_ORIGIN}/api/auth/me`;

  async function ensureAuth() {
    try {
      const r = await fetch(API_ME, { credentials: "include" });
      if (r.ok) return;
    } catch (_) {}

    const current =
      w.location.pathname +
      w.location.search +
      w.location.hash;

    w.location.replace(
      `auth-signin-tracking-v2.html?reason=session_expired&redirect=${encodeURIComponent(
        current
      )}`
    );
  }

  w.ensureAuth = ensureAuth;
})(window);
