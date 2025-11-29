(function () {

  // ==========================================================
  // NOVO — flag global default (carregado do localStorage)
  // ==========================================================
  try {
    window.IGNORAR_COLETA = localStorage.getItem("ignorar_coleta") === "1";
  } catch (_) {
    window.IGNORAR_COLETA = false;
  }

  const API_ORIGIN = "https://track-saidas-api.onrender.com";
  const LOGIN_PAGE = "auth-signin-tracking-v2.html";

  /* ---------------------------------------------------------
     Helpers
     --------------------------------------------------------- */
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

    const current =
      window.location.pathname +
      window.location.search +
      window.location.hash;

    const target = `${LOGIN_PAGE}?reason=${encodeURIComponent(
      reason
    )}&redirect=${encodeURIComponent(current)}`;

    try {
      localStorage.removeItem("access_token");
      localStorage.removeItem("acess_token");
      localStorage.removeItem("trackingToken");
      localStorage.removeItem("trackingUser");
      localStorage.removeItem("ignorar_coleta");

      sessionStorage.removeItem("access_token");
      sessionStorage.removeItem("acess_token");
      sessionStorage.removeItem("trackingToken");
      sessionStorage.removeItem("trackingUser");
    } catch (_) {}

    window.location.replace(target);
  }

  /* ---------------------------------------------------------
     Interceptor global — 401 e 403
     --------------------------------------------------------- */
  (function patchFetchForAuthErrors() {
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

      // -----------------------------------
      // 401 — sessão expirada
      // -----------------------------------
      if (resp.status === 401 && !isOnLoginPage() && !isAuthAction) {
        redirectToLogin("session_expired");
      }

      // -----------------------------------
      // 403 — Owner bloqueado
      // -----------------------------------
      if (resp.status === 403) {
        try {
          const data = await resp.clone().json();
          const msg =
            data?.detail ||
            "Sua conta foi bloqueada pelo administrador.";

          if (window.Swal) {
            Swal.fire({
              icon: "error",
              title: "Acesso bloqueado",
              text: msg,
              confirmButtonText: "OK",
            }).then(() => redirectToLogin("owner_blocked"));
          } else {
            alert(msg);
            redirectToLogin("owner_blocked");
          }
        } catch (_) {
          redirectToLogin("owner_blocked");
        }
      }

      return resp;
    };
  })();

  /* ---------------------------------------------------------
     Update UI — Carregar usuário logado
     --------------------------------------------------------- */
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

      if (!resp.ok) {
        console.warn("[user] /auth/me não OK:", resp.status);
        return;
      }

      const user = await resp.json();

      const username = (user.username || "").trim();
      const email = (user.email || "").trim();
      const nomeExibicao = username || email || "Usuário";

      // Preenche UI
      document
        .querySelectorAll(".user-name-text, .sidebar-user-name-text")
        .forEach((el) => {
          el.textContent = nomeExibicao;
        });

      const ddHeader = document.querySelector(".dropdown-menu .dropdown-header");
      if (ddHeader) ddHeader.textContent = `Bem-vindo(a) ${nomeExibicao}!`;

      // Substitui placeholders antigos
      document.querySelectorAll("span, div, a, strong, b, h6").forEach((el) => {
        if (
          el.childElementCount === 0 &&
          /\bAnna\b|\bAdame\b/i.test(el.textContent || "")
        ) {
          el.textContent = nomeExibicao;
        }
      });

      // ----------------------------
      // Guardar usuário na sessão
      // ----------------------------
      window.__USER__ = user;
      localStorage.setItem("user", JSON.stringify(user));

      // ----------------------------
      // NOVO: carregar ignorar_coleta
      // ----------------------------
      window.IGNORAR_COLETA = !!user?.ignorar_coleta;

      try {
        localStorage.setItem(
          "ignorar_coleta",
          window.IGNORAR_COLETA ? "1" : "0"
        );
      } catch (_) {}

    } catch (e) {
      console.error("Erro ao carregar usuário logado:", e);

      if (e.name === "TypeError" && e.message.includes("NetworkError")) {
        if (window.Swal) {
          Swal.fire({
            icon: "error",
            title: "Falha de conexão",
            text: "Não foi possível conectar ao servidor.",
            confirmButtonText: "OK",
          });
        } else {
          alert("Falha de conexão com o servidor.");
        }
      }
    }
  }

  // Carrega ao abrir aba ou página
  window.addEventListener("focus", () => {
    if (!isOnLoginPage()) carregarUsuarioLogado();
  });
  document.addEventListener("DOMContentLoaded", () => {
    if (!isOnLoginPage()) carregarUsuarioLogado();
  });

})();

/* ---------------------------------------------------------
   ensureAuth — Verificação global simples
   --------------------------------------------------------- */
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
          w.sessionStorage.getItem("access_token")
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

        const r = await fetch(`${API_AUTH}/me`, {
          credentials: "include",
        });

        if (r.ok) {
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
