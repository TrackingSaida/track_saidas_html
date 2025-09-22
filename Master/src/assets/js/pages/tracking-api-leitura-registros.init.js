// Wrapper da API para Leitura/Registros
(function (global) {
  "use strict";

  const ns = global.TrackAPI || {};

  // Base definida no HTML (ou fallback)
  const API_BASE = (global.TRACK_API_URL || global.API_URL || "https://track-saidas-api.onrender.com/api")
    .replace(/\/+$/, "");

  function url(path) { return API_BASE + (path.startsWith("/") ? "" : "/") + path; }

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
      return { ok: false, status: res.status, error: (data && (data.error || data.detail)) || text || res.statusText, data };
    }
    return { ok: true, status: res.status, data: (data ?? null) };
  }

  // -------- Utils --------
  function formatTs(ts) {
    try {
      if (!ts) return "";
      const d = (ts instanceof Date) ? ts : (typeof ts === "number" ? new Date(ts) : new Date(String(ts)));
      if (isNaN(d.getTime())) return "";
      return d.toLocaleString("pt-BR");
    } catch (_) { return ""; }
  }
  function getRowId(r){
    return r && (r.id_saida || r.idSaida || r.id || r._id || r.uuid || null);
  }

  // -------- Endpoints --------

  ns.getEntregadores = function () { return request("/entregadores?ativos=true"); };

  // Registrar saída (envia {entregador, codigo, servico} e emite 'saida-resultado')
TrackAPI.registerSaida = async function ({ entregador, codigo, servico }) {
  const body = JSON.stringify({ entregador, codigo, servico });

  // 1ª tentativa (sem barra final)
  let resp;
  try {
    const r1 = await fetch(
      window.TRACK_API_URL.replace(/\/+$/, '') + '/saidas/registrar',
      { method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' }, body }
    );
    let data = null; try { data = await r1.json(); } catch(_) {}
    resp = { ok: r1.ok, status: r1.status, data };
  } catch (_) {
    resp = { ok:false, status:0, data:null };
  }

  // fallback com barra final (alguns proxies/routers exigem)
  if (resp.status === 404) {
    try {
      const r2 = await fetch(
        window.TRACK_API_URL.replace(/\/+$/, '') + '/saidas/registrar/',
        { method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' }, body }
      );
      let data = null; try { data = await r2.json(); } catch(_) {}
      resp = { ok: r2.ok, status: r2.status, data };
    } catch (_) {
      resp = { ok:false, status:0, data:null };
    }
  }

  // → avisa o leitor da câmera (empilha só quando 201)
  try {
    if (resp.status === 201) {
      window.dispatchEvent(new CustomEvent('saida-resultado', {
        detail: { status:'ok',  codigo, servico }
      }));
    } else if (resp.status === 409) {
      window.dispatchEvent(new CustomEvent('saida-resultado', {
        detail: { status:'dup', codigo, servico }
      }));
    } else if (resp.status === 422) {
      window.dispatchEvent(new CustomEvent('saida-resultado', {
        detail: { status:'erro', codigo, servico, http:422 }
      }));
    } else if (resp.status === 0) {
      window.dispatchEvent(new CustomEvent('saida-resultado', {
        detail: { status:'erro', codigo, servico, http:0 }
      }));
    }
  } catch(_) {}

  return resp;
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
      const d = res.data;
      let rows = Array.isArray(d) ? d : (d && (d.rows || d.items || d.data)) || [];
      const total = (d && typeof d.total === "number") ? d.total : rows.length;
      rows = rows.map(function (r) {
        const ts = r.timestamp || r.ts || r.data_hora || r.datahora || r.date || null;
        const id = getRowId(r);
        return Object.assign({}, r, { id: id, tsFmt: r.tsFmt || formatTs(ts) });
      });
      return { ok: true, page, pageSize, total, rows };
    });
  };

  // PATCH /api/saidas/{id_saida}
  ns.updateSaida = function (id, payload) {
    return request("/saidas/" + encodeURIComponent(id), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload || {})
    });
  };

  // DELETE /api/saidas/{id_saida}
  ns.deleteSaida = function (id) {
    return request("/saidas/" + encodeURIComponent(id), { method: "DELETE" });
  };

  ns.ping = function () { return request("/health"); };

  global.TrackAPI = ns;
})(window);