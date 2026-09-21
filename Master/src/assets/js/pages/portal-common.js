(function (w) {
  "use strict";
  var TOKEN_KEY = "rotevo_portal_token";

  var STATUS_MAP = {
    aguardando_coleta: { label: "Aguardando coleta", badge: "ps-badge-aguardando" },
    etiquetado: { label: "Aguardando coleta", badge: "ps-badge-aguardando" },
    coletado: { label: "Coletado", badge: "ps-badge-coletado" },
    saiu: { label: "Coletado", badge: "ps-badge-coletado" },
    em_rota: { label: "Saiu para entrega", badge: "ps-badge-rota" },
    em_entrega: { label: "Saiu para entrega", badge: "ps-badge-rota" },
    saiu_para_entrega: { label: "Saiu para entrega", badge: "ps-badge-rota" },
    ausente: { label: "Destinatário ausente", badge: "ps-badge-ausente" },
    entregue: { label: "Entregue", badge: "ps-badge-entregue" },
    cancelado: { label: "Cancelado", badge: "ps-badge-cancelado" },
    devolvido: { label: "Devolvido", badge: "ps-badge-devolvido" },
    devolucao: { label: "Devolvido", badge: "ps-badge-devolvido" },
  };

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

  function formatDate(iso) {
    if (!iso) return "—";
    var d = new Date(iso.length === 10 ? iso + "T12:00:00" : iso);
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("pt-BR");
  }

  function normalizeStatusKey(status) {
    return String(status || "")
      .trim()
      .toLowerCase()
      .replace(/-/g, "_")
      .replace(/\s+/g, "_");
  }

  function statusMeta(status, statusLabel) {
    var key = normalizeStatusKey(status);
    var meta = STATUS_MAP[key];
    if (meta) return meta;
    if (statusLabel) {
      return { label: statusLabel, badge: "ps-badge-default" };
    }
    return { label: "—", badge: "ps-badge-default" };
  }

  function statusLabel(status, fallbackLabel) {
    return statusMeta(status, fallbackLabel).label;
  }

  function statusBadgeClass(status) {
    return statusMeta(status).badge;
  }

  function statusBadgeHtml(status, fallbackLabel) {
    var meta = statusMeta(status, fallbackLabel);
    return (
      '<span class="ps-badge ' +
      meta.badge +
      '">' +
      escapeHtml(fallbackLabel || meta.label) +
      "</span>"
    );
  }

  function formatRelative(iso) {
    if (!iso) return "";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    var diffMs = Date.now() - d.getTime();
    if (diffMs < 0) diffMs = 0;
    var min = Math.floor(diffMs / 60000);
    if (min < 1) return "Atualizado agora";
    if (min < 60) return "Atualizado há " + min + " min";
    var h = Math.floor(min / 60);
    if (h < 24) return "Atualizado há " + h + " h";
    var days = Math.floor(h / 24);
    if (days === 1) return "Atualizado ontem";
    if (days < 7) return "Atualizado há " + days + " dias";
    return "Atualizado em " + formatDate(iso);
  }

  function renderTimeline(ol, vaziaEl, events) {
    if (!ol) return;
    ol.innerHTML = "";
    events = events || [];
    if (!events.length) {
      if (vaziaEl) vaziaEl.classList.remove("d-none");
      return;
    }
    if (vaziaEl) vaziaEl.classList.add("d-none");
    events.forEach(function (ev, idx) {
      var li = document.createElement("li");
      li.className = "list-group-item px-0 portal-timeline-item" + (idx === 0 ? " is-current" : "");
      var motoboy =
        ev.motoboy_nome && String(ev.detalhe || "").indexOf(ev.motoboy_nome) === -1
          ? '<div class="small mt-1">Entregador: ' + escapeHtml(ev.motoboy_nome) + "</div>"
          : "";
      li.innerHTML =
        '<div class="fw-semibold">' +
        escapeHtml(ev.titulo || "") +
        "</div>" +
        '<div class="small text-muted">' +
        escapeHtml(formatDateTime(ev.quando)) +
        "</div>" +
        (ev.detalhe ? '<div class="small mt-1">' + escapeHtml(ev.detalhe) + "</div>" : "") +
        motoboy;
      ol.appendChild(li);
    });
  }

  function bindSair() {
    document.getElementById("btnSair")?.addEventListener("click", function () {
      setToken("");
      location.href = "portal-login.html";
    });
  }

  function navKeyFromPath(path) {
    path = (path || "").toLowerCase();
    if (path.indexOf("portal-visao") === 0) return "visao";
    if (path.indexOf("portal-pedido") === 0) return "pedidos";
    if (path.indexOf("portal-emitir") === 0) return "emitir";
    if (path.indexOf("portal-etiqueta") === 0) return "etiquetas";
    return "";
  }

  function highlightNav() {
    var path = (location.pathname.split("/").pop() || "").toLowerCase();
    var key = navKeyFromPath(path);
    document.querySelectorAll(".portal-nav a[data-nav]").forEach(function (a) {
      var active = a.getAttribute("data-nav") === key;
      a.classList.toggle("is-active", active);
      if (active) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });
    // legado (navbar antiga)
    document.querySelectorAll("nav a.btn[href]").forEach(function (a) {
      var href = (a.getAttribute("href") || "").toLowerCase();
      var active = href === path || (path === "portal-pedido.html" && href === "portal-pedidos.html");
      if (!active) return;
      a.classList.remove("btn-soft-primary", "btn-soft-secondary");
      a.classList.add("btn-primary");
    });
  }

  function fillIdentity(me) {
    me = me || {};
    var transportadora =
      me.transportadora ||
      me.transportadora_nome ||
      me.nome_transportadora ||
      me.owner_nome ||
      me.sub_base ||
      "Operação";
    var seller =
      me.seller_nome ||
      me.nome_seller ||
      me.loja ||
      me.base_nome ||
      me.nome ||
      me.login ||
      "Seller";
    var slogan = (me.transportadora_slogan || me.slogan || me.slogan_curto || "").trim();

    var elT = document.getElementById("portalTransportadora");
    var elS = document.getElementById("portalSellerNome");
    var elSlogan = document.getElementById("portalSlogan");
    if (elT) elT.textContent = transportadora;
    if (elS) elS.textContent = seller;
    if (elSlogan) {
      if (slogan && slogan.length <= 80) {
        elSlogan.textContent = slogan;
        elSlogan.classList.remove("d-none");
      } else {
        elSlogan.textContent = "";
        elSlogan.classList.add("d-none");
      }
    }
    document.querySelectorAll("[data-mirror]").forEach(function (node) {
      var id = node.getAttribute("data-mirror");
      var src = document.getElementById(id);
      if (!src) return;
      node.textContent = src.textContent;
      node.classList.toggle("d-none", src.classList.contains("d-none"));
    });
  }

  function todayISO() {
    var d = new Date();
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var day = String(d.getDate()).padStart(2, "0");
    return d.getFullYear() + "-" + m + "-" + day;
  }

  function daysAgoISO(n) {
    var d = new Date();
    d.setDate(d.getDate() - n);
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var day = String(d.getDate()).padStart(2, "0");
    return d.getFullYear() + "-" + m + "-" + day;
  }

  function resolvePeriod(periodo, de, ate) {
    var key = String(periodo || "hoje").toLowerCase();
    if (key === "7d") {
      return { periodo: "7d", de: daysAgoISO(6), ate: todayISO() };
    }
    if (key === "30d") {
      return { periodo: "30d", de: daysAgoISO(29), ate: todayISO() };
    }
    if (key === "custom") {
      return {
        periodo: "custom",
        de: de || todayISO(),
        ate: ate || todayISO(),
      };
    }
    return { periodo: "hoje", de: todayISO(), ate: todayISO() };
  }

  function buildQuery(params) {
    var qs = new URLSearchParams();
    Object.keys(params || {}).forEach(function (k) {
      var v = params[k];
      if (v == null || v === "") return;
      qs.set(k, String(v));
    });
    return qs.toString();
  }

  function readQuery() {
    return new URLSearchParams(location.search);
  }

  function maskCep(value) {
    var d = String(value || "").replace(/\D/g, "").slice(0, 8);
    if (d.length > 5) return d.slice(0, 5) + "-" + d.slice(5);
    return d;
  }

  function maskPhone(value) {
    var d = String(value || "").replace(/\D/g, "").slice(0, 11);
    if (d.length <= 2) return d.length ? "(" + d : "";
    if (d.length <= 6) return "(" + d.slice(0, 2) + ") " + d.slice(2);
    if (d.length <= 10) {
      return "(" + d.slice(0, 2) + ") " + d.slice(2, 6) + "-" + d.slice(6);
    }
    return "(" + d.slice(0, 2) + ") " + d.slice(2, 7) + "-" + d.slice(7);
  }

  function digitsOnly(value) {
    return String(value || "").replace(/\D/g, "");
  }

  async function bootShell() {
    if (!w.PortalSeller.requireAuth()) return false;
    bindSair();
    highlightNav();
    try {
      var res = await req("/me");
      var me = await res.json().catch(function () {
        return {};
      });
      if (!res.ok) {
        fillIdentity({});
        return true;
      }
      fillIdentity(me);
      w.PortalSeller._me = me;
      if (me.must_change_password && !/portal-emitir\.html/.test(location.pathname)) {
        location.href = "portal-emitir.html?trocar=1";
        return false;
      }
    } catch (ex) {
      if (ex && ex.status === 401) return false;
      fillIdentity({});
    }
    return true;
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
    formatDate: formatDate,
    formatRelative: formatRelative,
    renderTimeline: renderTimeline,
    bindSair: bindSair,
    highlightNav: highlightNav,
    fillIdentity: fillIdentity,
    statusLabel: statusLabel,
    statusBadgeClass: statusBadgeClass,
    statusBadgeHtml: statusBadgeHtml,
    resolvePeriod: resolvePeriod,
    buildQuery: buildQuery,
    readQuery: readQuery,
    todayISO: todayISO,
    daysAgoISO: daysAgoISO,
    maskCep: maskCep,
    maskPhone: maskPhone,
    digitsOnly: digitsOnly,
    requireAuth: function () {
      if (!token()) {
        location.href = "portal-login.html";
        return false;
      }
      return true;
    },
    boot: function () {
      return bootShell();
    },
    bootShell: bootShell,
  };
})(window);
