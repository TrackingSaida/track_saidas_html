/* user.js — sessão, identidade e UI (Topbar/Sidebar)
 * - Redireciona para login quando a sessão expirar (401)
 * - Preenche Topbar/Sidebar com: Nome (linha de cima) e Sobrenome (linha de baixo)
 * - Mantém fallback leve usando username/email se o backend não retornar nome/sobrenome
 */

(function () {
  const API_ORIGIN = "https://track-saidas-api.onrender.com";
  const LOGIN_PAGE = "auth-signin-tracking-v2.html"; // relativo às páginas

    const HEARTBEAT_MS = 20000; // 20s
  const SKEW_MS = 5000; // redireciona até 5s antes do expirar para não dar erro visual
  let expiryTimer = null;
  let heartbeatTimer = null;
  let lastToken = null;

  function isOnLoginPage() {
    try {
      const u = new URL(window.location.href);
      return u.pathname.endsWith("/auth-signin-tracking-v2.html") || u.pathname.endsWith("/auth-signin-tracking-v2.html") || u.pathname.endsWith("auth-signin-tracking.html") || u.pathname.endsWith("auth-signin-basic.html");
    } catch (_) {
      return false;
    }
  }

  function redirectToLogin(reason = "session_expired") {
    if (isOnLoginPage()) return; // já está no login
    const current = window.location.pathname + window.location.search + window.location.hash;
    const target = `${LOGIN_PAGE}?reason=${encodeURIComponent(reason)}&redirect=${encodeURIComponent(current)}`;
    try {
      // Remove tokens e marcadores de sessão de ambas as storages
      localStorage.removeItem("access_token");
      localStorage.removeItem("acess_token"); // grafia alternativa observada
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
      const reqUrl = (typeof input === "string")
        ? input
        : (input && input.url) ? input.url : "";
      const isAuthAction = /\/api\/auth\/(login|register|refresh)/.test(reqUrl);
      if (resp && resp.status === 401 && !isOnLoginPage() && !isAuthAction) {
        redirectToLogin("unauthorized");
      }
      return resp;
    };
  })();

  function capitalizeWords(s) {
    return s.replace(/\b\w/g, c => c.toUpperCase());
  }

  async function carregarUsuarioLogado() {
    try {
      const resp = await fetch(`${API_ORIGIN}/api/auth/me`, {
        credentials: "include",
        headers: { "Accept": "application/json" }
      });

      if (resp.status === 401) {
        redirectToLogin("session_expired");
        return;
      }
      if (!resp.ok) {
        console.warn("[user] /auth/me não OK:", resp.status);
        return;
      }

      const user = await resp.json();

      // ---- Nome e Sobrenome ----
      let nome = (user.nome || "").trim();
      let sobrenome = (user.sobrenome || "").trim();
      const username = (user.username || "").trim();
      const email = (user.email || "").trim();

      // Fallbacks simples a partir de username/email
      if (!nome && username) {
        const cleaned = username.replace(/[_\-\.]+/g, " ").trim();
        const parts = cleaned.split(/\s+/);
        if (parts.length >= 1) nome = capitalizeWords(parts[0]);
        if (parts.length >= 2) sobrenome = capitalizeWords(parts.slice(1).join(" "));
      }
      if (!nome && email) {
        const local = email.split("@")[0].replace(/[_\-\.]+/g, " ").trim();
        const parts = local.split(/\s+/);
        if (parts.length >= 1) nome = nome || capitalizeWords(parts[0]);
        if (parts.length >= 2) sobrenome = sobrenome || capitalizeWords(parts.slice(1).join(" "));
      }
      const fullName = (nome || sobrenome) ? `${nome} ${sobrenome}`.trim() : (username || email || "Usuário");

      // ====== Mapeamento exato para seus seletores ======

      // 1) Topbar (arquivo topbar.html): .user-name-text (linha de cima) e .user-name-sub-text (linha de baixo)
      document.querySelectorAll(".user-name-text").forEach(el => {
        el.textContent = nome || fullName;
      });
      document.querySelectorAll(".user-name-sub-text").forEach(el => {
        el.textContent = sobrenome || "";
      });

      // 2) Sidebar (arquivo sidebar.html): .sidebar-user-name-text (cima) e .sidebar-user-name-sub-text (baixo)
      document.querySelectorAll(".sidebar-user-name-text").forEach(el => {
        el.textContent = nome || fullName;
      });
      document.querySelectorAll(".sidebar-user-name-sub-text").forEach(el => {
        // Estrutura atual: possui <i> e <span class="align-middle">Online</span>
        // Substituímos apenas o conteúdo do .align-middle para manter o ícone verde.
        const alignMiddle = el.querySelector(".align-middle");
        if (alignMiddle) {
          alignMiddle.textContent = sobrenome || "";
        } else {
          // Caso a estrutura mude no futuro, faz um fallback setando o texto direto
          el.textContent = sobrenome || "";
        }
      });

      // 3) Header do dropdown (ambiente topbar)
      const ddHeader = document.querySelector(".dropdown-menu .dropdown-header");
      if (ddHeader) {
        ddHeader.textContent = `Bem-vindo(a) ${fullName}!`;
      }

      // 4) Fallback para placeholders antigos (ex.: "Anna Adame")
      document.querySelectorAll("span, div, a, strong, b, h6").forEach(el => {
        if (el.childElementCount === 0 && /\bAnna\b|\bAdame\b/i.test(el.textContent || "")) {
          if (el.matches(".user-name-text, .sidebar-user-name-text")) {
            el.textContent = nome || fullName;
          } else if (el.matches(".user-name-sub-text, .sidebar-user-name-sub-text, .sidebar-user-name-sub-text .align-middle")) {
            el.textContent = sobrenome || "";
          } else if (el === ddHeader) {
            el.textContent = `Bem-vindo(a) ${fullName}!`;
          } else {
            el.textContent = fullName;
          }
        }
      });

      // Snapshot opcional
      window.__USER__ = { id: user.id, nome, sobrenome, username, email };

    } catch (e) {
      console.error("Erro ao carregar usuário logado:", e);
    }
  }

  // Revalida ao focar a aba
  window.addEventListener("focus", () => {
    if (!isOnLoginPage()) carregarUsuarioLogado();
  });

  document.addEventListener("DOMContentLoaded", () => {
    if (!isOnLoginPage()) carregarUsuarioLogado();
  });
})();


