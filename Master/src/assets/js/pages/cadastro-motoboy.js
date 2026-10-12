// =========================
// Cadastro de entregador por convite (página pública, sem login)
// =========================

(function () {
  'use strict';

  const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=br.com.trackingsaidas.mobile';
  const STEP_NAMES = ['Seus dados', 'Endereço', 'Acesso'];
  const STEP_FIELDS = [
    ['nome', 'sobrenome', 'documento', 'data_nascimento', 'contato', 'email', 'chave_pix', 'cnpj'],
    ['cep', 'rua', 'numero', 'complemento', 'bairro', 'cidade', 'estado'],
    ['username', 'senha', 'confirmar_senha', 'aceite_privacidade'],
  ];
  const DRAFT_EXCLUDE = new Set(['senha', 'confirmar_senha', 'website']);
  const UFS = new Set('AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' '));
  const SENHAS_TRIVIAIS = new Set([
    '123456', '1234567', '12345678', '123456789', '654321', '000000', '111111',
    '123123', 'abcdef', 'abc123', 'qwerty', 'senha', 'senha123', 'password',
  ]);
  const USERNAME_RE = /^[a-z0-9._]{3,30}$/;
  const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

  const $ = (s, root) => (root || document).querySelector(s);
  const $$ = (s, root) => Array.from((root || document).querySelectorAll(s));
  const text = (v) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
  const digits = (v) => String(v == null ? '' : v).replace(/\D+/g, '');

  let API = '';
  try {
    API = window.getTrackApiUrl();
  } catch (err) {
    console.error('[cadastro-motoboy]', err);
  }

  const token = (new URLSearchParams(window.location.search).get('c') || '').trim();
  const DRAFT_KEY = 'cm-draft:' + token;

  const state = {
    step: 0,
    ownerName: '',
    submitting: false,
    usernameAuto: true,
    usernameCheck: { value: '', disponivel: null },
    touched: new Set(),
  };

  // ---------- Máscaras ----------
  const masks = {
    documento(v) {
      return digits(v).slice(0, 11)
        .replace(/^(\d{3})(\d)/, '$1.$2')
        .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
        .replace(/\.(\d{3})(\d)/, '.$1-$2');
    },
    contato(v) {
      return digits(v).slice(0, 11)
        .replace(/^(\d{2})(\d)/, '($1) $2')
        .replace(/(\d{5})(\d)/, '$1-$2');
    },
    cep(v) {
      return digits(v).slice(0, 8).replace(/^(\d{5})(\d)/, '$1-$2');
    },
    cnpj(v) {
      return digits(v).slice(0, 14)
        .replace(/^(\d{2})(\d)/, '$1.$2')
        .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
        .replace(/\.(\d{3})(\d)/, '.$1/$2')
        .replace(/(\d{4})(\d)/, '$1-$2');
    },
    data_nascimento(v) {
      return digits(v).slice(0, 8)
        .replace(/^(\d{2})(\d)/, '$1/$2')
        .replace(/^(\d{2})\/(\d{2})(\d)/, '$1/$2/$3');
    },
  };

  // ---------- Validadores ----------
  function cpfValido(cpf) {
    const d = digits(cpf);
    if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
    for (let t = 9; t < 11; t++) {
      let soma = 0;
      for (let i = 0; i < t; i++) soma += Number(d[i]) * (t + 1 - i);
      const dv = ((soma * 10) % 11) % 10;
      if (dv !== Number(d[t])) return false;
    }
    return true;
  }

  function cnpjValido(cnpj) {
    const d = digits(cnpj);
    if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
    const calc = (len) => {
      const pesos = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
      const soma = pesos.reduce((acc, p, i) => acc + Number(d[i]) * p, 0);
      const r = soma % 11;
      return r < 2 ? 0 : 11 - r;
    };
    return calc(12) === Number(d[12]) && calc(13) === Number(d[13]);
  }

  function parseDataBr(v) {
    const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text(v));
    if (!m) return null;
    const dia = Number(m[1]);
    const mes = Number(m[2]);
    const ano = Number(m[3]);
    const dt = new Date(ano, mes - 1, dia);
    if (dt.getFullYear() !== ano || dt.getMonth() !== mes - 1 || dt.getDate() !== dia) return null;
    return { dt, iso: m[3] + '-' + m[2] + '-' + m[1] };
  }

  function semAcentos(v) {
    return String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  function normalizarUsername(v) {
    return semAcentos(String(v || '').trim().toLowerCase());
  }

  function senhaTrivial(senha) {
    const s = String(senha || '').toLowerCase();
    if (!s) return false;
    if (SENHAS_TRIVIAIS.has(s) || new Set(s).size === 1) return true;
    if (/^\d+$/.test(s) && ('01234567890123456789'.includes(s) || '98765432109876543210'.includes(s))) return true;
    return false;
  }

  function senhaRegras() {
    const senha = $('#senha').value;
    const conf = $('#confirmar_senha').value;
    const user = normalizarUsername($('#username').value);
    return {
      len: senha.length >= 6 && senha.length <= 72,
      trivial: senha.length > 0 && !senhaTrivial(senha) && senha.toLowerCase() !== user,
      match: conf.length > 0 && senha === conf,
    };
  }

  const validators = {
    nome: (v) => (text(v).length >= 2 ? '' : 'Informe seu nome.'),
    sobrenome: (v) => (text(v).length >= 2 ? '' : 'Informe seu sobrenome.'),
    documento: (v) => {
      if (!digits(v)) return 'Informe seu CPF.';
      return cpfValido(v) ? '' : 'CPF inválido. Confira os números.';
    },
    data_nascimento: (v) => {
      if (!text(v)) return 'Informe a data de nascimento.';
      const p = parseDataBr(v);
      if (!p) return 'Use o formato dd/mm/aaaa.';
      const hoje = new Date();
      hoje.setHours(0, 0, 0, 0);
      if (p.dt >= hoje || p.dt.getFullYear() < 1900) return 'Data de nascimento inválida.';
      return '';
    },
    contato: (v) => {
      const d = digits(v);
      if (!d) return 'Informe seu celular.';
      return d.length === 11 && d[2] === '9' ? '' : 'Informe um celular com DDD, ex.: (11) 91234-5678.';
    },
    email: (v) => {
      const e = text(v);
      return !e || EMAIL_RE.test(e) ? '' : 'E-mail inválido.';
    },
    chave_pix: (v) => (text(v).length <= 140 ? '' : 'Chave PIX muito longa.'),
    cnpj: (v) => (!digits(v) || cnpjValido(v) ? '' : 'CNPJ inválido. Confira os números.'),
    cep: (v) => (digits(v).length === 8 ? '' : 'Informe um CEP com 8 números.'),
    rua: (v) => (text(v) ? '' : 'Informe a rua.'),
    numero: (v) => (text(v) ? '' : 'Informe o número (use S/N se não tiver).'),
    complemento: () => '',
    bairro: (v) => (text(v) ? '' : 'Informe o bairro.'),
    cidade: (v) => (text(v) ? '' : 'Informe a cidade.'),
    estado: (v) => (UFS.has(text(v).toUpperCase()) ? '' : 'Selecione a UF.'),
    username: (v) => {
      const u = normalizarUsername(v);
      if (!u) return 'Escolha um usuário.';
      if (!USERNAME_RE.test(u)) return 'Use de 3 a 30 letras minúsculas, números, ponto ou _.';
      if (state.usernameCheck.value === u && state.usernameCheck.disponivel === false) {
        return 'Este usuário já está em uso. Escolha outro.';
      }
      return '';
    },
    senha: () => {
      const r = senhaRegras();
      if (!$('#senha').value) return 'Crie uma senha.';
      if (!r.len) return 'A senha precisa ter de 6 a 72 caracteres.';
      if (!r.trivial) return 'Escolha uma senha mais difícil de adivinhar.';
      return '';
    },
    confirmar_senha: () => {
      if (!$('#confirmar_senha').value) return 'Repita a senha.';
      return senhaRegras().match ? '' : 'As senhas não são iguais.';
    },
    aceite_privacidade: () => ($('#aceite_privacidade').checked ? '' : 'Aceite a Política de Privacidade para continuar.'),
  };

  // ---------- Erros por campo ----------
  function fieldEl(name) {
    return document.getElementById(name);
  }

  function setFieldError(name, msg) {
    const input = fieldEl(name);
    const box = document.getElementById('err-' + name);
    if (!input || !box) return;
    const describedBy = (input.getAttribute('aria-describedby') || '').split(' ').filter(Boolean);
    const errId = 'err-' + name;
    if (msg) {
      box.innerHTML = '<i class="ri-error-warning-fill" aria-hidden="true"></i><span></span>';
      box.querySelector('span').textContent = msg;
      box.hidden = false;
      input.setAttribute('aria-invalid', 'true');
      if (!describedBy.includes(errId)) describedBy.push(errId);
    } else {
      box.hidden = true;
      box.textContent = '';
      input.removeAttribute('aria-invalid');
      const idx = describedBy.indexOf(errId);
      if (idx >= 0) describedBy.splice(idx, 1);
    }
    if (describedBy.length) input.setAttribute('aria-describedby', describedBy.join(' '));
    else input.removeAttribute('aria-describedby');
  }

  function validateField(name) {
    const input = fieldEl(name);
    const fn = validators[name];
    if (!input || !fn) return true;
    const msg = fn(input.value);
    setFieldError(name, msg);
    if (msg) state.touched.add(name);
    return !msg;
  }

  function showSummary(msg) {
    const box = $('#cm-summary');
    if (!msg) {
      box.hidden = true;
      box.textContent = '';
      return;
    }
    box.innerHTML = '<i class="ri-error-warning-fill" aria-hidden="true"></i><span></span>';
    box.querySelector('span').textContent = msg;
    box.hidden = false;
  }

  function focusField(name) {
    const input = fieldEl(name);
    if (!input) return;
    const details = input.closest('details');
    if (details) details.open = true;
    input.scrollIntoView({ block: 'center', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    input.focus({ preventScroll: true });
  }

  function prefersReducedMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function validateStep(idx) {
    const invalid = STEP_FIELDS[idx].filter((name) => !validateField(name));
    if (invalid.length) {
      const n = invalid.length;
      showSummary(n === 1 ? 'Corrija 1 campo para continuar.' : 'Corrija ' + n + ' campos para continuar.');
      focusField(invalid[0]);
      return false;
    }
    showSummary('');
    return true;
  }

  // ---------- Telas e etapas ----------
  function showScreen(id) {
    ['cm-loading', 'cm-invalid', 'cm-welcome', 'cm-form', 'cm-success'].forEach((sid) => {
      document.getElementById(sid).hidden = sid !== id;
    });
    window.scrollTo(0, 0);
  }

  function goToStep(idx, opts) {
    state.step = idx;
    $$('.cm-step').forEach((fs) => {
      fs.hidden = Number(fs.dataset.step) !== idx;
    });
    $$('.cm-stop').forEach((li) => {
      const i = Number(li.dataset.stop);
      li.classList.toggle('is-done', i < idx);
      li.classList.toggle('is-current', i === idx);
    });
    $('#cm-route-fill').style.width = (idx / (STEP_NAMES.length - 1)) * 100 + '%';
    $('#cm-route').setAttribute('aria-label', 'Etapa ' + (idx + 1) + ' de ' + STEP_NAMES.length + ': ' + STEP_NAMES[idx]);

    const last = idx === STEP_NAMES.length - 1;
    $('#cm-next .cm-cta-label').textContent = last ? 'Criar meu cadastro' : 'Continuar';
    const icon = $('#cm-next i');
    if (icon) icon.className = last ? 'ri-check-line' : 'ri-arrow-right-line';

    if (last) prefillUsername();
    showSummary('');
    saveDraft();
    if (!(opts && opts.keepScroll)) window.scrollTo(0, 0);
  }

  function setOwnerName(nome) {
    state.ownerName = nome || '';
    $$('[data-owner-name]').forEach((el) => {
      el.textContent = state.ownerName || 'certa';
    });
    if (state.ownerName) {
      $$('[data-owner-chip]').forEach((el) => el.classList.remove('d-none'));
      document.title = 'Convite de ' + state.ownerName + ' | ROTEVO';
    }
  }

  function showInvalid(title, message, detail, retry) {
    $('#cm-invalid-title').textContent = title;
    $('#cm-invalid-text').textContent = message;
    $('#cm-invalid-detail').textContent = detail || '';
    $('#cm-retry').hidden = !retry;
    showScreen('cm-invalid');
  }

  // ---------- Rascunho (sessionStorage, sem senha) ----------
  let draftTimer = null;
  function saveDraft() {
    if (!token) return;
    clearTimeout(draftTimer);
    draftTimer = setTimeout(() => {
      try {
        const data = { step: state.step, usernameAuto: state.usernameAuto, fields: {} };
        $$('#cm-form input, #cm-form select').forEach((el) => {
          if (!el.name || DRAFT_EXCLUDE.has(el.name)) return;
          data.fields[el.name] = el.type === 'checkbox' ? el.checked : el.value;
        });
        sessionStorage.setItem(DRAFT_KEY, JSON.stringify(data));
      } catch (_) { /* storage indisponível: segue sem rascunho */ }
    }, 250);
  }

  function loadDraft() {
    try {
      const raw = sessionStorage.getItem(DRAFT_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      Object.entries(data.fields || {}).forEach(([name, value]) => {
        const el = fieldEl(name);
        if (!el || DRAFT_EXCLUDE.has(name)) return;
        if (el.type === 'checkbox') el.checked = !!value;
        else el.value = value == null ? '' : String(value);
      });
      if ($('#chave_pix').value || $('#cnpj').value) $('#cm-pagamento').open = true;
      state.usernameAuto = data.usernameAuto !== false;
      return data;
    } catch (_) {
      return null;
    }
  }

  function clearDraft() {
    clearTimeout(draftTimer);
    try { sessionStorage.removeItem(DRAFT_KEY); } catch (_) { /* noop */ }
  }

  // ---------- CEP ----------
  let lastCep = '';
  function setCepStatus(msg, kind) {
    const el = $('#cep-status');
    el.textContent = msg || '';
    el.className = 'cm-hint cm-cep-status' + (kind ? ' ' + kind : '');
  }

  async function lookupCep(cep) {
    try {
      const r = await fetch(API + '/cep/' + cep);
      if (r.ok) return r.json();
      if (r.status < 500) return null;
    } catch (_) { /* tenta direto no ViaCEP */ }
    const direct = await fetch('https://viacep.com.br/ws/' + cep + '/json/');
    if (!direct.ok) return null;
    const data = await direct.json();
    return data && !data.erro ? data : null;
  }

  async function onCepComplete() {
    const cep = digits($('#cep').value);
    if (cep.length !== 8 || cep === lastCep) return;
    lastCep = cep;
    setCepStatus('Buscando endereço...', 'is-loading');
    try {
      const data = await lookupCep(cep);
      if (digits($('#cep').value) !== cep) return;
      if (!data) throw new Error('nao encontrado');
      const fill = (name, value) => {
        if (!value) return;
        fieldEl(name).value = value;
        setFieldError(name, '');
      };
      fill('rua', data.logradouro);
      fill('bairro', data.bairro);
      fill('cidade', data.localidade);
      const uf = String(data.uf || '').toUpperCase();
      if (UFS.has(uf)) fill('estado', uf);
      setCepStatus('Endereço encontrado. Confira e informe o número.', 'is-ok');
      saveDraft();
      const alvo = $('#rua').value ? 'numero' : 'rua';
      fieldEl(alvo).focus();
    } catch (_) {
      lastCep = '';
      setCepStatus('Não achamos o CEP, preencha o endereço manualmente.', 'is-warn');
    }
  }

  // ---------- Usuário ao vivo ----------
  function sugerirBase() {
    const primeiro = normalizarUsername(text($('#nome').value).split(' ')[0] || '');
    const partes = text($('#sobrenome').value).split(' ').filter(Boolean);
    const ultimo = normalizarUsername(partes[partes.length - 1] || '');
    const limpa = (s) => s.replace(/[^a-z0-9]/g, '');
    return [limpa(primeiro), limpa(ultimo)].filter(Boolean).join('.').slice(0, 30);
  }

  function prefillUsername() {
    const input = $('#username');
    if (!state.usernameAuto && input.value) return;
    const base = sugerirBase();
    if (base && base !== input.value) {
      input.value = base;
      checkUsername();
    }
  }

  function setUsernameStatus(kind, msg) {
    const el = $('#username-status');
    el.className = 'cm-username-status' + (kind ? ' is-' + kind : '');
    if (!msg) {
      el.textContent = '';
      return;
    }
    const icons = { ok: 'ri-checkbox-circle-fill', taken: 'ri-close-circle-fill', checking: 'ri-loader-4-line' };
    el.innerHTML = '<i class="' + (icons[kind] || '') + '" aria-hidden="true"></i><span></span>';
    el.querySelector('span').textContent = msg;
  }

  function renderSuggestions(list) {
    const box = $('#username-suggestions');
    box.innerHTML = '';
    (list || []).slice(0, 3).forEach((s) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'cm-suggestion';
      btn.textContent = s;
      btn.setAttribute('aria-label', 'Usar ' + s);
      btn.addEventListener('click', () => {
        const input = $('#username');
        input.value = s;
        state.usernameAuto = false;
        state.usernameCheck = { value: s, disponivel: true };
        setUsernameStatus('ok', 'Disponível');
        renderSuggestions([]);
        setFieldError('username', '');
        saveDraft();
        input.focus();
      });
      box.appendChild(btn);
    });
    box.hidden = !box.children.length;
  }

  let usernameTimer = null;
  let usernameSeq = 0;
  function checkUsername() {
    clearTimeout(usernameTimer);
    const u = normalizarUsername($('#username').value);
    renderSuggestions([]);
    if (!u || !USERNAME_RE.test(u)) {
      state.usernameCheck = { value: u, disponivel: null };
      setUsernameStatus('', '');
      return;
    }
    if (state.usernameCheck.value === u && state.usernameCheck.disponivel !== null) {
      applyUsernameResult(u, state.usernameCheck.disponivel, state.usernameCheck.sugestoes);
      return;
    }
    setUsernameStatus('checking', 'Verificando...');
    usernameTimer = setTimeout(async () => {
      const seq = ++usernameSeq;
      try {
        const r = await fetch(
          API + '/public/convite-motoboy/' + encodeURIComponent(token) + '/username-disponivel?u=' + encodeURIComponent(u)
        );
        if (seq !== usernameSeq) return;
        if (!r.ok) {
          setUsernameStatus('', '');
          return;
        }
        const data = await r.json();
        state.usernameCheck = { value: u, disponivel: !!data.disponivel, sugestoes: data.sugestoes || [] };
        applyUsernameResult(u, !!data.disponivel, data.sugestoes);
      } catch (_) {
        if (seq === usernameSeq) setUsernameStatus('', '');
      }
    }, 400);
  }

  function applyUsernameResult(u, disponivel, sugestoes) {
    if (normalizarUsername($('#username').value) !== u) return;
    if (disponivel) {
      setUsernameStatus('ok', 'Disponível');
      renderSuggestions([]);
      if (state.touched.has('username')) validateField('username');
    } else {
      setUsernameStatus('taken', (sugestoes && sugestoes.length) ? 'Já está em uso. Que tal:' : 'Já está em uso.');
      renderSuggestions(sugestoes);
    }
  }

  // ---------- Senha ----------
  function updatePassRules() {
    const r = senhaRegras();
    const senha = $('#senha').value;
    $$('#cm-pass-rules li').forEach((li) => {
      const ok = r[li.dataset.rule];
      const typed = li.dataset.rule === 'match' ? $('#confirmar_senha').value.length > 0 : senha.length > 0;
      li.classList.toggle('is-ok', !!ok);
      li.classList.toggle('is-bad', !ok && typed && state.touched.has(li.dataset.rule === 'match' ? 'confirmar_senha' : 'senha'));
      const i = li.querySelector('i');
      i.className = ok ? 'ri-checkbox-circle-fill' : (li.classList.contains('is-bad') ? 'ri-close-circle-fill' : 'ri-checkbox-blank-circle-line');
    });
  }

  // ---------- Envio ----------
  function setSubmitting(on) {
    state.submitting = on;
    const btn = $('#cm-next');
    btn.setAttribute('aria-busy', on ? 'true' : 'false');
    btn.disabled = on;
    if (on) {
      btn.dataset.html = btn.innerHTML;
      btn.innerHTML = '<span class="cm-spinner" aria-hidden="true"></span> Criando cadastro...';
    } else if (btn.dataset.html) {
      btn.innerHTML = btn.dataset.html;
    }
  }

  function buildPayload() {
    const v = (name) => fieldEl(name).value;
    const data = parseDataBr(v('data_nascimento'));
    return {
      nome: text(v('nome')),
      sobrenome: text(v('sobrenome')),
      documento: digits(v('documento')),
      data_nascimento: data ? data.iso : '',
      contato: digits(v('contato')),
      email: text(v('email')) || null,
      chave_pix: text(v('chave_pix')) || null,
      cnpj: digits(v('cnpj')) || null,
      cep: digits(v('cep')),
      rua: text(v('rua')),
      numero: text(v('numero')),
      complemento: text(v('complemento')) || null,
      bairro: text(v('bairro')),
      cidade: text(v('cidade')),
      estado: text(v('estado')).toUpperCase(),
      username: normalizarUsername(v('username')),
      senha: v('senha'),
      confirmar_senha: v('confirmar_senha'),
      aceite_privacidade: $('#aceite_privacidade').checked,
      website: v('website'),
    };
  }

  function stepOfField(name) {
    return STEP_FIELDS.findIndex((list) => list.includes(name));
  }

  async function submit() {
    if (state.submitting) return;
    for (let i = 0; i < STEP_FIELDS.length; i++) {
      const invalid = STEP_FIELDS[i].filter((name) => !validateField(name));
      if (invalid.length) {
        if (i !== state.step) goToStep(i);
        validateStep(i);
        return;
      }
    }

    setSubmitting(true);
    showSummary('');
    let res;
    let body = null;
    try {
      res = await fetch(API + '/public/convite-motoboy/' + encodeURIComponent(token) + '/cadastro', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload()),
      });
      body = await res.json().catch(() => null);
    } catch (_) {
      setSubmitting(false);
      showSummary('Sem conexão. Verifique sua internet e tente de novo.');
      return;
    }

    if (res.ok) {
      clearDraft();
      showSuccess(body || {});
      return;
    }

    setSubmitting(false);
    const detail = body && body.detail;
    const field = detail && typeof detail === 'object' ? detail.field : null;
    const message = detail && typeof detail === 'object' ? detail.message : (typeof detail === 'string' ? detail : '');

    if (res.status === 410) {
      clearDraft();
      showInvalid('Este link não está mais ativo', 'Peça um novo link para quem te enviou.', message);
      return;
    }

    if (field && fieldEl(field)) {
      const idx = stepOfField(field);
      if (idx >= 0 && idx !== state.step) goToStep(idx);
      if (field === 'username') {
        state.usernameCheck = {
          value: normalizarUsername(fieldEl('username').value),
          disponivel: false,
          sugestoes: detail.sugestoes || [],
        };
        setUsernameStatus('taken', 'Já está em uso. Que tal:');
        renderSuggestions(detail.sugestoes);
      }
      setFieldError(field, message || 'Confira este campo.');
      state.touched.add(field);
      showSummary(message || 'Confira o campo destacado.');
      focusField(field);
      return;
    }

    if (res.status === 429) {
      showSummary(message || 'Muitas tentativas. Aguarde alguns minutos e tente de novo.');
      return;
    }
    showSummary(message || 'Não foi possível criar o cadastro. Tente novamente.');
  }

  function isIOS() {
    const ua = navigator.userAgent || '';
    return /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  }

  function showSuccess(data) {
    $('#cm-ok-nome').textContent = data.nome || text($('#nome').value);
    $('#cm-ok-username').textContent = data.username || normalizarUsername($('#username').value);
    if (data.nome_owner) setOwnerName(data.nome_owner);
    $('#cm-ios-note').hidden = !isIOS();
    showScreen('cm-success');
    $('#cm-success').focus({ preventScroll: true });
  }

  async function copyUsername() {
    const btn = $('#cm-copy-user');
    const value = $('#cm-ok-username').textContent;
    try {
      await navigator.clipboard.writeText(value);
    } catch (_) {
      const tmp = document.createElement('textarea');
      tmp.value = value;
      tmp.setAttribute('readonly', '');
      tmp.style.position = 'absolute';
      tmp.style.left = '-9999px';
      document.body.appendChild(tmp);
      tmp.select();
      try { document.execCommand('copy'); } catch (__) { /* noop */ }
      tmp.remove();
    }
    btn.classList.add('is-copied');
    btn.querySelector('span').textContent = 'Copiado';
    btn.querySelector('i').className = 'ri-check-line';
    setTimeout(() => {
      btn.classList.remove('is-copied');
      btn.querySelector('span').textContent = 'Copiar';
      btn.querySelector('i').className = 'ri-file-copy-line';
    }, 2000);
  }

  // ---------- Carregar convite ----------
  async function loadConvite() {
    if (!token || !API) {
      showInvalid('Este link não está mais ativo', 'Peça um novo link para quem te enviou.', '');
      return;
    }
    showScreen('cm-loading');
    let data;
    try {
      const r = await fetch(API + '/public/convite-motoboy/' + encodeURIComponent(token));
      if (!r.ok) throw new Error('http ' + r.status);
      data = await r.json();
    } catch (_) {
      showInvalid(
        'Não foi possível abrir o convite',
        'Verifique sua internet e tente novamente.',
        '',
        true
      );
      return;
    }

    if (!data || !data.valido) {
      clearDraft();
      showInvalid('Este link não está mais ativo', 'Peça um novo link para quem te enviou.', data && data.mensagem);
      return;
    }

    setOwnerName(data.nome_owner);
    const draft = loadDraft();
    if (draft) {
      showScreen('cm-form');
      goToStep(Math.min(Math.max(Number(draft.step) || 0, 0), STEP_NAMES.length - 1));
    } else {
      showScreen('cm-welcome');
    }
  }

  // ---------- Eventos ----------
  function bindEvents() {
    Object.keys(masks).forEach((name) => {
      const input = fieldEl(name);
      input.addEventListener('input', () => {
        const pos = input.selectionStart;
        const atEnd = pos === input.value.length;
        input.value = masks[name](input.value);
        if (atEnd) input.setSelectionRange(input.value.length, input.value.length);
      });
    });

    Object.keys(validators).forEach((name) => {
      const input = fieldEl(name);
      if (!input) return;
      const evt = input.type === 'checkbox' || input.tagName === 'SELECT' ? 'change' : 'blur';
      input.addEventListener(evt, () => {
        if (input.type === 'checkbox' || input.tagName === 'SELECT' || text(input.value) || state.touched.has(name)) {
          validateField(name);
        }
      });
      input.addEventListener('input', () => {
        if (state.touched.has(name)) validateField(name);
        saveDraft();
      });
    });

    $('#cep').addEventListener('input', () => {
      if (digits($('#cep').value).length === 8) onCepComplete();
      else {
        lastCep = '';
        setCepStatus('', '');
      }
    });

    ['nome', 'sobrenome'].forEach((name) => {
      fieldEl(name).addEventListener('input', () => {
        if (state.usernameAuto && state.step === 2) prefillUsername();
      });
    });

    $('#username').addEventListener('input', () => {
      const input = $('#username');
      const norm = normalizarUsername(input.value).replace(/\s+/g, '');
      if (norm !== input.value) input.value = norm;
      state.usernameAuto = false;
      checkUsername();
    });

    ['senha', 'confirmar_senha', 'username'].forEach((name) => {
      fieldEl(name).addEventListener('input', () => {
        updatePassRules();
        if (name !== 'confirmar_senha' && state.touched.has('confirmar_senha')) validateField('confirmar_senha');
      });
    });
    ['senha', 'confirmar_senha'].forEach((name) => {
      fieldEl(name).addEventListener('blur', updatePassRules);
    });

    $$('.cm-toggle-pass').forEach((btn) => {
      btn.addEventListener('click', () => {
        const input = document.getElementById(btn.dataset.target);
        const show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        btn.setAttribute('aria-pressed', show ? 'true' : 'false');
        btn.setAttribute('aria-label', show ? 'Ocultar senha' : 'Mostrar senha');
        btn.querySelector('i').className = show ? 'ri-eye-off-line' : 'ri-eye-line';
      });
    });

    $('#cm-start').addEventListener('click', () => {
      showScreen('cm-form');
      goToStep(0);
      setTimeout(() => fieldEl('nome').focus(), 50);
    });

    $('#cm-back').addEventListener('click', () => {
      if (state.step === 0) {
        showScreen('cm-welcome');
        return;
      }
      goToStep(state.step - 1);
    });

    $('#cm-form').addEventListener('submit', (e) => {
      e.preventDefault();
      if (state.submitting) return;
      if (state.step < STEP_NAMES.length - 1) {
        if (validateStep(state.step)) {
          goToStep(state.step + 1);
          const first = STEP_FIELDS[state.step][0];
          setTimeout(() => fieldEl(first).focus({ preventScroll: true }), 50);
        }
        return;
      }
      submit();
    });

    $('#cm-copy-user').addEventListener('click', copyUsername);
    $('#cm-retry').addEventListener('click', loadConvite);
  }

  document.addEventListener('DOMContentLoaded', () => {
    $('.cm-play').href = PLAY_STORE_URL;
    bindEvents();
    loadConvite();
  });
})();
