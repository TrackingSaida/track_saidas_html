/**
 * Padrão do sistema para nomes de pessoas (web).
 * - Inicial maiúscula, restante minúsculo por palavra
 * - Partículas pt-BR (de/da/do/das/dos/e) em minúsculo (exceto 1ª palavra)
 * - Ordenação alfabética pt-BR
 */
(function (global) {
  "use strict";

  var MINOR_WORDS = { de: 1, da: 1, do: 1, das: 1, dos: 1, e: 1 };

  function formatPersonName(raw) {
    var s = String(raw || "").replace(/\s+/g, " ").trim();
    if (!s) return "";
    return s
      .split(" ")
      .map(function (word, index) {
        var lower = word.toLocaleLowerCase("pt-BR");
        if (index > 0 && MINOR_WORDS[lower]) return lower;
        return lower
          .split("-")
          .map(function (chunk) {
            if (!chunk) return chunk;
            return chunk.charAt(0).toLocaleUpperCase("pt-BR") + chunk.slice(1);
          })
          .join("-");
      })
      .join(" ");
  }

  function personNameKey(raw) {
    return String(raw || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("pt-BR")
      .replace(/\s+/g, " ")
      .trim();
  }

  function comparePersonNames(a, b) {
    return String(a || "").localeCompare(String(b || ""), "pt-BR", { sensitivity: "base" });
  }

  function sortByPersonName(list, getName) {
    var getter =
      typeof getName === "function"
        ? getName
        : function (item) {
            if (item == null) return "";
            if (typeof item === "string") return item;
            return item.nome || item.name || item.motoboy_nome || item.entregador_nome || "";
          };
    return (list || []).slice().sort(function (a, b) {
      return comparePersonNames(getter(a), getter(b));
    });
  }

  /** Formata nome de cada item e ordena A→Z. */
  function normalizePersonList(list, getName, setName) {
    var getter =
      typeof getName === "function"
        ? getName
        : function (item) {
            return item && (item.nome || item.name || "");
          };
    var setter =
      typeof setName === "function"
        ? setName
        : function (item, nome) {
            if (item && typeof item === "object") item.nome = nome;
            return item;
          };
    var mapped = (list || []).map(function (item) {
      if (typeof item === "string") return formatPersonName(item);
      var copy = Object.assign({}, item);
      setter(copy, formatPersonName(getter(item)));
      return copy;
    });
    return sortByPersonName(mapped, getter);
  }

  function buildUniquePersonNames(nomes) {
    var map = new Map();
    (nomes || []).forEach(function (n) {
      var display = formatPersonName(n);
      if (!display) return;
      var key = personNameKey(display);
      if (!map.has(key)) map.set(key, display);
    });
    return Array.from(map.values()).sort(comparePersonNames);
  }

  global.formatPersonName = formatPersonName;
  global.personNameKey = personNameKey;
  global.comparePersonNames = comparePersonNames;
  global.sortByPersonName = sortByPersonName;
  global.normalizePersonList = normalizePersonList;
  global.buildUniquePersonNames = buildUniquePersonNames;

  // Alias legado usado em várias telas
  global.normalizeNomeKey = personNameKey;
})(typeof window !== "undefined" ? window : globalThis);
