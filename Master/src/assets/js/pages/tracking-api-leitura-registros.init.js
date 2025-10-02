// assets/js/pages/tracking-api-leitura-registros.init.js
// Wrapper da API (lista/atualiza/exclui saídas) com paginação correta via limit+1.

(function () {
  const BASE = (window.TRACK_API_URL || "").replace(/\/+$/,"");

  if (!window.TrackAPI) window.TrackAPI = {};

  // -------- util de request
  async function req(path, opts) {
    const res = await fetch(BASE + path, Object.assign({
      credentials: "include",
      headers: { "Accept": "application/json" }
    }, opts || {}));
    return res;
  }

  // -------- LISTAR SAÍDAS (usa limit/offset, com técnica "limit+1" p/ detectar próxima página)
  // GET /saidas/listar?de=&ate=&entregador=&status=&codigo=&limit=&offset=
  window.TrackAPI.listSaidas = async function (params) {
    const page     = Number(params && params.page)     || 1;
    const pageSize = Number(params && params.pageSize) || 20;

    // técnica limit+1
    const limitRequested = pageSize + 1;
    const offset = (page - 1) * pageSize;

    const q = new URLSearchParams();
    if (params && params.from)        q.set("de", params.from);
    if (params && params.to)          q.set("ate", params.to);
    if (params && params.entregador)  q.set("entregador", params.entregador);
    if (params && params.status)      q.set("status", params.status);
    if (params && params.codigo)      q.set("codigo", params.codigo);
    // Se seu back aceitar ordenação, mapeie aqui. Exemplo:
    // if (params && params.sort) q.set("ordenar", params.sort);

    q.set("limit",  String(limitRequested));
    q.set("offset", String(offset));

    try {
      const res = await req("/saidas/listar?" + q.toString());
      const ok  = res.ok;

      // tenta pegar total do header (caso o back envie)
      let total = null;
      const hTotal = res.headers.get("X-Total-Count") || res.headers.get("x-total-count");
      if (hTotal != null) total = Number(hTotal);

      // interpreta o corpo
      let data = null;
      try { data = await res.json(); } catch (_) {}

      let rows = [];
      if (Array.isArray(data)) {
        rows = data;
      } else if (data && Array.isArray(data.items)) {
        rows = data.items;
        if (typeof data.total === "number") total = data.total;
      } else if (data && Array.isArray(data.rows)) {
        rows = data.rows;
        if (typeof data.total === "number") total = data.total;
      } else if (data && Array.isArray(data.data)) {
        rows = data.data;
        if (typeof data.total === "number") total = data.total;
      }

      // detecta se há próxima página (veio 1 item a mais)
      const hasMore = rows.length > pageSize;

      // exibe apenas pageSize no front
      if (hasMore) rows = rows.slice(0, pageSize);

      // fallback do total quando o back não informa
      if (total == null) {
        total = offset + rows.length + (hasMore ? 1 : 0);
      }

      return { ok, status: res.status, rows, total, page, pageSize, hasMore };
    } catch (err) {
      return { ok: false, status: 0, error: String((err && err.message) || err) };
    }
  };

  // -------- ATUALIZAR SAÍDA
  // PATCH /saidas/{id}
  window.TrackAPI.updateSaida = async function (id, payload) {
    const res = await req("/saidas/" + encodeURIComponent(id), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload || {})
    });
    let data = null; try { data = await res.json(); } catch (_){}
    return { ok: res.ok, status: res.status, data, error: data && data.error };
  };

  // -------- EXCLUIR SAÍDA
  // DELETE /saidas/{id}
  window.TrackAPI.deleteSaida = async function (id) {
    const res = await req("/saidas/" + encodeURIComponent(id), { method: "DELETE" });
    let data = null; try { data = await res.json(); } catch (_){}
    return { ok: res.ok, status: res.status, data, error: data && data.error };
  };

  // -------- LISTA ENTREGADORES (opcional)
  // GET /entregadores
  window.TrackAPI.getEntregadores = async function () {
    const res = await req("/entregadores");
    let data = null; try { data = await res.json(); } catch (_){}
    return data;
  };
})();
