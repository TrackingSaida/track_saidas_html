// =========================
// Signup - TrackingSaídas
// =========================
const API_USERS = 'https://track-saidas-api.onrender.com/api/users';

function showSignupError(msg) {
  // você pode criar uma <div id="signupError" class="alert alert-danger d-none"></div> no HTML se quiser feedback visual
  console.error('[signup] ', msg || 'Erro ao criar conta.');
}

document.addEventListener('DOMContentLoaded', () => {
  console.log('[signup] init');

  const form = document.getElementById('signup-form'); // existe no HTML de signup
  if (!form) {
    console.error('[signup] #signup-form não encontrado');
    return;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    e.stopPropagation();

    const emailEl = document.getElementById('useremail');
    const userEl = document.getElementById('username');
    const contatoEl = document.getElementById('contato');
    const senhaEl = document.getElementById('senha-input');
    const btn = document.getElementById('signup-btn');

    const email = emailEl?.value.trim();
    const username = userEl?.value.trim();
    const contato = contatoEl?.value.trim();
    const password = senhaEl?.value;

    if (!email || !username || !contato || !password) {
      showSignupError('Preencha todos os campos obrigatórios.');
      return;
    }

    try {
      btn && (btn.disabled = true);

      // 1) Cria o usuário
      const resp = await fetch(API_USERS, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          username,
          contato,
          password
        })
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        showSignupError(err.detail || 'Não foi possível criar a conta.');
        btn && (btn.disabled = false);
        return;
      }

      // 2) Redireciona para o login já levando ?email=...
      window.location.href = 'auth-signin-tracking.html?email=' + encodeURIComponent(email);
    } catch (err) {
      console.error('[signup] erro de rede', err);
      showSignupError('Falha ao conectar. Tente novamente.');
      btn && (btn.disabled = false);
    }
  });
});
