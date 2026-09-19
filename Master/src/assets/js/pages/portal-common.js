(function (w) {
  "use strict";
  var TOKEN_KEY = "rotevo_portal_token";

  function apiBase() {
    return String(w.getTrackApiUrl ? w.getTrackApiUrl() : "").replace(/\/+$/, "") + "/portal";
  }

  function token() {
    return localStorage.getItem(TOKEN_KEY) || "";
  }

  function setToken(value) {
    if (value) localStorage.setItem(TOKEN_KEY, value);
    else localStorage.removeItem(TOKEN_KEY);
  }

  function authHeaders(json) {
    var h = { Accept: "application/json" };
    if (json) h["Content-Type"] = "application/json";
    if (token()) h.Authorization = "Bearer " + token();
    return h;
  }

  function parseDetail(body) {
    if (!body) return "Não foi possível concluir.";
    var d = body.detail != null ? body.detail : body.message;
    if (typeof d === "string") return d;
    if (d && typeof d === "object" && d.message) return d.message;
    return "Não foi possível concluir.";
  }

  async function req(path, options) {
    var opts = options || {};
    var res = await fetch(apiBase() + path, Object.assign({ headers: authHeaders(!!opts.body) }, opts));
    if (res.status === 401) {
      setToken("");
      if (!/portal-login\.html$/.test(location.pathname)) {
        location.href = "portal-login.html";
      }
      var err401 = new Error("Sessão expirada. Entre novamente.");
      err401.status = 401;
      throw err401;
    }
    return res;
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function formatDateTime(iso) {
    if (!iso) return "—";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function bindSair() {
    document.getElementById("btnSair")?.addEventListener("click", function () {
      setToken("");
      location.href = "portal-login.html";
    });
  }

  function highlightNav() {
    var path = (location.pathname.split("/").pop() || "").toLowerCase();
    document.querySelectorAll("nav a.btn[href]").forEach(function (a) {
      var href = (a.getAttribute("href") || "").toLowerCase();
      var active = href === path || (path === "portal-pedido.html" && href === "portal-pedidos.html");
      if (!active) return;
      a.classList.remove("btn-soft-primary", "btn-soft-secondary");
      a.classList.add("btn-primary");
    });
  }

  w.PortalSeller = {
    apiBase: apiBase,
    token: token,
    setToken: setToken,
    authHeaders: authHeaders,
    parseDetail: parseDetail,
    req: req,
    escapeHtml: escapeHtml,
    formatDateTime: formatDateTime,
    bindSair: bindSair,
    requireAuth: function () {
      if (!token()) {
        location.href = "portal-login.html";
        return false;
      }
      return true;
    },
    boot: function () {
      if (!w.PortalSeller.requireAuth()) return false;
      bindSair();
      highlightNav();
      return true;
    },
  };
})(window);
