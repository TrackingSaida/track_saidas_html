// =========================
// Signup - ROTEVO (wizard empresa / responsável / acesso)
// =========================

const API_SIGNUP = 'https://track-saidas-api.onrender.com/api/public/signup';

(function () {
  'use strict';

  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  const present = (v) => (typeof v === 'string' ? v.trim() : '');
  const digits = (v) => present(v).replace(/\D+/g, '');

  const STEP_IDS = ['tab-empresa', 'tab-responsavel', 'tab-acesso'];
  const PANE_IDS = ['pane-empresa', 'pane-responsavel', 'pane-acesso'];

  function senhaForteOk(s) {
    return /^(?=.*\d)(?=.*[a-z])(?=.*[A-Z]).{8,}$/.test(present(s));
  }

  function maskCnpj(value) {
    const d = digits(value).slice(0, 14);
    return d
      .replace(/^(\d{2})(\d)/, '$1.$2')
      .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/\.(\d{3})(\d)/, '.$1/$2')
      .replace(/(\d{4})(\d)/, '$1-$2');
  }

  function maskCep(value) {
    const d = digits(value).slice(0, 8);
    return d.replace(/^(\d{5})(\d)/, '$1-$2');
  }

  function maskPhone(value) {
    const d = digits(value).slice(0, 11);
    if (d.length <= 10) {
      return d
        .replace(/^(\d{2})(\d)/, '($1) $2')
        .replace(/(\d{4})(\d)/, '$1-$2');
    }
    return d
      .replace(/^(\d{2})(\d)/, '($1) $2')
      .replace(/(\d{5})(\d)/, '$1-$2');
  }

  function disableBtn(btn, loading) {
    if (!btn) return;
    if (loading) {
      btn.dataset.__html = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = 'Enviando...';
    } else {
      btn.disabled = false;
      if (btn.dataset.__html) btn.innerHTML = btn.dataset.__html;
    }
  }

  function showError(msg) {
    const box = $('#signupError');
    if (!box) {
      alert(msg);
      return;
    }
    box.textContent = msg;
    box.classList.remove('d-none');
  }

  function clearError() {
    const box = $('#signupError');
    if (!box) return;
    box.textContent = '';
    box.classList.add('d-none');
  }

  function parseApiError(txt, status) {
    if (!txt) {
      if (status === 409) return 'Não foi possível criar a conta: dado já cadastrado.';
      return 'Falha ao criar conta.';
    }
    try {
      const j = JSON.parse(txt);
      const detail = j && j.detail;
      if (typeof detail === 'string') return detail;
      if (Array.isArray(detail) && detail.length) {
        return detail.map((d) => d.msg || JSON.stringify(d)).join(' ');
      }
    } catch (_) {}
    return txt.length > 280 ? 'Falha ao criar conta. Verifique os dados e tente novamente.' : txt;
  }

  function validatePane(pane) {
    if (!pane) return false;
    let valid = true;
    const inputs = pane.querySelectorAll('input,select,textarea');
    inputs.forEach((inp) => {
      if (inp.id === 'senha') {
        inp.setCustomValidity(senhaForteOk(inp.value) ? '' : 'Weak');
      }
      if (inp.id === 'senha2') {
        const s1 = $('#senha')?.value || '';
        inp.setCustomValidity(inp.value === s1 ? '' : 'Mismatch');
      }
      if (inp.id === 'cnpj') {
        inp.setCustomValidity(digits(inp.value).length === 14 ? '' : 'CNPJ');
      }
      if (inp.id === 'cep') {
        inp.setCustomValidity(digits(inp.value).length === 8 ? '' : 'CEP');
      }
      if (inp.id === 'telefone' || inp.id === 'telefone_empresa') {
        inp.setCustomValidity(digits(inp.value).length >= 8 ? '' : 'Tel');
      }
      if (inp.id === 'estado') {
        inp.setCustomValidity(present(inp.value).length === 2 ? '' : 'UF');
      }
      if (!inp.checkValidity()) valid = false;
    });
    return valid;
  }

  function goTo(tabId) {
    const idx = STEP_IDS.indexOf(tabId);
    if (idx < 0) return;

    STEP_IDS.forEach((id, i) => {
      const btn = document.getElementById(id);
      const pane = document.getElementById(PANE_IDS[i]);
      if (btn) {
        btn.classList.toggle('active', i === idx);
        btn.setAttribute('aria-selected', i === idx ? 'true' : 'false');
      }
      if (pane) {
        pane.classList.toggle('show', i === idx);
        pane.classList.toggle('active', i === idx);
      }
    });

    const fill = $('.rv-step-bar-fill');
    if (fill) fill.style.width = Math.round(((idx + 1) / STEP_IDS.length) * 100) + '%';

    const auth = $('.rv-auth-scroll');
    if (auth) auth.scrollTop = 0;
  }

  document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('signup-wizard');
    if (!form) {
      console.error('[signup] formulário não encontrado');
      return;
    }

    const cnpj = $('#cnpj');
    const cep = $('#cep');
    const telEmp = $('#telefone_empresa');
    const tel = $('#telefone');
    const uf = $('#estado');

    if (cnpj) cnpj.addEventListener('input', () => { cnpj.value = maskCnpj(cnpj.value); });
    if (cep) cep.addEventListener('input', () => { cep.value = maskCep(cep.value); });
    if (telEmp) telEmp.addEventListener('input', () => { telEmp.value = maskPhone(telEmp.value); });
    if (tel) tel.addEventListener('input', () => { tel.value = maskPhone(tel.value); });
    if (uf) uf.addEventListener('input', () => { uf.value = present(uf.value).toUpperCase().slice(0, 2); });

    $$('.nexttab').forEach((el) => {
      el.addEventListener('click', (e) => {
        clearError();
        const activePane = document.querySelector('.tab-pane.active');
        form.classList.add('was-validated');
        if (!validatePane(activePane)) return;
        const next = e.currentTarget.getAttribute('data-nexttab');
        if (next) goTo(next);
      });
    });

    $$('.previestab').forEach((el) => {
      el.addEventListener('click', (e) => {
        clearError();
        const prev = e.currentTarget.getAttribute('data-previous');
        if (prev) goTo(prev);
      });
    });

    $$('[data-toggle="ver-senha"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const targetId = btn.getAttribute('data-target');
        const input = targetId ? document.getElementById(targetId) : btn.previousElementSibling;
        if (!input) return;
        input.type = input.type === 'password' ? 'text' : 'password';
        const i = btn.querySelector('i');
        if (i) {
          i.classList.toggle('ri-eye-off-fill');
          i.classList.toggle('ri-eye-fill');
        }
      });
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      clearError();

      const acessoPane = document.getElementById('pane-acesso');
      const empresaPane = document.getElementById('pane-empresa');
      const respPane = document.getElementById('pane-responsavel');

      form.classList.add('was-validated');
      let valid = validatePane(acessoPane) && validatePane(empresaPane) && validatePane(respPane);

      const termos = $('#termos');
      const termosError = $('#termosError');
      if (termos && !termos.checked) {
        valid = false;
        if (termosError) termosError.style.setProperty('display', 'block', 'important');
      } else if (termosError) {
        termosError.style.setProperty('display', 'none', 'important');
      }

      if (!valid) {
        if (!validatePane(empresaPane)) goTo('tab-empresa');
        else if (!validatePane(respPane)) goTo('tab-responsavel');
        else goTo('tab-acesso');
        return;
      }

      const fantasia = present($('#nome_fantasia')?.value);
      const senha = $('#senha')?.value || '';

      const payload = {
        email: present($('#email')?.value),
        username: present($('#username')?.value),
        password: senha,
        nome: present($('#nome')?.value),
        sobrenome: present($('#sobrenome')?.value),
        contato: present($('#telefone')?.value),
        sub_base: fantasia,
        nome_fantasia: fantasia,
        razao_social: present($('#razao_social')?.value),
        cnpj: digits($('#cnpj')?.value),
        telefone_empresa: present($('#telefone_empresa')?.value),
        cep: digits($('#cep')?.value),
        rua: present($('#rua')?.value),
        numero: present($('#numero')?.value),
        complemento: present($('#complemento')?.value) || null,
        bairro: present($('#bairro')?.value),
        cidade: present($('#cidade')?.value),
        estado: present($('#estado')?.value).toUpperCase(),
      };

      const btn = $('#btn-submit');

      try {
        disableBtn(btn, true);

        const res = await fetch(API_SIGNUP, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const txt = await res.text().catch(() => '');
          throw new Error(parseApiError(txt, res.status));
        }

        const q = new URLSearchParams({
          email: payload.email,
          username: payload.username,
        }).toString();
        window.location.href = 'auth-signin-tracking-v2.html?' + q;
      } catch (err) {
        console.error('[signup] erro', err);
        showError(err?.message || 'Erro inesperado ao criar a conta.');
        disableBtn(btn, false);
        goTo('tab-acesso');
      }
    });
  });
})();
