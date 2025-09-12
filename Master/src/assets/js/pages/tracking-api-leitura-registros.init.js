// assets/js/pages/tracking-saida.api.js
// Wrapper da API para a tela de Leitura
(function (global) {
  "use strict";

  // Namespace exportado
  const ns = global.TrackAPI || {};

  // Base da API: pode sobrescrever em runtime com window.TRACK_API_URL
  const API_BASE = global.TRACK_API_URL || (location.origin + "/api");

  // ---------------- Auth / Headers ----------------
  function getToken() {
    return (
      localStorage.getItem("access_token") ||
      localStorage.getItem("acess_token") || // cobre possível typo
      sessionStorage.getItem("access_token")
    );
  }

  function buildHeaders(extra) {
    const h = { Accept: "application/json", ...(extra || {}) };
    const t = getToken();
    if (t) h.Authorization = `Bearer ${t}`;
    return h;
  }

  // ---------------- Request helper ----------------
  async function request(path, options = {}) {
    const res = await fetch(API_BASE + path, {
      ...options,
      headers: buildHeaders(options.headers),
    });

    let data = null;
    try { data = await res.json(); } catch (_) {}

    if (!res.ok) {
      // Devolve um erro consistente para o caller
      const err = {
        status: res.status,
        ...(data || {}),
        error: (data && data.error) || res.statusText || "Erro na requisição"
      };
      throw err;
    }
    return data;
  }

  // ---------------- Endpoints usados no front ----------------

  // Entregadores do usuário logado (já filtrados no back)
  // GET /entregadores?ativos=true
  ns.getEntregadores = function () {
    return request("/entregadores?ativos=true");
  };

  // Registrar leitura/saída (back classifica e valida)
  // POST /saidas/registrar  { entregador, codigo }
  ns.registerSaida = function ({ entregador, codigo }) {
    return request("/saidas/registrar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entregador, codigo }),
    });
  };

  // Lista saídas com filtros (usada na página de Registros)
ns.listSaidas = function (params) {
const q = new URLSearchParams(
Object.entries(params || {}).filter(([, v]) => v !== "" && v != null)
);
return request("/saidas?" + q.toString());
};

// Atualiza um registro (usada no modal de edição da página de Registros)
ns.updateSaida = function (id, payload) {
return request("/saidas/" + encodeURIComponent(id), {
method: "PATCH",
headers: { "Content-Type": "application/json" },
body: JSON.stringify(payload || {}),
});
};

  // Opcional (diagnóstico): GET /health
  ns.ping = function () {
    return request("/health");
  };

    // Exporta
  global.TrackAPI = ns;
})(window);
