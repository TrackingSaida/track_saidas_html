/* Avisos da base — envio e histórico (admin) */
(function () {
  "use strict";

  const API_URL = (window.TRACK_API_URL || "").replace(/\/+$/, "");
  const qs = (sel) => document.querySelector(sel);

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

  async function loadMotoboys() {
    const sel = qs("#aviso-motoboys");
    if (!sel) return;
    try {
      const rows = await api("/users/motoboys");
      sel.innerHTML = (rows || [])
        .map((m) => `<option value="${m.id_motoboy}">${m.nome || "Motoboy " + m.id_motoboy}</option>`)
        .join("");
    } catch (e) {
      sel.innerHTML = "";
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
            <td>${(a.titulo || "").replace(/</g, "&lt;")}</td>
            <td>${urg ? '<span class="badge bg-danger">Urgente</span>' : '<span class="badge bg-secondary">Normal</span>'}</td>
            <td>${a.destinatarios_count ?? 0}</td>
          </tr>`;
        })
        .join("");
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="4" class="text-danger text-center py-4">${e.message}</td></tr>`;
    }
  }

  function syncTodosUi() {
    const todos = qs("#aviso-todos")?.checked;
    const wrap = qs("#wrap-motoboys");
    if (wrap) wrap.style.display = todos ? "none" : "";
  }

  async function enviar() {
    const titulo = (qs("#aviso-titulo")?.value || "").trim();
    const mensagem = (qs("#aviso-mensagem")?.value || "").trim();
    const urgente = !!qs("#aviso-urgente")?.checked;
    const todos = !!qs("#aviso-todos")?.checked;
    const sel = qs("#aviso-motoboys");
    const ids = sel
      ? Array.from(sel.selectedOptions).map((o) => Number(o.value)).filter((n) => Number.isFinite(n))
      : [];

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
      if (window.Swal) {
        await Swal.fire({
          icon: "success",
          title: "Aviso enviado",
          text: `Enviado para ${res.destinatarios_count} motoboy(s).`,
        });
      } else {
        alert(`Enviado para ${res.destinatarios_count} motoboy(s).`);
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
