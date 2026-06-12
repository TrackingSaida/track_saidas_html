/* Utilidades operacionais — Visão Atual (Acompanhamento do Dia) */
(function (global) {
  "use strict";

  var INACTIVE_MINUTES = 120;
  var SLA_CRITICAL = 20;
  var SLA_LOW = 10;

  function slaTier(pct) {
    if (pct == null || isNaN(Number(pct))) return "neutral";
    var n = Number(pct);
    if (n >= 80) return "success";
    if (n >= 50) return "warning";
    if (n >= 20) return "orange";
    return "danger";
  }

  function fmtSLA(val) {
    if (val == null || val === undefined) return "—";
    return Number(val).toFixed(1) + "%";
  }

  function minutesSince(isoStr, now) {
    if (!isoStr) return null;
    try {
      var d = new Date(isoStr);
      if (isNaN(d.getTime())) return null;
      var ref = now instanceof Date ? now : new Date();
      return Math.floor((ref.getTime() - d.getTime()) / 60000);
    } catch (_) {
      return null;
    }
  }

  function formatRelativeMinutes(minutes) {
    if (minutes == null || minutes < 0) return "";
    if (minutes < 60) return "há " + minutes + "min";
    var h = Math.floor(minutes / 60);
    var m = minutes % 60;
    if (m === 0) return "há " + h + "h";
    return "há " + h + "h" + String(m).padStart(2, "0");
  }

  function fmtUltimaEntrega(isoStr, now) {
    if (!isoStr) {
      return { text: "Sem entrega", tier: "danger" };
    }
    try {
      var d = new Date(isoStr);
      if (isNaN(d.getTime())) {
        return { text: "Sem entrega", tier: "danger" };
      }
      var time = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
      var mins = minutesSince(isoStr, now);
      if (mins == null) return { text: time, tier: "warning" };
      if (mins < 30) return { text: time, tier: "success" };
      if (mins < INACTIVE_MINUTES) {
        return { text: time + " · " + formatRelativeMinutes(mins), tier: "warning" };
      }
      return { text: time + " · " + formatRelativeMinutes(mins), tier: "danger" };
    } catch (_) {
      return { text: "Sem entrega", tier: "danger" };
    }
  }

  function isInactive(row, now) {
    if (!row || (row.pedidos || 0) === 0) return false;
    if ((row.entregues || 0) === 0) return true;
    var mins = minutesSince(row.ultima_entrega, now);
    if (mins == null) return true;
    return mins > INACTIVE_MINUTES;
  }

  function isCritico(row, now) {
    if (!row) return false;
    if ((row.entregues || 0) === 0) return true;
    var sla = row.sla != null ? Number(row.sla) : null;
    if (sla != null && sla < SLA_CRITICAL) return true;
    return isInactive(row, now);
  }

  function deriveStatus(row, now) {
    var entregues = row.entregues || 0;
    var emRota = row.em_rota || 0;

    if (entregues === 0) {
      return { key: "sem_entrega", label: "Sem entrega" };
    }
    if (emRota === 0 && entregues > 0) {
      return { key: "finalizado", label: "Finalizado" };
    }
    if (isCritico(row, now)) {
      return { key: "critico", label: "Crítico" };
    }
    if (emRota > 0 && entregues > 0) {
      return { key: "em_andamento", label: "Em andamento" };
    }
    return { key: "em_andamento", label: "Em andamento" };
  }

  function matchesQuickFilter(row, filter, now) {
    if (!filter || filter === "todos") return true;
    var entregues = row.entregues || 0;
    var emRota = row.em_rota || 0;

    switch (filter) {
      case "criticos":
        return isCritico(row, now);
      case "sem_entrega":
        return entregues === 0;
      case "finalizados":
        return emRota === 0 && entregues > 0;
      case "em_andamento":
        return emRota > 0 && entregues > 0;
      case "carga_alta":
        return emRota >= 50;
      case "sla_baixo":
        return row.sla != null && Number(row.sla) < SLA_LOW && (row.pedidos || 0) > 0;
      case "inativo":
        return isInactive(row, now) && (row.pedidos || 0) > 0;
      default:
        return true;
    }
  }

  function applyQuickFilter(items, filter, now) {
    if (!Array.isArray(items)) return [];
    return items.filter(function (row) {
      return matchesQuickFilter(row, filter, now);
    });
  }

  function computeAlerts(items, now) {
    if (!Array.isArray(items) || items.length === 0) return [];

    var semEntrega = items.filter(function (r) {
      return (r.entregues || 0) === 0;
    }).length;

    var slaBaixo = items.filter(function (r) {
      return r.sla != null && Number(r.sla) < SLA_LOW && (r.pedidos || 0) > 0;
    }).length;

    var inativo = items.filter(function (r) {
      return isInactive(r, now);
    }).length;

    var cargaAlta = items.filter(function (r) {
      return (r.em_rota || 0) >= 50;
    }).length;

    var alerts = [];

    if (semEntrega > 0) {
      alerts.push({
        id: "sem_entrega",
        count: semEntrega,
        text: semEntrega + " motoboy" + (semEntrega !== 1 ? "s" : "") + " sem entregas registradas",
        filter: "sem_entrega",
      });
    }
    if (slaBaixo > 0) {
      alerts.push({
        id: "sla_baixo",
        count: slaBaixo,
        text: slaBaixo + " motoboy" + (slaBaixo !== 1 ? "s" : "") + " com SLA abaixo de 10%",
        filter: "sla_baixo",
      });
    }
    if (inativo > 0) {
      alerts.push({
        id: "inativo",
        count: inativo,
        text: inativo + " motoboy" + (inativo !== 1 ? "s" : "") + " há mais de 2h sem última entrega",
        filter: "inativo",
      });
    }
    if (cargaAlta > 0) {
      alerts.push({
        id: "carga_alta",
        count: cargaAlta,
        text: cargaAlta + " motoboy" + (cargaAlta !== 1 ? "s" : "") + " com mais de 50 pedidos em rota",
        filter: "carga_alta",
      });
    }

    return alerts;
  }

  function computeRanking(items) {
    if (!Array.isArray(items) || items.length === 0) {
      return { top: [], attention: [] };
    }

    var top = items
      .slice()
      .sort(function (a, b) {
        var ea = a.entregues || 0;
        var eb = b.entregues || 0;
        if (eb !== ea) return eb - ea;
        var sa = a.sla != null ? Number(a.sla) : -1;
        var sb = b.sla != null ? Number(b.sla) : -1;
        return sb - sa;
      })
      .slice(0, 3);

    var attention = items
      .filter(function (r) {
        return (r.entregues || 0) === 0 || (r.sla != null && Number(r.sla) < SLA_LOW);
      })
      .slice()
      .sort(function (a, b) {
        return (b.pedidos || 0) - (a.pedidos || 0);
      })
      .slice(0, 3);

    return { top: top, attention: attention };
  }

  function rowHighlightClass(row, now) {
    if (!row) return "";
    var entregues = row.entregues || 0;
    var sla = row.sla != null ? Number(row.sla) : null;

    if (entregues === 0) return "acom-row--zero";
    if (sla != null && sla >= 100) return "acom-row--done";
    if (isCritico(row, now)) return "acom-row--critical";
    if ((row.em_rota || 0) === 0 && entregues > 0) return "acom-row--finished";
    return "";
  }

  function statusBadgeClass(statusKey) {
    return "acom-badge acom-badge--" + (statusKey || "em_andamento");
  }

  function slaBadgeClass(pct) {
    return "acom-sla-badge acom-sla-badge--" + slaTier(pct);
  }

  global.AcompOperational = {
    INACTIVE_MINUTES: INACTIVE_MINUTES,
    slaTier: slaTier,
    fmtSLA: fmtSLA,
    minutesSince: minutesSince,
    fmtUltimaEntrega: fmtUltimaEntrega,
    deriveStatus: deriveStatus,
    isCritico: isCritico,
    isInactive: isInactive,
    matchesQuickFilter: matchesQuickFilter,
    applyQuickFilter: applyQuickFilter,
    computeAlerts: computeAlerts,
    computeRanking: computeRanking,
    rowHighlightClass: rowHighlightClass,
    statusBadgeClass: statusBadgeClass,
    slaBadgeClass: slaBadgeClass,
  };
})(window);