(function (w) {
  "use strict";


  w.UserUX = w.UserUX || {};

  if (!w.UserUX.creditAlert) {
    function hasSwal(){ return !!(w.Swal && typeof w.Swal.fire === "function"); }
    function escapeHtml(str){
      return String(str || "").replace(/[&<>"']/g, s =>
        ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[s])
      );
    }
    function openPlans(){
      const url = w.USER_BILLING_URL || "billing.html"; // ajuste se necessário
      try { w.location.assign(url); } catch { w.location.href = url; }
    }

    // SweetAlert padrão Velzon para falta de créditos
    w.UserUX.creditAlert = function(message){
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
            cancelButton: "btn btn-light"
          }
        }).then(res => { if (res.isConfirmed) openPlans(); });
      }
      alert(msg); // fallback sem SweetAlert
      return Promise.resolve();
    };
  }
})(window);

// Global helper de autenticação: verifica se há sessão válida e redireciona se necessário.
// A intenção é centralizar a lógica de checagem em um único local.
(function(w) {
  "use strict";
  if (!w.ensureAuth) {
    const API_ORIGIN = "https://track-saidas-api.onrender.com";
    const API_AUTH = `${API_ORIGIN}/api/auth`;
    // Retorna true se há um marker de sessão (trackingToken ou access_token)
    function hasMarker() {
      try {
        return (
          w.localStorage.getItem('trackingToken') ||
          w.sessionStorage.getItem('trackingToken') ||
          w.localStorage.getItem('access_token') ||
          w.localStorage.getItem('acess_token') ||
          w.sessionStorage.getItem('access_token') ||
          w.sessionStorage.getItem('acess_token')
        );
      } catch(_) { return false; }
    }
    async function ensureAuth() {
      try {
        if (hasMarker()) return;
        // Se houver cookie de access_token, define marker para evitar requisições extras.
        const cookie = document.cookie.split('; ').find(r => r.startsWith('access_token='));
        if (cookie) {
          try { w.localStorage.setItem('trackingToken', 'cookie-session'); } catch(_) {}
          return;
        }
        // Consulta o endpoint /me para checar a sessão
        const r = await fetch(`${API_AUTH}/me`, { credentials:'include' });
        if (r && r.ok) {
          try { w.localStorage.setItem('trackingToken', 'cookie-session'); } catch(_) {}
          return;
        }
      } catch (_) {}
      // Se não há sessão, redireciona para a página de login padrão.
      const current = w.location.pathname.split('/').pop();
      w.location.replace(`index.html?next=${encodeURIComponent(current)}`);
    }
    w.ensureAuth = ensureAuth;
  }
})(window);
