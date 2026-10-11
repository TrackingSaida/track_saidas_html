/**
 * Componente de seleção de data para dashboards e telas com filtro de período
 * Layout: atalhos à esquerda, calendário à direita, filtro no topo
 * Modos: A partir de, Igual a, Até, Período (dois meses consecutivos)
 */
(function () {
  "use strict";

  const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  const MESES_LONGOS = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
  ];
  const DIAS_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

  const PRESETS = [
    { id: "hoje", label: "Hoje" },
    { id: "ontem", label: "Ontem" },
    { id: "semana", label: "Semana atual" },
    { id: "quinzena", label: "Quinzena atual" },
    { id: "quinzena-ant", label: "Quinzena anterior" },
    { id: "mes", label: "Mês atual" },
    { id: "ultimos15", label: "Últimos 15 dias" },
    { id: "ultimos30", label: "Últimos 30 dias" },
    { id: "ultimos45", label: "Últimos 45 dias" },
  ];
  const PRESETS_DIA_UNICO = { hoje: 1, ontem: 1 };

  function fmtYMD(d) {
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return d.getFullYear() + "-" + mm + "-" + dd;
  }

  function fmtDMYFromYMD(ymd) {
    if (!ymd) return "—";
    const p = ymd.split("-");
    return p.length === 3 ? p[2] + "/" + p[1] + "/" + p[0] : ymd;
  }

  function getPresetRange(preset) {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const d = now.getDate();
    let start, end;
    switch (preset) {
      case "ontem":
        start = new Date(y, m, d - 1);
        end = new Date(y, m, d - 1);
        break;
      case "hoje":
        start = new Date(y, m, d);
        end = new Date(y, m, d);
        break;
      case "semana": {
        const day = now.getDay();
        const diff = day === 0 ? -6 : 1 - day;
        start = new Date(y, m, d + diff);
        end = new Date(y, m, d + diff + 6);
        break;
      }
      case "quinzena":
        if (d > 15) {
          start = new Date(y, m, 16);
          end = new Date(y, m + 1, 0);
        } else {
          start = new Date(y, m, 1);
          end = new Date(y, m, 15);
        }
        break;
      case "quinzena-ant":
        if (d > 15) {
          start = new Date(y, m, 1);
          end = new Date(y, m, 15);
        } else {
          start = new Date(y, m - 1, 16);
          end = new Date(y, m, 0);
        }
        break;
      case "mes":
        start = new Date(y, m, 1);
        end = new Date(y, m + 1, 0);
        break;
      case "ultimos15":
        start = new Date(y, m, d - 14);
        end = new Date(y, m, d);
        break;
      case "ultimos30":
        start = new Date(y, m, d - 29);
        end = new Date(y, m, d);
        break;
      case "ultimos45":
        start = new Date(y, m, d - 44);
        end = new Date(y, m, d);
        break;
      default:
        start = new Date(y, m, d);
        end = new Date(y, m, d);
    }
    return { start: fmtYMD(start), end: fmtYMD(end) };
  }

  function parseYMD(str) {
    if (!str) return null;
    const parts = str.split("-");
    if (parts.length !== 3) return null;
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    const d = parseInt(parts[2], 10);
    if (isNaN(y) || isNaN(m) || isNaN(d)) return null;
    return new Date(y, m, d);
  }

  /**
   * Grade de 7 colunas fixas (Dom–Sáb), sempre 6 semanas para altura estável.
   * Dias de outros meses aparecem apagados e não são clicáveis.
   */
  function renderCalendarGrid(container, year, month, state, onSelect) {
    const startPad = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const s = state.start;
    const e = state.end || state.start;
    const isRange = state.mode === "periodo" && s && e && s !== e;

    let html = '<div class="dp-grid" role="grid">';
    DIAS_SEMANA.forEach(function (d) {
      html += '<div class="dp-weekday" role="columnheader">' + d + "</div>";
    });

    for (let i = 0; i < 42; i++) {
      const date = new Date(year, month, i - startPad + 1);
      const ymd = fmtYMD(date);
      const outside = date.getMonth() !== month;
      const cls = ["dp-day"];
      if (outside) {
        cls.push("is-outside");
      } else {
        if (ymd === state.today) cls.push("is-today");
        if (isRange) {
          if (ymd === s) cls.push("range-start");
          if (ymd === e) cls.push("range-end");
          if (ymd > s && ymd < e) cls.push("in-range");
        } else if (s && ymd === s) {
          cls.push("is-selected");
        }
      }
      const label = date.getDate() + " de " + MESES_LONGOS[date.getMonth()] + " de " + date.getFullYear();
      html +=
        '<button type="button" class="' + cls.join(" ") + '" data-ymd="' + ymd + '"' +
        (outside ? ' disabled tabindex="-1" aria-hidden="true"' : ' aria-label="' + label + '"') +
        "><span>" + date.getDate() + "</span></button>";
    }
    html += "</div>";
    container.innerHTML = html;

    container.querySelectorAll(".dp-day:not(.is-outside)").forEach(function (btn) {
      btn.addEventListener("click", function () {
        onSelect(this.getAttribute("data-ymd"));
      });
    });
  }

  /**
   * Inicializa o date picker no container
   * @param {Object} opts - { containerId, prefix, onApply, onCancel, defaultPreset }
   * @param {string} opts.defaultPreset - preset inicial: hoje | ontem | semana | quinzena | quinzena-ant | mes | ultimos15 | ultimos30 | ultimos45
   */
  window.initDatePickerDashboard = function (opts) {
    const container = document.getElementById(opts.containerId);
    if (!container) return null;
    container.classList.add("date-picker-dashboard");
    const prefix = opts.prefix || "dp";
    const onApply = opts.onApply || function () {};
    const onCancel = opts.onCancel || function () {};

    const today = fmtYMD(new Date());
    let filterMode = "a_partir_de";
    let viewYear = new Date().getFullYear();
    let viewMonth = new Date().getMonth();
    let selectedStart = today;
    let selectedEnd = today;
    let isSelectingStart = true;
    let activePreset = null;
    let pickerStep = null; // null | "mes" | "ano"

    function getResolvedRange() {
      const d = selectedStart || selectedEnd || today;
      if (filterMode === "periodo") {
        let s = selectedStart || selectedEnd || today;
        let e = selectedEnd || selectedStart || today;
        if (e < s) [s, e] = [e, s];
        return { start: s, end: e };
      }
      if (filterMode === "igual_a") return { start: d, end: d };
      if (filterMode === "a_partir_de") return { start: d, end: fmtYMD(new Date()) };
      if (filterMode === "ate") return { start: "2020-01-01", end: d };
      return { start: today, end: today };
    }

    function setMode(mode) {
      filterMode = mode;
      const sel = document.getElementById(prefix + "-filter-mode");
      if (sel) sel.value = mode;
    }

    function showMonthOf(ymd) {
      const d = parseYMD(ymd);
      if (!d) return;
      viewYear = d.getFullYear();
      viewMonth = d.getMonth();
    }

    function applyPreset(preset) {
      const r = getPresetRange(preset);
      selectedStart = r.start;
      selectedEnd = r.end;
      isSelectingStart = true;
      activePreset = preset;
      setMode(PRESETS_DIA_UNICO[preset] ? "igual_a" : "periodo");
      showMonthOf(r.start);
      pickerStep = null;
      render();
    }

    function shiftMonth(delta) {
      viewMonth += delta;
      while (viewMonth < 0) { viewMonth += 12; viewYear--; }
      while (viewMonth > 11) { viewMonth -= 12; viewYear++; }
      render();
    }

    function handleDayClick(ymd) {
      activePreset = null;
      if (filterMode === "periodo") {
        if (isSelectingStart) {
          selectedStart = ymd;
          selectedEnd = ymd;
          isSelectingStart = false;
        } else {
          if (ymd < selectedStart) {
            selectedEnd = selectedStart;
            selectedStart = ymd;
          } else {
            selectedEnd = ymd;
          }
          isSelectingStart = true;
        }
      } else {
        selectedStart = ymd;
        selectedEnd = ymd;
      }
      render();
    }

    function bindRangePreview(gridsWrap) {
      gridsWrap.onmouseover = function (ev) {
        if (filterMode !== "periodo" || isSelectingStart) return;
        const btn = ev.target.closest(".dp-day:not(.is-outside)");
        if (!btn) return;
        const hover = btn.getAttribute("data-ymd");
        const a = hover < selectedStart ? hover : selectedStart;
        const b = hover < selectedStart ? selectedStart : hover;
        gridsWrap.querySelectorAll(".dp-day:not(.is-outside)").forEach(function (el) {
          const ymd = el.getAttribute("data-ymd");
          el.classList.toggle("in-preview", ymd > a && ymd < b);
        });
      };
      gridsWrap.onmouseleave = function () {
        gridsWrap.querySelectorAll(".in-preview").forEach(function (el) {
          el.classList.remove("in-preview");
        });
      };
    }

    function monthHeader(year, month, opts2) {
      const prev = opts2.prev
        ? '<button type="button" class="dp-nav" data-nav="-1" aria-label="Mês anterior"><i class="ri-arrow-left-s-line"></i></button>'
        : '<span class="dp-nav-spacer"></span>';
      const next = opts2.next
        ? '<button type="button" class="dp-nav" data-nav="1" aria-label="Próximo mês"><i class="ri-arrow-right-s-line"></i></button>'
        : '<span class="dp-nav-spacer"></span>';
      const title = opts2.clickable
        ? '<button type="button" class="dp-month-title is-clickable" title="Escolher mês e ano">' + MESES_LONGOS[month] + " " + year + "</button>"
        : '<span class="dp-month-title">' + MESES_LONGOS[month] + " " + year + "</span>";
      return '<div class="dp-month-header">' + prev + title + next + "</div>";
    }

    function renderPickerStep(wrap) {
      let html = '<div class="dp-month-header">' +
        '<span class="dp-nav-spacer"></span>' +
        '<span class="dp-month-title">' + (pickerStep === "mes" ? "Escolha o mês" : "Escolha o ano") + "</span>" +
        '<button type="button" class="dp-nav" data-close-picker aria-label="Voltar ao calendário"><i class="ri-close-line"></i></button>' +
        "</div><div class=\"dp-picker-grid\">";
      if (pickerStep === "mes") {
        MESES.forEach(function (m, i) {
          html += '<button type="button" class="dp-picker-item' + (i === viewMonth ? " is-active" : "") + '" data-mes="' + i + '">' + m + "</button>";
        });
      } else {
        for (let y = viewYear - 5; y <= viewYear + 6; y++) {
          html += '<button type="button" class="dp-picker-item' + (y === viewYear ? " is-active" : "") + '" data-ano="' + y + '">' + y + "</button>";
        }
      }
      html += "</div>";
      wrap.innerHTML = html;
      wrap.querySelector("[data-close-picker]").addEventListener("click", function () {
        pickerStep = null;
        render();
      });
      wrap.querySelectorAll("[data-mes]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          viewMonth = Number(this.getAttribute("data-mes"));
          pickerStep = "ano";
          render();
        });
      });
      wrap.querySelectorAll("[data-ano]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          viewYear = Number(this.getAttribute("data-ano"));
          pickerStep = null;
          render();
        });
      });
    }

    function renderSummary() {
      const el = document.getElementById(prefix + "-summary");
      if (!el) return;
      const r = getResolvedRange();
      let inicio, fim;
      if (filterMode === "periodo") {
        inicio = fmtDMYFromYMD(r.start);
        fim = fmtDMYFromYMD(r.end);
      } else if (filterMode === "igual_a") {
        inicio = fmtDMYFromYMD(r.start);
        fim = null;
      } else if (filterMode === "a_partir_de") {
        inicio = fmtDMYFromYMD(r.start);
        fim = "Hoje";
      } else {
        inicio = "Início";
        fim = fmtDMYFromYMD(r.end);
      }
      el.innerHTML =
        '<span class="dp-range-field">' + inicio + "</span>" +
        (fim !== null ? '<i class="ri-arrow-right-line dp-range-arrow" aria-hidden="true"></i><span class="dp-range-field">' + fim + "</span>" : "");

      const hint = document.getElementById(prefix + "-hint");
      if (hint) {
        if (filterMode === "periodo") hint.textContent = isSelectingStart ? "Clique na data inicial." : "Agora clique na data final.";
        else if (filterMode === "a_partir_de") hint.textContent = "Mostra desta data até hoje.";
        else if (filterMode === "ate") hint.textContent = "Mostra tudo até esta data.";
        else hint.textContent = "Mostra somente este dia.";
      }
    }

    function renderPresets() {
      container.querySelectorAll(".dp-preset").forEach(function (btn) {
        const on = btn.getAttribute("data-preset") === activePreset;
        btn.classList.toggle("is-active", on);
        btn.setAttribute("aria-pressed", on ? "true" : "false");
      });
    }

    function render() {
      const wrap = document.getElementById(prefix + "-months");
      if (!wrap) return;
      const dual = filterMode === "periodo";
      wrap.classList.toggle("is-dual", dual);
      wrap.onmouseover = null;

      if (pickerStep) {
        wrap.innerHTML = '<div class="dp-month"></div>';
        renderPickerStep(wrap.firstChild);
      } else {
        const y2 = viewMonth === 11 ? viewYear + 1 : viewYear;
        const m2 = (viewMonth + 1) % 12;
        wrap.innerHTML =
          '<div class="dp-month">' + monthHeader(viewYear, viewMonth, { prev: true, next: !dual, clickable: true }) + '<div class="dp-grid-host"></div></div>' +
          (dual ? '<div class="dp-month">' + monthHeader(y2, m2, { prev: false, next: true, clickable: false }) + '<div class="dp-grid-host"></div></div>' : "");

        const state = { start: selectedStart, end: selectedEnd, mode: filterMode, today: today };
        const hosts = wrap.querySelectorAll(".dp-grid-host");
        renderCalendarGrid(hosts[0], viewYear, viewMonth, state, handleDayClick);
        if (dual && hosts[1]) renderCalendarGrid(hosts[1], y2, m2, state, handleDayClick);

        wrap.querySelectorAll("[data-nav]").forEach(function (btn) {
          btn.addEventListener("click", function () {
            shiftMonth(Number(this.getAttribute("data-nav")));
          });
        });
        wrap.querySelector(".dp-month-title.is-clickable")?.addEventListener("click", function () {
          pickerStep = "mes";
          render();
        });
        bindRangePreview(wrap);
      }
      renderSummary();
      renderPresets();
    }

    const presetsHtml = PRESETS.map(function (p) {
      return '<button type="button" class="dp-preset" data-preset="' + p.id + '" aria-pressed="false">' + p.label + "</button>";
    }).join("");

    container.innerHTML =
      '<div class="dp-layout">' +
        '<div class="dp-col-presets">' +
          '<details class="dp-atalhos-collapse">' +
            '<summary class="dp-collapse-summary">Atalhos</summary>' +
            '<div class="dp-collapse-content dp-preset-list">' + presetsHtml + "</div>" +
          "</details>" +
        "</div>" +
        '<div class="dp-col-main">' +
          '<details class="dp-calendario-collapse">' +
            '<summary class="dp-collapse-summary">Calendário</summary>' +
            '<div class="dp-collapse-content">' +
              '<div class="dp-toolbar">' +
                '<label class="visually-hidden" for="' + prefix + '-filter-mode">Tipo de filtro</label>' +
                '<select class="form-select form-select-sm dp-mode" id="' + prefix + '-filter-mode">' +
                  '<option value="periodo">Período</option>' +
                  '<option value="igual_a">Igual a</option>' +
                  '<option value="a_partir_de">A partir de</option>' +
                  '<option value="ate">Até</option>' +
                "</select>" +
                '<div class="dp-range-summary" id="' + prefix + '-summary" aria-live="polite"></div>' +
              "</div>" +
              '<div class="dp-months" id="' + prefix + '-months"></div>' +
              '<div class="dp-footer">' +
                '<small class="text-muted dp-hint" id="' + prefix + '-hint"></small>' +
                '<div class="d-flex gap-2">' +
                  '<button type="button" class="btn btn-light btn-sm" id="' + prefix + '-btn-cancel">Cancelar</button>' +
                  '<button type="button" class="btn btn-primary btn-sm" id="' + prefix + '-btn-apply">Aplicar</button>' +
                "</div>" +
              "</div>" +
            "</div>" +
          "</details>" +
        "</div>" +
      "</div>";

    document.getElementById(prefix + "-filter-mode").addEventListener("change", function () {
      filterMode = this.value;
      activePreset = null;
      isSelectingStart = true;
      if (filterMode !== "periodo") selectedEnd = selectedStart;
      render();
    });

    container.querySelectorAll(".dp-preset").forEach(function (btn) {
      btn.addEventListener("click", function () {
        applyPreset(this.getAttribute("data-preset"));
        /* Atalho aplica na hora; só o calendário manual exige clicar em Aplicar */
        const r = getResolvedRange();
        onApply(r.start, r.end);
      });
    });

    document.getElementById(prefix + "-btn-cancel")?.addEventListener("click", onCancel);
    document.getElementById(prefix + "-btn-apply")?.addEventListener("click", function () {
      const r = getResolvedRange();
      onApply(r.start, r.end);
    });

    applyPreset(opts.defaultPreset || "hoje");

    /* PC: details abertos; mobile: fechados (recolhíveis) */
    const atalhosDetails = container.querySelector(".dp-atalhos-collapse");
    const calendarioDetails = container.querySelector(".dp-calendario-collapse");
    const mqDesktop = window.matchMedia("(min-width: 769px)");
    function syncDetailsOpen() {
      const open = mqDesktop.matches;
      if (atalhosDetails) atalhosDetails[open ? "setAttribute" : "removeAttribute"]("open", "");
      if (calendarioDetails) calendarioDetails[open ? "setAttribute" : "removeAttribute"]("open", "");
    }
    syncDetailsOpen();
    mqDesktop.addEventListener("change", syncDetailsOpen);

    return { getResolvedRange, applyPreset };
  };
})();
