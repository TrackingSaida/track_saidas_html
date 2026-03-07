/**
 * Componente de seleção de data para dashboards (Coletas, Visão 360)
 * Layout: presets à esquerda, calendário à direita, filtro no topo
 * Modos: A partir de, Igual a, Diferente de, Até, Período (dois calendários)
 */
(function () {
  "use strict";

  const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  const DIAS_SEMANA = ["Do", "2ª", "3ª", "4ª", "5ª", "6ª", "Sá"];

  function fmtYMD(d) {
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return d.getFullYear() + "-" + mm + "-" + dd;
  }

  function fmtDMY(d) {
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return dd + "/" + mm + "/" + d.getFullYear();
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
      case "semana":
        const day = now.getDay();
        const diff = day === 0 ? -6 : 1 - day;
        start = new Date(now);
        start.setDate(d + diff);
        end = new Date(start);
        end.setDate(start.getDate() + 6);
        break;
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
          end = new Date(y, m - 1 + 1, 0);
        }
        break;
      case "mes":
        start = new Date(y, m, 1);
        end = new Date(y, m + 1, 0);
        break;
      case "ultimos30":
        start = new Date(y, m, d - 30);
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
   * Cria o HTML do calendário (grid de dias)
   */
  function renderCalendarGrid(container, year, month, selectedStart, selectedEnd, mode, onSelect) {
    const first = new Date(year, month, 1);
    const last = new Date(year, month + 1, 0);
    const startPad = first.getDay();
    const daysInMonth = last.getDate();
    const prevMonth = new Date(year, month, 0);
    const prevDays = prevMonth.getDate();

    let html = '<div class="d-flex flex-wrap mb-1">';
    DIAS_SEMANA.forEach(function (d) {
      html += '<div class="text-center text-muted small" style="width:14.28%;min-width:28px">' + d + '</div>';
    });
    html += '</div>';
    html += '<div class="d-flex flex-wrap" style="gap:2px">';

    for (let i = 0; i < startPad; i++) {
      const day = prevDays - startPad + i + 1;
      const date = new Date(year, month - 1, day);
      const ymd = fmtYMD(date);
      const isSel = selectedStart && (ymd === selectedStart || (selectedEnd && ymd >= selectedStart && ymd <= selectedEnd));
      const cls = isSel ? "btn-primary" : "btn-outline-secondary";
      html += '<button type="button" class="btn btn-sm ' + cls + ' date-cell" data-ymd="' + ymd + '" style="width:14.28%;min-width:28px;opacity:0.5">' + day + '</button>';
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month, d);
      const ymd = fmtYMD(date);
      const isSel = selectedStart && (ymd === selectedStart || (selectedEnd && ymd >= selectedStart && ymd <= selectedEnd));
      const cls = isSel ? "btn-primary" : "btn-outline-secondary";
      html += '<button type="button" class="btn btn-sm ' + cls + ' date-cell" data-ymd="' + ymd + '" style="width:14.28%;min-width:28px">' + d + '</button>';
    }
    const remaining = 42 - startPad - daysInMonth;
    for (let i = 0; i < remaining; i++) {
      const d = i + 1;
      const date = new Date(year, month + 1, d);
      const ymd = fmtYMD(date);
      const isSel = selectedStart && (ymd === selectedStart || (selectedEnd && ymd >= selectedStart && ymd <= selectedEnd));
      const cls = isSel ? "btn-primary" : "btn-outline-secondary";
      html += '<button type="button" class="btn btn-sm ' + cls + ' date-cell" data-ymd="' + ymd + '" style="width:14.28%;min-width:28px;opacity:0.5">' + d + '</button>';
    }
    html += '</div>';
    container.innerHTML = html;

    container.querySelectorAll(".date-cell").forEach(function (btn) {
      btn.addEventListener("click", function () {
        const ymd = this.getAttribute("data-ymd");
        if (ymd) onSelect(ymd);
      });
    });
  }

  /**
   * Inicializa o date picker no container
   * @param {Object} opts - { containerId, prefix, onApply, onCancel, defaultPreset }
   * @param {string} opts.defaultPreset - preset inicial: hoje | ontem | quinzena-ant | quinzena | semana | mes
   */
  window.initDatePickerDashboard = function (opts) {
    const container = document.getElementById(opts.containerId);
    if (!container) return null;
    container.classList.add("date-picker-dashboard");
    const prefix = opts.prefix || "dp";
    const onApply = opts.onApply || function () {};
    const onCancel = opts.onCancel || function () {};

    let filterMode = "a_partir_de";
    let viewYear1 = new Date().getFullYear();
    let viewMonth1 = new Date().getMonth();
    let viewYear2 = new Date().getFullYear();
    let viewMonth2 = new Date().getMonth();
    let selectedStart = fmtYMD(new Date());
    let selectedEnd = fmtYMD(new Date());
    let isSelectingStart = true;
    let showMonthPicker1 = false;
    let showMonthPicker2 = false;
    let showYearPicker1 = false;
    let showYearPicker2 = false;

    const today = fmtYMD(new Date());

    function getResolvedRange() {
      if (filterMode === "periodo") {
        let s = selectedStart || selectedEnd || today;
        let e = selectedEnd || selectedStart || today;
        if (e < s) [s, e] = [e, s];
        return { start: s, end: e };
      }
      if (filterMode === "igual_a") {
        const d = selectedStart || selectedEnd || today;
        return { start: d, end: d };
      }
      if (filterMode === "a_partir_de") {
        const d = selectedStart || selectedEnd || today;
        return { start: d, end: fmtYMD(new Date()) };
      }
      if (filterMode === "ate") {
        const d = selectedStart || selectedEnd || today;
        return { start: "2020-01-01", end: d };
      }
      if (filterMode === "diferente_de") {
        const d = selectedStart || selectedEnd || today;
        return { start: d, end: d };
      }
      return { start: today, end: today };
    }

    function applyPreset(preset) {
      const r = getPresetRange(preset);
      selectedStart = r.start;
      selectedEnd = r.end;
      // Presets que definem intervalo (quinzena, semana, mês, ultimos30) devem usar modo "periodo" para Aplicar retornar start e end corretos
      if (preset === "quinzena" || preset === "quinzena-ant" || preset === "semana" || preset === "mes" || preset === "ultimos30") {
        filterMode = "periodo";
        isSelectingStart = false;
        var modeSelect = document.getElementById(prefix + "-filter-mode");
        if (modeSelect) modeSelect.value = "periodo";
      }
      const d = parseYMD(r.start);
      if (d) {
        viewYear1 = d.getFullYear();
        viewMonth1 = d.getMonth();
        viewYear2 = parseYMD(r.end) ? parseYMD(r.end).getFullYear() : viewYear1;
        viewMonth2 = parseYMD(r.end) ? parseYMD(r.end).getMonth() : viewMonth1;
      }
      renderCalendars();
    }

    function renderCal1Header() {
      const el = document.getElementById(prefix + "-cal1-header");
      if (!el) return;
      const wrap = document.getElementById(prefix + "-month-picker1-wrap");
      const yearWrap = document.getElementById(prefix + "-year-picker1-wrap");
      if (showMonthPicker1 && wrap) {
        wrap.classList.remove("d-none");
        wrap.innerHTML = "";
        const inner = document.createElement("div");
        inner.className = "border rounded p-2 bg-light";
        MESES.forEach(function (m, i) {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "btn btn-sm " + (i === viewMonth1 ? "btn-primary" : "btn-outline-secondary") + " me-1 mb-1";
          btn.textContent = m;
          btn.addEventListener("click", function () {
            viewMonth1 = i;
            showMonthPicker1 = false;
            showYearPicker1 = true;
            wrap.classList.add("d-none");
            if (yearWrap) yearWrap.classList.remove("d-none");
            renderCalendars();
          });
          inner.appendChild(btn);
        });
        wrap.appendChild(inner);
        return;
      }
      if (showYearPicker1 && yearWrap) {
        yearWrap.classList.remove("d-none");
        yearWrap.innerHTML = "";
        const inner = document.createElement("div");
        inner.className = "border rounded p-2 bg-light";
        for (let y = viewYear1 - 5; y <= viewYear1 + 5; y++) {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "btn btn-sm " + (y === viewYear1 ? "btn-primary" : "btn-outline-secondary") + " me-1 mb-1";
          btn.textContent = y;
          btn.addEventListener("click", function () {
            viewYear1 = y;
            showYearPicker1 = false;
            yearWrap.classList.add("d-none");
            renderCalendars();
          });
          inner.appendChild(btn);
        }
        yearWrap.appendChild(inner);
        return;
      }
      if (wrap) wrap.classList.add("d-none");
      if (yearWrap) yearWrap.classList.add("d-none");
      el.innerHTML = '<div class="d-flex align-items-center justify-content-between mb-2 flex-wrap gap-1">' +
        '<div class="btn-group btn-group-sm">' +
        '<button type="button" class="btn btn-outline-secondary px-1" title="Ano anterior">&laquo;</button>' +
        '<button type="button" class="btn btn-outline-secondary px-1" title="Mês anterior">&lsaquo;</button>' +
        '</div>' +
        '<button type="button" class="btn btn-link text-dark text-decoration-none p-0 px-2 nav-month-year" style="min-width:100px">' + MESES[viewMonth1] + " " + viewYear1 + '</button>' +
        '<div class="btn-group btn-group-sm">' +
        '<button type="button" class="btn btn-outline-secondary px-1" title="Próximo mês">&rsaquo;</button>' +
        '<button type="button" class="btn btn-outline-secondary px-1" title="Próximo ano">&raquo;</button>' +
        '</div>' +
        '</div>';
      el.querySelectorAll(".btn-group button")[0]?.addEventListener("click", function () {
        viewYear1--;
        renderCalendars();
      });
      el.querySelectorAll(".btn-group button")[1]?.addEventListener("click", function () {
        viewMonth1--;
        if (viewMonth1 < 0) { viewMonth1 = 11; viewYear1--; }
        renderCalendars();
      });
      el.querySelectorAll(".btn-group button")[2]?.addEventListener("click", function () {
        viewMonth1++;
        if (viewMonth1 > 11) { viewMonth1 = 0; viewYear1++; }
        renderCalendars();
      });
      el.querySelectorAll(".btn-group button")[3]?.addEventListener("click", function () {
        viewYear1++;
        renderCalendars();
      });
      el.querySelector(".nav-month-year")?.addEventListener("click", function () {
        showMonthPicker1 = true;
        renderCalendars();
      });
    }

    function renderCal2Header() {
      const el = document.getElementById(prefix + "-cal2-header");
      if (!el) return;
      const wrap = document.getElementById(prefix + "-month-picker2-wrap");
      const yearWrap = document.getElementById(prefix + "-year-picker2-wrap");
      if (wrap) wrap.classList.add("d-none");
      if (yearWrap) yearWrap.classList.add("d-none");
      el.innerHTML = '<div class="d-flex align-items-center justify-content-between mb-2 flex-wrap gap-1">' +
        '<div class="btn-group btn-group-sm">' +
        '<button type="button" class="btn btn-outline-secondary px-1" title="Ano anterior">&laquo;</button>' +
        '<button type="button" class="btn btn-outline-secondary px-1" title="Mês anterior">&lsaquo;</button>' +
        '</div>' +
        '<span class="px-2" style="min-width:100px">' + MESES[viewMonth2] + " " + viewYear2 + '</span>' +
        '<div class="btn-group btn-group-sm">' +
        '<button type="button" class="btn btn-outline-secondary px-1" title="Próximo mês">&rsaquo;</button>' +
        '<button type="button" class="btn btn-outline-secondary px-1" title="Próximo ano">&raquo;</button>' +
        '</div>' +
        '</div>';
      el.querySelectorAll(".btn-group button")[0]?.addEventListener("click", function () {
        viewYear2--;
        renderCalendars();
      });
      el.querySelectorAll(".btn-group button")[1]?.addEventListener("click", function () {
        viewMonth2--;
        if (viewMonth2 < 0) { viewMonth2 = 11; viewYear2--; }
        renderCalendars();
      });
      el.querySelectorAll(".btn-group button")[2]?.addEventListener("click", function () {
        viewMonth2++;
        if (viewMonth2 > 11) { viewMonth2 = 0; viewYear2++; }
        renderCalendars();
      });
      el.querySelectorAll(".btn-group button")[3]?.addEventListener("click", function () {
        viewYear2++;
        renderCalendars();
      });
    }

    function renderCalendars() {
      const cal1Grid = document.getElementById(prefix + "-cal1-grid");
      const cal2Grid = document.getElementById(prefix + "-cal2-grid");
      const cal2Wrap = document.getElementById(prefix + "-cal2-wrap");

      if (cal2Wrap) cal2Wrap.classList.toggle("d-none", filterMode !== "periodo");

      renderCal1Header();
      if (filterMode === "periodo") renderCal2Header();

      if (cal1Grid) {
        cal1Grid.style.display = (showMonthPicker1 || showYearPicker1) ? "none" : "";
        if (!showMonthPicker1 && !showYearPicker1) renderCalendarGrid(cal1Grid, viewYear1, viewMonth1, selectedStart, selectedEnd, filterMode, function (ymd) {
          if (filterMode === "periodo") {
            if (isSelectingStart) {
              selectedStart = ymd;
              selectedEnd = ymd;
              isSelectingStart = false;
            } else {
              if (ymd < selectedStart) {
                selectedEnd = selectedStart;
                selectedStart = ymd;
              } else selectedEnd = ymd;
              isSelectingStart = true;
            }
          } else {
            selectedStart = ymd;
            selectedEnd = ymd;
          }
          var endDate = parseYMD(selectedEnd);
          if (endDate && (endDate.getMonth() !== viewMonth2 || endDate.getFullYear() !== viewYear2)) {
            viewMonth2 = endDate.getMonth();
            viewYear2 = endDate.getFullYear();
          }
          renderCalendars();
        });
      }

      if (cal2Grid && filterMode === "periodo") {
        renderCalendarGrid(cal2Grid, viewYear2, viewMonth2, selectedStart, selectedEnd, filterMode, function (ymd) {
          if (ymd < selectedStart) {
            selectedEnd = selectedStart;
            selectedStart = ymd;
          } else selectedEnd = ymd;
          renderCalendars();
        });
      }
    }

    container.innerHTML = '<div class="row g-0">' +
      '<div class="col-4 border-end p-2">' +
        '<div class="small text-uppercase text-muted mb-2">Atalhos</div>' +
        '<div class="d-flex flex-column gap-1">' +
          '<button type="button" class="btn btn-outline-secondary btn-sm text-start dp-preset" data-preset="ontem">Ontem</button>' +
          '<button type="button" class="btn btn-outline-secondary btn-sm text-start dp-preset" data-preset="hoje">Hoje</button>' +
          '<button type="button" class="btn btn-outline-secondary btn-sm text-start dp-preset" data-preset="semana">Semana atual</button>' +
          '<button type="button" class="btn btn-outline-secondary btn-sm text-start dp-preset" data-preset="quinzena">Quinzena atual</button>' +
          '<button type="button" class="btn btn-outline-secondary btn-sm text-start dp-preset" data-preset="quinzena-ant">Quinzena anterior</button>' +
          '<button type="button" class="btn btn-outline-secondary btn-sm text-start dp-preset" data-preset="mes">Mês</button>' +
          '<button type="button" class="btn btn-outline-secondary btn-sm text-start dp-preset" data-preset="ultimos30">Hoje - 30 dias</button>' +
        '</div>' +
      '</div>' +
      '<div class="col-8 p-3">' +
        '<div class="mb-2">' +
          '<label class="form-label small mb-1">Filtro</label>' +
          '<select class="form-select form-select-sm" id="' + prefix + '-filter-mode">' +
            '<option value="a_partir_de" selected>A partir de</option>' +
            '<option value="igual_a">Igual a</option>' +
            '<option value="diferente_de">Diferente de</option>' +
            '<option value="ate">Até</option>' +
            '<option value="periodo">Período</option>' +
          '</select>' +
        '</div>' +
        '<div class="d-flex gap-3 flex-wrap">' +
          '<div class="flex-grow-1" style="min-width:200px">' +
            '<div id="' + prefix + '-cal1-header"></div>' +
            '<div id="' + prefix + '-month-picker1-wrap" class="d-none mb-2"></div>' +
            '<div id="' + prefix + '-year-picker1-wrap" class="d-none mb-2"></div>' +
            '<div id="' + prefix + '-cal1-grid"></div>' +
          '</div>' +
          '<div class="flex-grow-1 d-none" id="' + prefix + '-cal2-wrap" style="min-width:200px">' +
            '<div id="' + prefix + '-cal2-header"></div>' +
            '<div id="' + prefix + '-month-picker2-wrap" class="d-none mb-2"></div>' +
            '<div id="' + prefix + '-year-picker2-wrap" class="d-none mb-2"></div>' +
            '<div id="' + prefix + '-cal2-grid"></div>' +
          '</div>' +
        '</div>' +
        '<div class="d-flex justify-content-end gap-2 mt-3">' +
          '<button type="button" class="btn btn-outline-secondary btn-sm" id="' + prefix + '-btn-cancel">Cancelar</button>' +
          '<button type="button" class="btn btn-primary btn-sm" id="' + prefix + '-btn-apply">Aplicar</button>' +
        '</div>' +
      '</div>' +
    '</div>';

    document.getElementById(prefix + "-filter-mode").addEventListener("change", function () {
      filterMode = this.value;
      if (filterMode === "periodo") isSelectingStart = true;
      renderCalendars();
    });

    container.querySelectorAll(".dp-preset").forEach(function (btn) {
      btn.addEventListener("click", function () {
        applyPreset(this.getAttribute("data-preset"));
      });
    });

    document.getElementById(prefix + "-btn-cancel")?.addEventListener("click", onCancel);
    document.getElementById(prefix + "-btn-apply")?.addEventListener("click", function () {
      const r = getResolvedRange();
      onApply(r.start, r.end);
    });

    applyPreset(opts.defaultPreset || "hoje");
    renderCalendars();

    return { getResolvedRange, applyPreset };
  };
})();
