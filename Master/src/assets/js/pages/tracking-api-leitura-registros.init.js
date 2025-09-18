// Wrapper da API para Leitura/Registros
(function (global) {
  "use strict";

  const ns = global.TrackAPI || {};

  // Base definida no HTML (ou fallback)
  const API_BASE = (global.TRACK_API_URL || global.API_URL || "https://track-saidas-api.onrender.com/api")
    .replace(/\/+$/, "");

  function url(path) {
    return API_BASE + (path.startsWith("/") ? "" : "/") + path;
  }

  // Token opcional (se sua API usa Bearer). Cookies de sessão vão por credentials: 'include'
  function getToken() {
    return (
      localStorage.getItem("access_token") ||
      localStorage.getItem("acess_token") ||
      sessionStorage.getItem("access_token") ||
      sessionStorage.getItem("acess_token") ||
      null
    );
  }

  async function request(path, init) {
    const headers = Object.assign({ Accept: "application/json" }, (init && init.headers) || {});
    const token = getToken();
    if (token && !headers.Authorization) headers.Authorization = "Bearer " + token;

    const res = await fetch(url(path), Object.assign({ credentials: "include" }, init, { headers }));

    let data = null, text = "";
    try { data = await res.clone().json(); } catch (_) { try { text = await res.text(); } catch (__) {} }

    if (!res.ok) {
      return { ok: false, status: res.status, error: (data && data.error) || text || res.statusText, data };
    }
    return { ok: true, status: res.status, data: (data ?? null) };
  }

  // -------- Utils --------
  function formatTs(ts) {
    try {
      if (!ts) return "";
      // aceita Date, ISO string ou epoch numérico
      const d = (ts instanceof Date) ? ts : (typeof ts === "number" ? new Date(ts) : new Date(String(ts)));
      if (isNaN(d.getTime())) return "";
      // pt-BR, no timezone do browser
      return d.toLocaleString("pt-BR");
    } catch (_) { return ""; }
  }

  // -------- Endpoints --------

  // Lista entregadores do usuário logado
  ns.getEntregadores = function () {
    // incluo ?ativos=true para bater com teu uso
    return request("/entregadores?ativos=true");
  };

  // POST /api/saidas/registrar { entregador, codigo }
  ns.registerSaida = function ({ entregador, codigo }) {
    return request("/saidas/registrar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entregador, codigo })
    });
  };

  // GET /api/saidas/listar?de&ate&entregador&status&codigo&limit&offset
  ns.listSaidas = function (params) {
    params = params || {};
    const page     = Number(params.page || 1);
    const pageSize = Number(params.pageSize || 20);
    const limit    = pageSize;
    const offset   = Math.max(0, (page - 1) * pageSize);

    const qp = new URLSearchParams();
    if (params.from)        qp.set("de",  params.from);
    if (params.to)          qp.set("ate", params.to);
    if (params.entregador)  qp.set("entregador", params.entregador);
    if (params.status)      qp.set("status", params.status);
    if (params.codigo)      qp.set("codigo", params.codigo);
    qp.set("limit",  String(limit));
    qp.set("offset", String(offset));

    return request("/saidas/listar?" + qp.toString()).then(function (res) {
      if (!res || !res.ok) return res;

      // Normalização do payload do back:
      // - Array direto
      // - { rows: [], total } | { items: [], total } | { data: [], total }
      const d = res.data;
      let rows = Array.isArray(d) ? d : (d && (d.rows || d.items || d.data)) || [];
      const total = (d && typeof d.total === "number") ? d.total : rows.length;

      // >>> Ajuste para a coluna "Data Hora":
      // O front usa r.tsFmt. A API retorna "timestamp".
      rows = rows.map(function (r) {
        const ts = r.timestamp || r.ts || r.data_hora || r.datahora || r.date || null;
        return Object.assign({}, r, {
          tsFmt: r.tsFmt || formatTs(ts) // gera tsFmt quando não vier pronto
        });
      });

      return { ok: true, page, pageSize, total, rows };
    });
  };

  // PATCH /api/saidas/:id
  ns.updateSaida = function (id, payload) {
    return request("/saidas/" + encodeURIComponent(id), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload || {})
    });
  };

ns.deleteSaida = function(id){
  return request("/saidas/" + encodeURIComponent(id), { method: "DELETE" });
};


  // Diagnóstico opcional
  ns.ping = function () { return request("/health"); };

  // Exporta
  global.TrackAPI = ns;
})(window);
