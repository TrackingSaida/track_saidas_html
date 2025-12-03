// =========================
// Signup - TrackingSaídas (Wizard Cover)
// =========================

// URL do endpoint de signup público
const API_SIGNUP = 'https://track-saidas-api.onrender.com/api/public/signup';

(function () {
  'use strict';

  // Util
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  const present = (v) => (typeof v === 'string' ? v.trim() : '');

  function senhaForteOk(s) {
    // 8+ chars, minúscula, maiúscula e número
    return /^(?=.*\d)(?=.*[a-z])(?=.*[A-Z]).{8,}$/.test(present(s));
  }

  function disableBtn(btn, loading = true) {
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

  document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('signup-wizard') || document.getElementById('signup-form');
    if (!form) {
      console.error('[signup] formulário de cadastro não encontrado (#signup-wizard / #signup-form)');
      return;
    }

    // ------ Progress / Tabs ------
    const progressBar = $('#progress-bar .progress-bar');
    const tabs = $$('.progress-bar-tab .nav-link');

    function goTo(tabId) {
      const btn = document.getElementById(tabId);
      if (!btn) return;
      new bootstrap.Tab(btn).show();
      if (progressBar && tabs.length) {
        const idx = tabs.findIndex((t) => t.id === tabId);
        const pct = Math.round(((idx + 1) / tabs.length) * 100);
        progressBar.style.width = pct + '%';
        progressBar.setAttribute('aria-valuenow', String(pct));
      }
    }

    $$('.nexttab').forEach((el) => {
      el.addEventListener('click', (e) => {
        const activePane = document.querySelector('.tab-pane.active');
        const inputs = activePane ? activePane.querySelectorAll('input,select,textarea') : [];
        let valid = true;
        inputs.forEach((inp) => {
          // confirmar senha em tempo de clique
          if (inp.id === 'senha2') {
            const s1 = $('#senha')?.value || '';
            inp.setCustomValidity(inp.value === s1 ? '' : 'Mismatch');
          }
          // força senha forte no passo da senha
          if (inp.id === 'senha') {
            inp.setCustomValidity(senhaForteOk(inp.value) ? '' : 'Weak');
          }
          if (!inp.checkValidity()) valid = false;
        });
        form.classList.add('was-validated');
        if (!valid) return;
        const next = e.currentTarget.getAttribute('data-nexttab');
        if (next) goTo(next);
      });
    });

    $$('.previestab').forEach((el) => {
      el.addEventListener('click', (e) => {
        const prev = e.currentTarget.getAttribute('data-previous');
        if (prev) goTo(prev);
      });
    });

    // ------ Toggle ver senha ------
    $$('[data-toggle="ver-senha"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const input = btn.previousElementSibling;
        if (!input) return;
        input.type = input.type === 'password' ? 'text' : 'password';
        const i = btn.querySelector('i');
        if (i) {
          i.classList.toggle('ri-eye-off-fill');
          i.classList.toggle('ri-eye-fill');
        }
      });
    });

    // ------ Submit final -> POST /public/signup ------
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      e.stopPropagation();

      // valida apenas o último passo (sub-base)
      const finalPane = document.getElementById('pane-subbase') || document.querySelector('.tab-pane.active');
      const inputs = finalPane ? finalPane.querySelectorAll('input[required],select[required],textarea[required]') : [];
      let valid = true;

      inputs.forEach((inp) => {
        if (!inp.checkValidity()) valid = false;
      });

      // validações globais de senha
      const senha = $('#senha')?.value || '';
      const senha2 = $('#senha2')?.value || '';

      if (!senhaForteOk(senha)) valid = false;
      if (senha2 && senha !== senha2) valid = false;

      form.classList.add('was-validated');
      if (!valid) return;

      // coleta dos dados
      const payload = {
        email:      present($('#email')?.value),
        username:   present($('#username')?.value),
        password:   senha,
        nome:       present($('#nome')?.value),
        sobrenome:  present($('#sobrenome')?.value),
        contato:    present($('#telefone')?.value),
        sub_base:   present($('#subbase')?.value),
      };

      // campo termos (se existir)
      const termosOK = $('#termos') ? !!$('#termos').checked : true;
      if (!termosOK) {
        alert('Você precisa aceitar os termos.');
        return;
      }

      // campos obrigatórios
      if (!payload.email || !payload.username || !payload.nome || !payload.sobrenome ||
          !payload.contato || !payload.password || !payload.sub_base) {
        alert('Preencha todos os campos obrigatórios.');
        return;
      }

      const btn = $('#btn-submit') || form.querySelector('[type="submit"]');

      try {
        disableBtn(btn, true);

        const res = await fetch(API_SIGNUP, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (!res.ok) {
          const txt = await res.text().catch(() => '');
          throw new Error(txt || 'Falha ao criar conta.');
        }

        // redireciona para login já preenchido
        const q = new URLSearchParams({
          email: payload.email,
          username: payload.username
        }).toString();

        window.location.href = 'auth-signin-tracking-v2.html?' + q;

      } catch (err) {
        console.error('[signup] erro', err);
        alert(err?.message || 'Erro inesperado ao criar a conta.');
        disableBtn(btn, false);
      }
    });
  });
})();
