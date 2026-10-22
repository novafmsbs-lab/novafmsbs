/* Nova FM 87,5 — páginas internas (Anuncie, Privacidade). Sem player: o áudio fica na página inicial. */
(() => {
  'use strict';
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const urlSegura = (u) => { u = String(u || '').trim(); if (/^(wa\.me|www\.|instagram\.com)/i.test(u)) u = 'https://' + u; return /^https?:\/\//i.test(u) ? u : ''; };
  const getJSON = (url) => fetch(url, { cache: 'no-store' }).then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });
  const PALETA = ['#FF8A1D', '#FF4D9D', '#FF4D4D', '#22C58B', '#2EA6FF', '#7A5FFF', '#FFC23D'];
  const corPorNome = (n) => { let h = 0; for (const c of norm(n)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return PALETA[h % PALETA.length]; };
  const iniciais = (nome) => {
    const p = String(nome || '').split(/\s+/).filter((w) => w && !['de', 'da', 'do', 'das', 'dos', 'e'].includes(w.toLowerCase()));
    if (p.length === 1) return p[0].length <= 3 && p[0] === p[0].toUpperCase() ? p[0] : p[0].slice(0, 2).toUpperCase();
    return p.slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  };
  const mascara = (v) => {
    const d = String(v).replace(/\D/g, '').slice(0, 11);
    if (!d) return '';
    if (d.length <= 2) return '(' + d;
    const corte = d.length === 10 ? 6 : 7;
    return '(' + d.slice(0, 2) + ') ' + d.slice(2, corte) + (d.length > corte ? '-' + d.slice(corte) : '');
  };

  const ano = $('#ano'); if (ano) ano.textContent = new Date().getFullYear();

  // WhatsApp: o comercial pode ter número próprio (campo opcional no painel); senão, usa o do estúdio.
  let numeroComercial = '554796878175';
  getJSON('/content/site.json').then((s) => {
    if (s && /^\d{12,13}$/.test(s.whatsapp_comercial || '')) numeroComercial = s.whatsapp_comercial;
    else if (s && /^\d{12,13}$/.test(s.whatsapp || '')) numeroComercial = s.whatsapp;
    if (s && /^\d{12,13}$/.test(s.whatsapp || '')) $$('[data-wa-link]').forEach((a) => { a.href = 'https://wa.me/' + s.whatsapp; });
    // Links diretos do comercial seguem o número do painel (e o texto, quando ele mudar)
    $$('[data-wa-comercial]').forEach((a) => {
      a.href = 'https://wa.me/' + numeroComercial;
      a.textContent = a.textContent.replace(/\(\d{2}\) [\d-]+/, mascara(numeroComercial.slice(2)));
    });
  }).catch(() => {});

  /* ---------- Anunciantes (lista real do painel) ---------- */
  const grade = $('#apoioGrade');
  if (grade) {
    // Anunciantes vêm do painel da plataforma; o arquivo do site fica de reserva.
    const PLATAFORMA = 'https://plataforma-radio.novafmsbs.workers.dev';
    getJSON(PLATAFORMA + '/api/r/novafm/app/anunciantes')
      .then((d) => {
        const lista = ((d && d.anunciantes) || []).map((a) => ({ nome: a.nome, link: a.link || '', logo: a.logo && a.logo.startsWith('/') ? PLATAFORMA + a.logo : a.logo || '' }));
        return lista.length ? { itens: lista } : getJSON('/content/apoiadores.json');
      })
      .catch(() => getJSON('/content/apoiadores.json'))
      .then((d) => {
      const itens = ((d && d.itens) || []).filter((i) => i && i.nome);
      if (!itens.length) return;
      grade.innerHTML = itens.map((it) => {
        const link = urlSegura(it.link), logo = urlSegura(it.logo) || (String(it.logo || '').startsWith('/') ? it.logo : '');
        const sigla = '<span class="sigla">' + (logo ? '<img src="' + esc(logo) + '" alt="" loading="lazy">' : esc(iniciais(it.nome))) + '</span>';
        const corpo = sigla + '<span class="nome">' + esc(it.nome) + '</span>';
        const st = ' style="--ac:' + corPorNome(it.nome) + '"';
        return link ? '<a class="apoio" href="' + esc(link) + '" target="_blank" rel="noopener"' + st + '>' + corpo + '</a>' : '<div class="apoio"' + st + '>' + corpo + '</div>';
      }).join('');
      $('#anunciantes').hidden = false;
    }).catch(() => {});
  }

  /* ---------- Formulário comercial: valida e envia pelo WhatsApp ---------- */
  const form = $('#formComercial');
  if (form) {
    const fone = $('#cFone');
    fone.addEventListener('input', () => { fone.value = mascara(fone.value); });
    const status = $('#cStatus');
    const erroCampo = (input, msg) => {
      input.setAttribute('aria-invalid', msg ? 'true' : 'false');
      const alvo = document.getElementById(input.getAttribute('aria-describedby'));
      if (alvo) alvo.textContent = msg || '';
      return !msg;
    };
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const nome = $('#cNome'), empresa = $('#cEmpresa'), email = $('#cEmail');
      const digitos = fone.value.replace(/\D/g, '');
      const ok = [
        erroCampo(nome, nome.value.trim().length >= 2 ? '' : 'Digite seu nome.'),
        erroCampo(empresa, empresa.value.trim().length >= 2 ? '' : 'Digite o nome da empresa.'),
        erroCampo(fone, digitos.length >= 10 && digitos.length <= 11 ? '' : 'Número incompleto — confira o DDD.'),
        erroCampo(email, !email.value.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.value.trim()) ? '' : 'Confira o e-mail.'),
      ];
      if (ok.includes(false)) {
        status.hidden = false; status.className = 'form-status largo falha';
        status.textContent = 'Confira os campos destacados.';
        const primeiro = form.querySelector('[aria-invalid="true"]'); if (primeiro) primeiro.focus();
        return;
      }
      const interesses = $$('input[name="interesse"]:checked', form).map((c) => c.value);
      const linhas = [
        'Olá, Nova FM! Quero anunciar.',
        '',
        'Nome: ' + nome.value.trim(),
        'Empresa: ' + empresa.value.trim(),
        'WhatsApp: ' + fone.value.trim(),
      ];
      if (email.value.trim()) linhas.push('E-mail: ' + email.value.trim());
      if (interesses.length) linhas.push('Interesse: ' + interesses.join(', '));
      const msg = $('#cMsg').value.trim();
      if (msg) linhas.push('', msg);
      // abre já no clique (dentro de uma promessa o Safari trataria como pop-up e bloquearia)
      const url = 'https://wa.me/' + numeroComercial + '?text=' + encodeURIComponent(linhas.join('\n'));
      window.open(url, '_blank', 'noopener');
      status.hidden = false; status.className = 'form-status largo ok';
      status.innerHTML = 'Abrimos o WhatsApp da Nova FM com a sua mensagem pronta — é só tocar em enviar. ' +
        'Se não abriu, <a href="' + esc(url) + '" target="_blank" rel="noopener" style="color:inherit;text-decoration:underline">toque aqui para abrir o WhatsApp</a>.';
    });
  }
})();
