// ============== TrackingSaidas • API wrapper (leituras + registros) ==============
(function (win) {
  "use strict";

  // Base da API já definida no HTML (ex.: window.TRACK_API_URL = 'https://.../api')
  const API_BASE = String(win.TRACK_API_URL || "").replace(/\/+$/, "");

  // Helpers ---------------------------------------------------
  async function request(path, init = {}) {
    const url = API_BASE + (path.startsWith("/") ? path : ("/" + path));
    const resp = await fetch(url, {
      credentials: "include",
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init.headers || {})
      }
    });
    let data = null;
    try { data = await resp.json(); } catch (_) {}
    return { ok: resp.ok, status: resp.status, data };
  }

  // Namespace público -----------------------------------------
  const API = (win.TrackAPI = win.TrackAPI || {});

  /**
   * POST /saidas/registrar
   * Envia {entregador, codigo, servico}    
   */
  API.registerSaida = async function registerSaida({ entregador, codigo, servico }) {
      const body = JSON.stringify({ entregador, codigo, servico });
    // 1ª tentativa (sem barra final)
    let resp;
    try {
      resp = await request("/saidas/registrar", { method: "POST", body });
    } catch (e) {
      // queda de rede — mantém compat com quem usa fila local
      resp = { ok: false, status: 0, data: null };
    }

    // fallback com barra (alguns backends montam rota com /)
    if (resp.status === 404) {
      try {
        resp = await request("/saidas/registrar/", { method: "POST", body });
      } catch (e) {
        resp = { ok: false, status: 0, data: null };
      }
    }

    // evento para o leitor por câmera decidir empilhar só quando 201 ---
    try {
      if (resp && typeof resp.status === "number") {
        if (resp.status === 201) {
          win.dispatchEvent(new CustomEvent("saida-resultado", {
            detail: { status: "ok", codigo, servico }
          }));
        } else if (resp.status === 409) {
          win.dispatchEvent(new CustomEvent("saida-resultado", {
            detail: { status: "dup", codigo, servico }
          }));
        } else if (resp.status === 422) {
          win.dispatchEvent(new CustomEvent("saida-resultado", {
            detail: { status: "erro", codigo, servico, http: 422 }
          }));
        } else if (resp.status === 0) {
          // erro de rede (fica "Enviando..." na fila local)
          win.dispatchEvent(new CustomEvent("saida-resultado", {
            detail: { status: "erro", codigo, servico, http: 0 }
          }));
        }
      }
    } catch (_) {}

    return resp;
  };

// --- Editar Saída (PATCH /saidas/{id_saida}) ---
// Campos editáveis: codigo, entregador, status
TrackAPI.updateSaida = async function updateSaida({ id_saida, codigo, entregador, status }) {
  if (!id_saida) throw new Error("id_saida obrigatório");

  // monta payload apenas com os campos enviados
  const payload = {};
  if (codigo      != null) payload.codigo      = codigo;
  if (entregador  != null) payload.entregador  = entregador;
  if (status      != null) payload.status      = status;

  const resp = await (async () => {
    const url = `${window.TRACK_API_URL.replace(/\/+$/, "")}/saidas/${encodeURIComponent(id_saida)}`;
    const r = await fetch(url, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    let data = null; try { data = await r.json(); } catch(_) {}
    return { ok: r.ok, status: r.status, data };
  })();

  // Notifica a UI (opcional, já deixa pronto para atualizar tabela em tempo real)
  try {
    if (resp.ok) {
      window.dispatchEvent(new CustomEvent("saida-atualizada", {
        detail: { id_saida, ...payload, statusHttp: resp.status, data: resp.data }
      }));
    }
  } catch(_) {}

  return resp;
};

// --- Excluir Saída (DELETE /saidas/{id_saida}) ---
TrackAPI.deleteSaida = async function deleteSaida(id_saida) {
  if (!id_saida) throw new Error("id_saida obrigatório");

  const resp = await (async () => {
    const url = `${window.TRACK_API_URL.replace(/\/+$/, "")}/saidas/${encodeURIComponent(id_saida)}`;
    const r = await fetch(url, {
      method: "DELETE",
      credentials: "include"
    });
    let data = null; try { data = await r.json(); } catch(_) {}
    return { ok: r.ok, status: r.status, data };
  })();

  // Notifica a UI para remover a linha da tabela, se quiser aproveitar
  try {
    if (resp.ok || resp.status === 204 || resp.status === 200) {
      window.dispatchEvent(new CustomEvent("saida-excluida", {
        detail: { id_saida, statusHttp: resp.status }
      }));
    }
  } catch(_) {}

  return resp;
};


  // Outros helpers
  API.getEntregadores = async function getEntregadores({ ativos = true } = {}) {
    const q = ativos ? "?ativos=true" : "";
    return await request("/entregadores/" + q, { method: "GET" });
  };

})(window);