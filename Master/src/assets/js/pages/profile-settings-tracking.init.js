/* profile-settings-tracking.init.js
 * Perfil do usuário sem upload de imagem, sub-base somente leitura,
 * alteração de senha opcional.
 * Compatível com minificação (sem optional chaining no LHS).
 */
(function () {
  'use strict';

  // Helpers
  function $(sel) { return document.querySelector(sel); }
  function apiBase() {
    var base = (window.TRACK_API_URL || '').replace(/\/+$/,'');
    return base || '';
  }
  function toast(msg){ try{ alert(msg); } catch(_) { console.log(msg); } }

  // ============== INIT (UI) ==============
  document.addEventListener('DOMContentLoaded', function () {
    // tooltips
    var tipNodes = document.querySelectorAll('[data-bs-toggle="tooltip"]');
    tipNodes.forEach(function (el) { new bootstrap.Tooltip(el); });

    // alternar visibilidade das senhas
    document.querySelectorAll('[data-toggle-pass]').forEach(function(btn){
      btn.addEventListener('click', function(){
        var targetSel = btn.getAttribute('data-toggle-pass');
        var input = document.querySelector(targetSel);
        if (!input) return;
        input.type = input.type === 'password' ? 'text' : 'password';
        btn.classList.toggle('active');
      });
    });

    bindProfileSave();
    bindPasswordChange();
    loadMe();
  });

  // ============== LOAD USER ==============
  async function loadMe(){
    try{
      var base = apiBase();
      if(!base) return;
      var r = await fetch(base + '/users/me', { credentials:'include' });
      if(!r.ok) return;
      var u = await r.json();

      var elNome = $('#nome');            if (elNome) elNome.value = u.nome || '';
      var elSobrenome = $('#sobrenome');  if (elSobrenome) elSobrenome.value = u.sobrenome || '';
      var elTel = $('#telefone');         if (elTel) elTel.value = u.contato || u.telefone || '';
      var elEmail = $('#emailInput');     if (elEmail) elEmail.value = u.email || '';
      var elSub = $('#subbase');          if (elSub) elSub.value = u.subbase || u.base || '';

      var profileName = $('#profileName');
      if (profileName) {
        var full = [u.nome, u.sobrenome].filter(Boolean).join(' ');
        profileName.textContent = full || 'Nome do Usuário';
      }
      var profileSubtitle = $('#profileSubtitle');
      if (profileSubtitle) {
        profileSubtitle.textContent = u.username ? ('@' + u.username) : '';
      }
    }catch(e){ console.warn('loadMe:', e); }
  }

  // ============== SAVE PROFILE ==============
  function bindProfileSave(){
    var form = $('#profile-form');
    if(!form) return;

    form.addEventListener('submit', async function(ev){
      ev.preventDefault();
      try{
        var base = apiBase(); if(!base) return;

        // monta payload somente com campos existentes no DOM
        var payload = {};
        var fNome = $('#nome');        if (fNome) payload.nome = fNome.value.trim();
        var fSob = $('#sobrenome');    if (fSob) payload.sobrenome = fSob.value.trim();
        var fTel = $('#telefone');     if (fTel) payload.telefone = fTel.value.trim();
        var fEmail = $('#emailInput'); if (fEmail) payload.email = fEmail.value.trim();
        // sub-base é somente leitura no UI; não enviar alteração se não existir

        var r = await fetch(base + '/users/me', {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type':'application/json' },
          body: JSON.stringify(payload)
        });
        if(!r.ok){
          var t = ''; try{ t = await r.text(); }catch(_){}
          return toast(t || 'Falha ao salvar.');
        }
        toast('Alterações salvas com sucesso!');
        loadMe();
      }catch(err){
        console.error(err); toast('Erro ao salvar.');
      }
    });
  }

  // ============== CHANGE PASSWORD ==============
  function bindPasswordChange(){
    var form = $('#password-form');
    if(!form) return;

    form.addEventListener('submit', async function(ev){
      ev.preventDefault();
      try{
        var base = apiBase(); if(!base) return;

        var cur = $('#currentPassword');
        var n1 = $('#newPassword');
        var n2 = $('#confirmPassword');

        var currentPassword = cur ? cur.value : '';
        var newPassword = n1 ? n1.value : '';
        var confirmPassword = n2 ? n2.value : '';

        if (!newPassword || newPassword.length < 6) {
          return toast('A nova senha deve ter pelo menos 6 caracteres.');
        }
        if (newPassword !== confirmPassword) {
          return toast('As senhas não conferem.');
        }

        var r = await fetch(base + '/users/password', {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type':'application/json' },
          body: JSON.stringify({
            currentPassword: currentPassword,
            newPassword: newPassword
          })
        });
        if(!r.ok){
          var t = ''; try{ t = await r.text(); }catch(_){}
          return toast(t || 'Não foi possível alterar a senha.');
        }
        toast('Senha alterada com sucesso!');
        form.reset();
      }catch(err){
        console.error(err); toast('Erro ao alterar senha.');
      }
    });
  }
})();