/* Avisos da base — envio e histórico (admin) */
(function () {
  "use strict";

  const API_URL = (window.TRACK_API_URL || "").replace(/\/+$/, "");
  const qs = (sel) => document.querySelector(sel);

  /** @type {{ id: number, nome: string, enabled: boolean }[]} */
  let motoboysState = [];

  async function api(path, opts = {}) {
    const res = await fetch(`${API_URL}${path}`, {
      credentials: "include",
      headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
      ...opts,
    });
    if (res.status === 401) {
      window.location.href = "auth-signin-tracking-v2.html";
      throw new Error("Não autenticado");
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const detail = data.detail || data.message || `HTTP ${res.status}`;
      throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
    }
    return data;
  }

  function fmtWhen(iso) {
    if (!iso) return "—";
    try {
      const d = new Date(iso);
      return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
    } catch {
      return iso;
    }
  }

  function escapeHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderMotoboysList() {
    const list = qs("#aviso-motoboys-list");
    if (!list) return;
    if (!motoboysState.length) {
      list.innerHTML = `<div class="text-muted small py-2 text-center">Nenhum motoboy ativo encontrado.</div>`;
      return;
    }
    list.innerHTML = motoboysState
      .map((m, idx) => {
        const id = `aviso-motoboy-toggle-${m.id}`;
        return `<div class="d-flex align-items-center justify-content-between gap-2 py-2 ${idx ? "border-top" : ""}">
          <label class="mb-0 flex-grow-1" for="${id}" style="cursor:pointer;">${escapeHtml(m.nome)}</label>
          <div class="form-check form-switch m-0">
            <input class="form-check-input aviso-motoboy-toggle" type="checkbox" role="switch"
              id="${id}" data-motoboy-id="${m.id}" ${m.enabled ? "checked" : ""} />
          </div>
        </div>`;
      })
      .join("");

    list.querySelectorAll(".aviso-motoboy-toggle").forEach((el) => {
      el.addEventListener("change", () => {
        const mid = Number(el.getAttribute("data-motoboy-id"));
        const row = motoboysState.find((m) => m.id === mid);
        if (row) row.enabled = !!el.checked;
      });
    });
  }

  async function loadMotoboys() {
    const list = qs("#aviso-motoboys-list");
    if (list) list.innerHTML = `<div class="text-muted small py-2 text-center">Carregando…</div>`;
    try {
      const rows = await api("/users/motoboys");
      motoboysState = (rows || [])
        .map((m) => {
          const id = Number(m.id_motoboy != null ? m.id_motoboy : m.id);
          if (!Number.isFinite(id)) return null;
          return {
            id,
            nome: m.nome || "Motoboy " + id,
            enabled: false,
          };
        })
        .filter(Boolean)
        .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" }));
      renderMotoboysList();
    } catch (e) {
      motoboysState = [];
      if (list) {
        list.innerHTML = `<div class="text-danger small py-2 text-center">Falha ao carregar motoboys.</div>`;
      }
      console.warn("avisos: falha motoboys", e);
    }
  }

  async function loadHistorico() {
    const tbody = qs("#avisos-tbody");
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="4" class="text-muted text-center py-4">Carregando…</td></tr>`;
    try {
      const rows = await api("/avisos?limit=40");
      if (!rows.length) {
        tbody.innerHTML = `<tr><td colspan="4" class="text-muted text-center py-4">Nenhum aviso enviado ainda.</td></tr>`;
        return;
      }
      tbody.innerHTML = rows
        .map((a) => {
          const urg = (a.prioridade || "") === "urgente";
          return `<tr>
            <td class="text-nowrap">${fmtWhen(a.criado_em)}</td>
            <td>${escapeHtml(a.titulo)}</td>
            <td>${urg ? '<span class="badge bg-danger">Urgente</span>' : '<span class="badge bg-secondary">Normal</span>'}</td>
            <td>${a.destinatarios_count ?? 0}</td>
          </tr>`;
        })
        .join("");
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="4" class="text-danger text-center py-4">${escapeHtml(e.message)}</td></tr>`;
    }
  }

  function syncTodosUi() {
    const todos = qs("#aviso-todos")?.checked;
    const wrap = qs("#wrap-motoboys");
    if (wrap) wrap.style.display = todos ? "none" : "";
    if (!todos) {
      // Ao abrir a lista, cada motoboy começa desligado — habilitar manualmente
      motoboysState = motoboysState.map((m) => ({ ...m, enabled: false }));
      renderMotoboysList();
    }
  }

  function selectedMotoboyIds() {
    return motoboysState.filter((m) => m.enabled).map((m) => m.id);
  }

  async function enviar() {
    const titulo = (qs("#aviso-titulo")?.value || "").trim();
    const mensagem = (qs("#aviso-mensagem")?.value || "").trim();
    const urgente = !!qs("#aviso-urgente")?.checked;
    const todos = !!qs("#aviso-todos")?.checked;
    const ids = selectedMotoboyIds();

    if (!titulo || !mensagem) {
      if (window.Swal) Swal.fire({ icon: "warning", title: "Preencha título e mensagem" });
      else alert("Preencha título e mensagem");
      return;
    }
    if (!todos && !ids.length) {
      if (window.Swal) Swal.fire({ icon: "warning", title: "Selecione motoboys ou marque todos" });
      else alert("Selecione motoboys ou marque todos");
      return;
    }

    const btn = qs("#btn-enviar-aviso");
    if (btn) btn.disabled = true;
    try {
      const res = await api("/avisos", {
        method: "POST",
        body: JSON.stringify({
          titulo,
          mensagem,
          prioridade: urgente ? "urgente" : "normal",
          todos_ativos: todos,
          motoboy_ids: todos ? null : ids,
        }),
      });
      const count = res?.destinatarios_count ?? 0;
      if (window.Swal) {
        await Swal.fire({
          icon: "success",
          title: "Aviso enviado",
          text: `Enviado para ${count} motoboy(s).`,
        });
      } else {
        alert(`Enviado para ${count} motoboy(s).`);
      }
      qs("#aviso-titulo").value = "";
      qs("#aviso-mensagem").value = "";
      qs("#aviso-urgente").checked = false;
      await loadHistorico();
    } catch (e) {
      if (window.Swal) Swal.fire({ icon: "error", title: "Erro", text: e.message });
      else alert(e.message);
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    qs("#aviso-todos")?.addEventListener("change", syncTodosUi);
    qs("#btn-enviar-aviso")?.addEventListener("click", () => void enviar());
    qs("#btn-atualizar-avisos")?.addEventListener("click", () => void loadHistorico());
    syncTodosUi();
    void loadMotoboys();
    void loadHistorico();
  });
})();
