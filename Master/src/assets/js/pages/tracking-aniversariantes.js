/* Aniversariantes do mês — calendário + impressão */
(function () {
  "use strict";

  const API_URL = (window.TRACK_API_URL || "https://track-saidas-api.onrender.com/api").replace(/\/+$/, "");
  const MESES_NOMES = [
    "",
    "Janeiro",
    "Fevereiro",
    "Março",
    "Abril",
    "Maio",
    "Junho",
    "Julho",
    "Agosto",
    "Setembro",
    "Outubro",
    "Novembro",
    "Dezembro",
  ];

  /** @type {{ ano_referencia: number, meses: Record<string, any[]> } | null} */
  let dataCache = null;
  /** @type {string} */
  let subBaseNome = "";
  const mesAtual = new Date().getMonth() + 1;

  const el = {
    loading: document.getElementById("anivLoading"),
    error: document.getElementById("anivError"),
    emptyGeral: document.getElementById("anivEmptyGeral"),
    viewMes: document.getElementById("anivViewMes"),
    viewAno: document.getElementById("anivViewAno"),
    filtroMes: document.getElementById("filtroMes"),
    verAnoTodo: document.getElementById("verAnoTodo"),
    printRoot: document.getElementById("anivPrintRoot"),
    page: document.getElementById("anivPage"),
  };

  function escapeHtml(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function displayName(item) {
    const nome = (item.nome || "").trim();
    const sobrenome = (item.sobrenome || "").trim();
    const full = [nome, sobrenome].filter(Boolean).join(" ").trim();
    if (full) return full;
    return (item.username || "").trim() || "Sem nome";
  }

  function totalAno(meses) {
    let n = 0;
    for (let i = 1; i <= 12; i++) n += (meses[String(i)] || []).length;
    return n;
  }

  function spawnConfetti() {
    const host = el.page && el.page.querySelector(".aniv-confetti");
    if (!host) return;
    host.innerHTML = "";
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const colors = ["#14B8A6", "#1A6FD4", "#7CB518", "#C6F531", "#f472b6", "#fbbf24"];
    for (let i = 0; i < 28; i++) {
      const span = document.createElement("span");
      span.style.left = `${Math.random() * 100}%`;
      span.style.background = colors[i % colors.length];
      span.style.animationDuration = `${6 + Math.random() * 8}s`;
      span.style.animationDelay = `${Math.random() * 5}s`;
      span.style.width = `${6 + Math.random() * 6}px`;
      span.style.height = span.style.width;
      host.appendChild(span);
    }
  }

  function cardHtml(mesNum, itens, opts) {
    const current = opts && opts.highlightCurrent && mesNum === mesAtual;
    const large = opts && opts.large;
    const emptyMsg =
      large || (opts && opts.emptyLong)
        ? "Nenhum aniversariante cadastrado neste mês."
        : "Nenhum aniversariante.";
    const list =
      itens && itens.length
        ? `<ul class="aniv-list">${itens
            .map(
              (it) =>
                `<li><span class="aniv-day">${String(it.dia).padStart(2, "0")}</span><span>${escapeHtml(
                  displayName(it)
                )}</span></li>`
            )
            .join("")}</ul>`
        : `<p class="aniv-empty">${emptyMsg}</p>`;

    return `<div class="aniv-month-card${current ? " is-current" : ""}${large ? " aniv-month-large" : ""}" data-mes="${mesNum}">
      <h3 class="aniv-month-title">${MESES_NOMES[mesNum]}</h3>
      ${list}
    </div>`;
  }

  function render() {
    if (!dataCache) return;
    const meses = dataCache.meses || {};
    const anoVazio = totalAno(meses) === 0;
    const verAno = !!(el.verAnoTodo && el.verAnoTodo.checked);

    el.emptyGeral.classList.add("d-none");
    el.viewMes.classList.add("d-none");
    el.viewAno.classList.add("d-none");

    if (el.filtroMes) el.filtroMes.disabled = verAno;

    if (anoVazio) {
      el.emptyGeral.classList.remove("d-none");
      return;
    }

    if (verAno) {
      el.viewAno.classList.remove("d-none");
      el.viewAno.innerHTML = Array.from({ length: 12 }, (_, i) => {
        const m = i + 1;
        return cardHtml(m, meses[String(m)] || [], { highlightCurrent: true });
      }).join("");
      return;
    }

    const mesSel = parseInt(el.filtroMes.value, 10) || mesAtual;
    el.viewMes.classList.remove("d-none");
    el.viewMes.innerHTML = cardHtml(mesSel, meses[String(mesSel)] || [], {
      large: true,
      emptyLong: true,
    });
  }

  async function load() {
    el.loading.classList.remove("d-none");
    el.error.classList.add("d-none");
    el.error.textContent = "";
    try {
      const [res, meRes] = await Promise.all([
        fetch(`${API_URL}/users/aniversariantes`, { credentials: "include" }),
        fetch(`${API_URL}/auth/me`, { credentials: "include" }),
      ]);
      if (res.status === 401 || meRes.status === 401) {
        window.location.href = "auth-signin-tracking-v2.html";
        return;
      }
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const detail = json.detail || `HTTP ${res.status}`;
        throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
      }
      dataCache = json;
      if (meRes.ok) {
        const me = await meRes.json().catch(() => ({}));
        subBaseNome = String(me.sub_base || "").trim();
      }
      render();
    } catch (e) {
      el.error.textContent = e.message || "Falha ao carregar aniversariantes.";
      el.error.classList.remove("d-none");
    } finally {
      el.loading.classList.add("d-none");
    }
  }

  function printSubtitle(ano) {
    const base = subBaseNome || "Base";
    return `${base} | Rotevo ${ano}`;
  }

  function buildPrintHtml(mode, mesAlvo) {
    const meses = (dataCache && dataCache.meses) || {};
    const ano = (dataCache && dataCache.ano_referencia) || new Date().getFullYear();
    let title = "Aniversariantes";
    let subtitle = printSubtitle(ano);
    let body = "";

    if (mode === "anual") {
      title = `Aniversariantes ${ano}`;
      subtitle = printSubtitle(ano);
      body = `<div class="aniv-print-grid">${Array.from({ length: 12 }, (_, i) => {
        const m = i + 1;
        const itens = meses[String(m)] || [];
        const list = itens.length
          ? `<ul>${itens
              .map((it) => `<li><strong>${String(it.dia).padStart(2, "0")}</strong> — ${escapeHtml(displayName(it))}</li>`)
              .join("")}</ul>`
          : `<p class="empty">Nenhum aniversariante.</p>`;
        return `<div class="aniv-print-card"><h2>${MESES_NOMES[m]}</h2>${list}</div>`;
      }).join("")}</div>`;
    } else {
      const m = mesAlvo || mesAtual;
      title = `Aniversariantes de ${MESES_NOMES[m]}`;
      subtitle = printSubtitle(ano);
      const itens = meses[String(m)] || [];
      const list = itens.length
        ? `<ul class="aniv-print-mes-list">${itens
            .map((it) => `<li><strong>${String(it.dia).padStart(2, "0")}</strong> — ${escapeHtml(displayName(it))}</li>`)
            .join("")}</ul>`
        : `<p class="empty">Nenhum aniversariante cadastrado neste mês.</p>`;
      body = `<div class="aniv-print-grid single"><div class="aniv-print-card"><h2>${MESES_NOMES[m]}</h2>${list}</div></div>`;
    }

    return `<div class="aniv-print-header"><h1>${escapeHtml(title)}</h1><p>${escapeHtml(subtitle)}</p></div>${body}`;
  }

  const PRINT_CSS = `
    @page { margin: 12mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 0;
      font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      color: #0B1F3A;
      background: #fff;
    }
    .aniv-print-header {
      background: linear-gradient(90deg, #14B8A6, #1A6FD4);
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
      color: #fff;
      padding: 16px 20px;
      border-radius: 8px;
      margin-bottom: 16px;
    }
    .aniv-print-header h1 { margin: 0; font-size: 22pt; }
    .aniv-print-header p { margin: 4px 0 0; opacity: 0.9; font-size: 11pt; }
    .aniv-print-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 10px;
    }
    .aniv-print-grid.single { grid-template-columns: 1fr; }
    .aniv-print-card {
      border: 1px solid #cfd8e3;
      border-radius: 8px;
      padding: 10px 12px;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .aniv-print-card h2 {
      font-size: 12pt;
      margin: 0 0 8px;
      text-transform: uppercase;
      color: #0B1F3A;
    }
    .aniv-print-card ul { list-style: none; margin: 0; padding: 0; }
    .aniv-print-card li {
      font-size: 10pt;
      padding: 3px 0;
      border-bottom: 1px solid #eef2f6;
    }
    .aniv-print-card .empty { font-size: 9pt; color: #6c757d; }
    .aniv-print-mes-list li { font-size: 14pt; padding: 8px 0; }
  `;

  function doPrint(mode, mesAlvo) {
    if (!dataCache) return;
    const htmlBody = buildPrintHtml(mode, mesAlvo);

    // Imprime em iframe (title vazio) para não exibir "Aniversariantes | ROTEVO" nem a URL da página
    const iframe = document.createElement("iframe");
    iframe.setAttribute("aria-hidden", "true");
    iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none;";
    document.body.appendChild(iframe);

    const doc = iframe.contentDocument || iframe.contentWindow.document;
    doc.open();
    doc.write(
      `<!DOCTYPE html><html><head><meta charset="utf-8"><title></title><style>${PRINT_CSS}</style></head><body>${htmlBody}</body></html>`
    );
    doc.close();

    const cleanup = () => {
      try {
        iframe.remove();
      } catch (_) {}
    };

    const win = iframe.contentWindow;
    const runPrint = () => {
      try {
        win.focus();
        win.print();
      } finally {
        setTimeout(cleanup, 800);
      }
    };

    if (win.document.readyState === "complete") {
      setTimeout(runPrint, 50);
    } else {
      win.addEventListener("load", () => setTimeout(runPrint, 50), { once: true });
    }
  }

  function bind() {
    if (el.filtroMes) {
      el.filtroMes.value = String(mesAtual);
      el.filtroMes.addEventListener("change", render);
    }
    if (el.verAnoTodo) el.verAnoTodo.addEventListener("change", render);

    const btnMesAtual = document.getElementById("printMesAtual");
    const btnOutro = document.getElementById("printOutroMes");
    const btnAnual = document.getElementById("printAnual");

    if (btnMesAtual) btnMesAtual.addEventListener("click", () => doPrint("mes", mesAtual));
    if (btnAnual) btnAnual.addEventListener("click", () => doPrint("anual"));
    if (btnOutro) {
      btnOutro.addEventListener("click", async () => {
        const options = MESES_NOMES.slice(1)
          .map((n, i) => `<option value="${i + 1}" ${i + 1 === mesAtual ? "selected" : ""}>${n}</option>`)
          .join("");
        if (window.Swal) {
          const { value, isConfirmed } = await Swal.fire({
            title: "Imprimir outro mês",
            html: `<select id="swalMesPrint" class="form-select">${options}</select>`,
            showCancelButton: true,
            confirmButtonText: "Imprimir",
            cancelButtonText: "Cancelar",
            preConfirm: () => {
              const sel = document.getElementById("swalMesPrint");
              return sel ? parseInt(sel.value, 10) : mesAtual;
            },
          });
          if (isConfirmed && value) doPrint("mes", value);
        } else {
          const raw = window.prompt("Número do mês (1-12):", String(mesAtual));
          const n = parseInt(raw || "", 10);
          if (n >= 1 && n <= 12) doPrint("mes", n);
        }
      });
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    spawnConfetti();
    bind();
    load();
  });
})();
