// =========================
// Signup - TrackingSaídas
// =========================
const API_USERS = 'https://track-saidas-api.onrender.com/api/users';

// const WEBHOOK = 'https://webhook.site/e40b4630-87ed-4e21-b3ab-b6a70069a303';

function showSignupError(msg) {
  // você pode criar uma <div id="signupError" class="alert alert-danger d-none"></div> no HTML se quiser feedback visual
  console.error('[signup] ', msg || 'Erro ao criar conta.');
}

document.addEventListener('DOMContentLoaded', () => {
  console.log('[signup] init');

  // cobre ambos: novo wizard (#signup-wizard) e versão antiga (#signup-form)
  const form = document.getElementById('signup-wizard') || document.getElementById('signup-form');
  if (!form) {
    console.error('[signup] formulário de cadastro não encontrado (#signup-wizard / #signup-form)');
    return;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    e.stopPropagation();

    // IDs do wizard (com fallbacks p/ ids antigos)
    const emailEl     = document.getElementById('email')       || document.getElementById('useremail');
    const userEl      = document.getElementById('username');
    const nomeEl      = document.getElementById('nome');
    const sobrenomeEl = document.getElementById('sobrenome');
    const telEl       = document.getElementById('telefone')    || document.getElementById('contato');
    const subBaseEl   = document.getElementById('subbase');
    const senhaEl     = document.getElementById('senha')       || document.getElementById('senha-input');
    const senha2El    = document.getElementById('senha2');
    const termosEl    = document.getElementById('termos');
    const btn         = document.getElementById('btn-submit')  || document.getElementById('signup-btn');

    const email     = emailEl?.value.trim();
    const username  = userEl?.value.trim();
    const nome      = nomeEl?.value.trim();
    const sobrenome = sobrenomeEl?.value.trim();
    const contato   = telEl?.value.trim();
    const senha     = senhaEl?.value || '';
    const senha2    = senha2El?.value || '';
    const subBase   = subBaseEl?.value?.trim();
    const termosOK  = termosEl ? !!termosEl.checked : true;

    if (!email || !username || !nome || !sobrenome || !contato || !senha || !subBase) {
      showSignupError('Preencha todos os campos obrigatórios.');
      return;
    }
    if (senha2El && senha !== senha2) {
      showSignupError('As senhas não coincidem.');
      return;
    }
    //  força senha forte
    if (!/(?=.*\d)(?=.*[a-z])(?=.*[A-Z]).{8,}/.test(senha)) {
       showSignupError('A senha deve ter 8+ caracteres, maiúscula, minúscula e número.');
       return;
       }
    if (!termosOK) {
      showSignupError('Você precisa aceitar os termos.');
      return;
    }

    try {
      if (btn) btn.disabled = true;

      // Cria o usuário
      const resp = await fetch(API_USERS, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          email,
          username,
          senha,        // backend espera 'senha' (não 'password')
          nome,
          sobrenome,
          contato,      // se o seu backend usa 'telefone'/'phone', troque a chave
          subBase
        })
      });

      if (!resp.ok) {
        const errTxt = await resp.text().catch(() => '');
        showSignupError(errTxt || 'Não foi possível criar a conta.');
        if (btn) btn.disabled = false;
        return;
      }

      // Redireciona para login já com email e username
      const qs = new URLSearchParams({ email, username }).toString();
      window.location.href = 'auth-signin-tracking.html?' + qs;
    } catch (err) {
      console.error('[signup] erro de rede', err);
      showSignupError('Falha ao conectar. Tente novamente.');
      if (btn) btn.disabled = false;
    }
  });
});
