/* Tipo e máscara da chave PIX a receber. A chave salva é a que o banco aceita ao colar. */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.PixChave = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  const ROTULO = {
    cpf: "CPF",
    cnpj: "CNPJ",
    telefone: "Celular",
    email: "E-mail",
    aleatoria: "Aleatória",
  };

  function digitos(valor) {
    return String(valor || "").replace(/\D/g, "");
  }

  function rotulo(tipo) {
    return ROTULO[String(tipo || "").trim().toLowerCase()] || "";
  }

  function mascaraCpf(valor) {
    const d = digitos(valor).slice(0, 11);
    if (d.length <= 3) return d;
    if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
    if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
    return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  }

  function mascaraCnpj(valor) {
    const d = digitos(valor).slice(0, 14);
    let out = d.slice(0, 2);
    if (d.length > 2) out += `.${d.slice(2, 5)}`;
    if (d.length > 5) out += `.${d.slice(5, 8)}`;
    if (d.length > 8) out += `/${d.slice(8, 12)}`;
    if (d.length > 12) out += `-${d.slice(12, 14)}`;
    return out;
  }

  function mascaraCelular(valor) {
    let d = digitos(valor);
    if (d.startsWith("55") && d.length > 11) d = d.slice(2);
    d = d.slice(0, 11);
    if (!d) return "";
    let out = `+55 (${d.slice(0, Math.min(2, d.length))}`;
    if (d.length >= 2) out += ")";
    if (d.length > 2) out += ` ${d.slice(2, 7)}`;
    if (d.length > 7) out += `-${d.slice(7, 11)}`;
    return out;
  }

  function mascaraEmail(valor) {
    return String(valor || "").replace(/\s/g, "").toLowerCase().slice(0, 77);
  }

  function mascaraAleatoria(valor) {
    const h = String(valor || "").toLowerCase().replace(/[^0-9a-f]/g, "").slice(0, 32);
    const tamanhos = [8, 4, 4, 4, 12];
    const partes = [];
    let i = 0;
    tamanhos.forEach((n) => {
      if (i >= h.length) return;
      partes.push(h.slice(i, i + n));
      i += n;
    });
    return partes.join("-");
  }

  function formatar(tipo, valor) {
    const codigo = String(tipo || "").trim().toLowerCase();
    if (codigo === "cpf") return mascaraCpf(valor);
    if (codigo === "cnpj") return mascaraCnpj(valor);
    if (codigo === "telefone") return mascaraCelular(valor);
    if (codigo === "email") return mascaraEmail(valor);
    if (codigo === "aleatoria") return mascaraAleatoria(valor);
    return String(valor || "");
  }

  function limite(tipo) {
    const codigo = String(tipo || "").trim().toLowerCase();
    if (codigo === "cpf") return 14;
    if (codigo === "cnpj") return 18;
    if (codigo === "telefone") return 19;
    if (codigo === "email") return 77;
    if (codigo === "aleatoria") return 36;
    return 140;
  }

  function exibir(tipo, chave) {
    const valor = String(chave || "").trim();
    if (!valor) return "";
    const nome = rotulo(tipo);
    const mostrado = nome ? formatar(tipo, valor) : valor;
    return nome ? `${nome} ${mostrado}` : mostrado;
  }

  function linhaRelatorio(tipo, chave) {
    const valor = String(chave || "").trim();
    if (!valor) return "";
    const nome = rotulo(tipo);
    return nome ? `PIX ${nome} ${valor}` : `PIX ${valor}`;
  }

  function aplicarLimite(select, input) {
    if (!input) return;
    const tipo = select?.value || "";
    input.maxLength = limite(tipo);
    input.placeholder = tipo ? {
      cpf: "000.000.000-00",
      cnpj: "00.000.000/0000-00",
      telefone: "+55 (00) 00000-0000",
      email: "nome@empresa.com",
      aleatoria: "00000000-0000-0000-0000-000000000000",
    }[tipo] : "Chave PIX";
    input.inputMode = tipo === "email" || tipo === "aleatoria" || !tipo ? "text" : "numeric";
  }

  function cpfValido(d) {
    if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
    const dv = (base, fator) => {
      let total = 0;
      for (let i = 0; i < base.length; i += 1) total += Number(base[i]) * (fator - i);
      const resto = (total * 10) % 11;
      return resto === 10 ? 0 : resto;
    };
    return dv(d.slice(0, 9), 10) === Number(d[9]) && dv(d.slice(0, 10), 11) === Number(d[10]);
  }

  function cnpjValido(d) {
    if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false;
    const dv = (base, pesos) => {
      const resto = pesos.reduce((acc, peso, i) => acc + Number(base[i]) * peso, 0) % 11;
      return resto < 2 ? 0 : 11 - resto;
    };
    const pesos1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const pesos2 = [6].concat(pesos1);
    return dv(d.slice(0, 12), pesos1) === Number(d[12]) && dv(d.slice(0, 13), pesos2) === Number(d[13]);
  }

  function erroDaChave(tipo, chave) {
    if (tipo === "cpf") return cpfValido(digitos(chave)) ? "" : "CPF inválido.";
    if (tipo === "cnpj") return cnpjValido(digitos(chave)) ? "" : "CNPJ inválido.";
    if (tipo === "telefone") {
      let d = digitos(chave);
      if (d.startsWith("55") && d.length === 13) d = d.slice(2);
      if (d.length === 11 && d[2] === "9" && d[0] !== "0") return "";
      return "Celular inválido. Use DDD e os 9 dígitos.";
    }
    if (tipo === "email") {
      const email = String(chave || "").trim().toLowerCase();
      const partes = email.split("@");
      if (email.length > 77 || email.includes(" ") || partes.length !== 2 || !partes[0] || !partes[1].includes(".")) {
        return "E-mail inválido.";
      }
      if (partes[1].startsWith(".") || partes[1].endsWith(".")) return "E-mail inválido.";
      return "";
    }
    const hex = String(chave || "").toLowerCase().replace(/[^0-9a-f]/g, "");
    return hex.length === 32 ? "" : "Chave aleatória inválida.";
  }

  function ler(select, input) {
    const tipo = (select?.value || "").trim().toLowerCase();
    const chave = (input?.value || "").trim();
    const original = (input?.dataset.original || "").trim();
    if (!tipo && !chave) return { tipo: null, chave: null, erro: "" };
    if (!tipo) {
      if (original && chave === original) return { tipo: null, chave: original, erro: "" };
      return { tipo: null, chave: null, erro: "Informe o tipo da chave PIX." };
    }
    if (!chave) return { tipo: null, chave: null, erro: "Informe a chave PIX." };
    const erro = erroDaChave(tipo, chave);
    if (erro) return { tipo: null, chave: null, erro };
    return { tipo, chave, erro: "" };
  }

  function mostrarErro(input, erroId, msg) {
    const erro = erroId ? document.querySelector(erroId) : null;
    if (erro) {
      erro.hidden = !msg;
      erro.textContent = msg || "";
    }
    if (input) input.setAttribute("aria-invalid", msg ? "true" : "false");
  }

  function ligar(select, input, erroId) {
    if (!select || !input || select.dataset.pixLigado) return;
    select.dataset.pixLigado = "1";
    aplicarLimite(select, input);
    select.addEventListener("change", () => {
      if (select.dataset.silencioso) return;
      input.value = "";
      input.dataset.original = "";
      aplicarLimite(select, input);
      mostrarErro(input, erroId, "");
    });
    input.addEventListener("input", () => {
      const tipo = select.value;
      if (tipo) {
        const pos = input.selectionStart;
        const antes = input.value;
        input.value = formatar(tipo, antes);
        if (document.activeElement === input && pos != null) {
          const delta = input.value.length - antes.length;
          const alvo = Math.max(0, pos + delta);
          input.setSelectionRange(alvo, alvo);
        }
      }
      mostrarErro(input, erroId, "");
    });
  }

  function preencher(select, input, tipo, chave) {
    if (!select || !input) return;
    const codigo = String(tipo || "").trim().toLowerCase();
    select.dataset.silencioso = "1";
    select.value = ROTULO[codigo] ? codigo : "";
    delete select.dataset.silencioso;
    input.dataset.original = String(chave || "").trim();
    input.value = select.value ? formatar(select.value, chave) : String(chave || "");
    aplicarLimite(select, input);
  }

  function limpar(select, input, erroId) {
    preencher(select, input, "", "");
    mostrarErro(input, erroId, "");
  }

  return {
    rotulo,
    formatar,
    exibir,
    linhaRelatorio,
    ler,
    ligar,
    preencher,
    limpar,
    mostrarErro,
  };
});
