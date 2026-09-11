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
      const res = await fetch(`${API_URL}/users/aniversariantes`, { credentials: "include" });
      if (res.status === 401) {
        window.location.href = "auth-signin-tracking-v2.html";
        return;
      }
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const detail = json.detail || `HTTP ${res.status}`;
        throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
      }
      dataCache = json;
      render();
    } catch (e) {
      el.error.textContent = e.message || "Falha ao carregar aniversariantes.";
      el.error.classList.remove("d-none");
    } finally {
      el.loading.classList.add("d-none");
    }
  }

  function buildPrintHtml(mode, mesAlvo) {
    const meses = (dataCache && dataCache.meses) || {};
    const ano = (dataCache && dataCache.ano_referencia) || new Date().getFullYear();
    let title = "Aniversariantes";
    let subtitle = `Rotevo · ${ano}`;
    let body = "";

    if (mode === "anual") {
      title = `Aniversariantes ${ano}`;
      subtitle = "Calendário anual";
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
      subtitle = `Rotevo · ${ano}`;
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

  function doPrint(mode, mesAlvo) {
    if (!dataCache) return;
    el.printRoot.innerHTML = buildPrintHtml(mode, mesAlvo);
    el.printRoot.setAttribute("aria-hidden", "false");
    window.print();
    setTimeout(() => {
      el.printRoot.innerHTML = "";
      el.printRoot.setAttribute("aria-hidden", "true");
    }, 500);
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
