/**
 * Cobrança de Owners — utilitários compartilhados (lista e detalhe).
 * Acesso: somente root (role 0). O backend também recusa os demais perfis (403).
 */
(function (w) {
  "use strict";

  var API_BASE = (w.TRACK_API_URL || "").replace(/\/+$/, "");
  var PREFIX = API_BASE + "/admin/cobranca-owners";

  function ApiError(status, message) {
    this.status = status;
    this.message = message;
  }

  function detailMessage(body, fallback) {
    if (!body) return fallback;
    var d = body.detail;
    if (typeof d === "string" && d.trim()) return d;
    if (Array.isArray(d) && d.length) {
      var first = d[0] || {};
      return first.msg ? "Dados inválidos: " + first.msg : fallback;
    }
    return fallback;
  }

  async function request(method, path, payload) {
    var opts = { method: method, credentials: "include", headers: {} };
    if (payload !== undefined) {
      opts.headers["Content-Type"] = "application/json";
      opts.body = JSON.stringify(payload);
    }
    var res;
    try {
      res = await fetch(PREFIX + path, opts);
    } catch (_) {
      throw new ApiError(0, "Sem conexão com o servidor. Tente de novo.");
    }
    var body = null;
    try { body = await res.json(); } catch (_) { body = null; }
    if (!res.ok) {
      var fallback = res.status === 403
        ? "Acesso restrito ao root."
        : "Não foi possível concluir. Tente de novo.";
      throw new ApiError(res.status, detailMessage(body, fallback));
    }
    return body;
  }

  function qs(params) {
    var p = new URLSearchParams();
    Object.keys(params || {}).forEach(function (k) {
      var v = params[k];
      if (v === undefined || v === null || v === "" || v === false) return;
      p.set(k, String(v));
    });
    var s = p.toString();
    return s ? "?" + s : "";
  }

  async function currentUser() {
    if (typeof w.ensureAuth === "function") {
      try { await w.ensureAuth(); } catch (_) {}
    }
    try {
      var res = await fetch(API_BASE + "/auth/me", { credentials: "include" });
      if (!res.ok) return null;
      return await res.json();
    } catch (_) {
      return null;
    }
  }

  async function isRoot() {
    var user = await currentUser();
    return !!user && parseInt(user.role, 10) === 0;
  }

  function escapeHtml(s) {
    if (s == null) return "";
    var div = document.createElement("div");
    div.textContent = String(s);
    return div.innerHTML;
  }

  var brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

  function money(v) {
    if (v === null || v === undefined || v === "") return "—";
    var n = Number(v);
    if (!isFinite(n)) return "—";
    return brl.format(n);
  }

  function preco(v) {
    if (v === null || v === undefined || v === "") return "Sem preço";
    var n = Number(v);
    if (!isFinite(n)) return "—";
    var casas = Math.max(2, (String(v).split(".")[1] || "").replace(/0+$/, "").length);
    return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: casas, maximumFractionDigits: casas });
  }

  function int(v) {
    var n = Number(v || 0);
    return n.toLocaleString("pt-BR");
  }

  function dmy(iso) {
    if (!iso) return "—";
    var s = String(iso).slice(0, 10).split("-");
    if (s.length !== 3) return "—";
    return s[2] + "/" + s[1] + "/" + s[0];
  }

  function dmyHm(iso) {
    if (!iso) return "—";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return dmy(iso);
    return d.toLocaleDateString("pt-BR") + " " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  }

  function periodoLabel(inicio, fim) {
    return dmy(inicio) + " a " + dmy(fim);
  }

  var STATUS_LABELS = {
    em_apuracao: "Em apuração",
    conferido: "Conferido",
    fechado: "Fechado",
    informado: "Informado",
    reaberto: "Reaberto",
    anulado: "Anulado"
  };

  function statusTag(status, label) {
    var cls = {
      conferido: "cob-tag--conferido",
      fechado: "cob-tag--fechado",
      informado: "cob-tag--informado",
      anulado: "cob-tag--bloqueio",
      reaberto: "cob-tag--atencao"
    }[status] || "";
    var icon = {
      conferido: "ri-check-line",
      fechado: "ri-lock-line",
      informado: "ri-mail-check-line",
      em_apuracao: "ri-time-line",
      reaberto: "ri-arrow-go-back-line",
      anulado: "ri-close-circle-line"
    }[status] || "ri-time-line";
    return "<span class='cob-tag " + cls + "'><i class='" + icon + "' aria-hidden='true'></i>" +
      escapeHtml(label || STATUS_LABELS[status] || status) + "</span>";
  }

  function toast(msg, icon) {
    if (w.Swal && w.Swal.mixin) {
      w.Swal.mixin({ toast: true, position: "top-end", showConfirmButton: false, timer: 3000, timerProgressBar: false })
        .fire({ icon: icon || "success", title: msg });
    }
  }

  function alertError(err) {
    var msg = (err && err.message) || "Não foi possível concluir. Tente de novo.";
    if (w.Swal) {
      w.Swal.fire({ icon: "error", title: "Não foi possível concluir", text: msg, confirmButtonText: "Entendi" });
    } else {
      w.alert(msg);
    }
  }

  async function download(path, fallbackName) {
    var res;
    try {
      res = await fetch(PREFIX + path, { credentials: "include" });
    } catch (_) {
      throw new ApiError(0, "Sem conexão com o servidor. Tente de novo.");
    }
    if (!res.ok) {
      var body = null;
      try { body = await res.json(); } catch (_) {}
      throw new ApiError(res.status, detailMessage(body, "Não foi possível gerar o arquivo."));
    }
    var name = fallbackName;
    var cd = res.headers.get("Content-Disposition") || "";
    var m = cd.match(/filename="?([^";]+)"?/i);
    if (m) name = m[1];
    var blob = await res.blob();
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }

  function novaChave() {
    if (w.crypto && w.crypto.randomUUID) return "aj-" + w.crypto.randomUUID();
    return "aj-" + Date.now() + "-" + Math.random().toString(36).slice(2, 10);
  }

  w.CobrancaOwners = {
    get: function (path, params) { return request("GET", path + qs(params)); },
    post: function (path, payload) { return request("POST", path, payload === undefined ? {} : payload); },
    put: function (path, payload) { return request("PUT", path, payload); },
    del: function (path) { return request("DELETE", path); },
    download: download,
    isRoot: isRoot,
    escapeHtml: escapeHtml,
    money: money,
    preco: preco,
    int: int,
    dmy: dmy,
    dmyHm: dmyHm,
    periodoLabel: periodoLabel,
    statusTag: statusTag,
    STATUS_LABELS: STATUS_LABELS,
    toast: toast,
    alertError: alertError,
    novaChave: novaChave
  };
})(window);
