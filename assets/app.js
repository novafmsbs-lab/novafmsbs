/* Nova FM 87,5 — app do site */
(() => {
  'use strict';

  /* ================= Configuração ================= */
  const STREAM = 'https://radio.novafmsbs.com.br/stream';
  const NOWPLAYING = '/api/nowplaying';
  const NOTICIAS = '/api/noticias';
  const PROMO_API = 'https://novafm-sorteador.novafmsbs.workers.dev';
  const SITE = 'https://novafmsbs.com.br/';
  const NOME = 'Nova FM 87,5';
  const CORES = { laranja: '#FF8A1D', rosa: '#FF4D9D', vermelho: '#FF4D4D', verde: '#22C58B', azul: '#2EA6FF', roxo: '#7A5FFF', amarelo: '#FFC23D' };
  const PALETA = Object.values(CORES);
  const DIAS = ['semana', 'sabado', 'domingo'];

  /* ================= Utilitários ================= */
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* modo privado */ } },
  };
  const reduzMovimento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const iOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  function getJSON(url, ms = 8000, opts = {}) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    return fetch(url, Object.assign({ cache: 'no-store' }, opts, { signal: ctrl.signal }))
      .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .finally(() => clearTimeout(t));
  }

  function urlSegura(u) {
    u = String(u || '').trim();
    if (!u) return '';
    if (/^(wa\.me|api\.whatsapp|www\.|instagram\.com)/i.test(u)) u = 'https://' + u;
    if (u.startsWith('/') && !u.startsWith('//')) return u;
    return /^https?:\/\//i.test(u) ? u : '';
  }

  let toastTimer = 0;
  function toast(msg, ms = 2600) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('on'), ms);
  }

  function iniciais(nome, max = 2) {
    const ignora = ['de', 'da', 'do', 'das', 'dos', 'e'];
    const p = String(nome || '').split(/\s+/).filter((w) => w && !ignora.includes(w.toLowerCase()));
    if (p.length === 1) return p[0].length <= 3 && p[0] === p[0].toUpperCase() ? p[0] : p[0].slice(0, 2).toUpperCase();
    return p.slice(0, max).map((w) => w[0]).join('').toUpperCase();
  }
  function corPorNome(nome) {
    let h = 0;
    for (const c of norm(nome)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    return PALETA[h % PALETA.length];
  }
  function wa(numero, texto) { return 'https://wa.me/' + numero + (texto ? '?text=' + encodeURIComponent(texto) : ''); }

  /* ================= Horário de São Bento do Sul ================= */
  const fmtSP = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  function agoraSP() {
    const p = {};
    fmtSP.formatToParts(new Date()).forEach((x) => { p[x.type] = x.value; });
    const dia = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[p.weekday];
    return { dia, min: (+p.hour % 24) * 60 + +p.minute };
  }
  const chaveDia = (d) => (d === 0 ? 'domingo' : d === 6 ? 'sabado' : 'semana');
  const paraMin = (hhmm) => { const [h, m] = String(hhmm || '0:0').split(':'); return (+h || 0) * 60 + (+m || 0); };
  const hora = (hhmm) => { const [h, m] = String(hhmm).split(':'); const hh = String(+h % 24).padStart(2, '0'); return +m ? hh + 'h' + m : hh + 'h'; };
  const faixa = (s) => hora(s.inicio) + '–' + hora(s.fim);
  const horaAgora = () => { const d = new Date(); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };

  /* ================= Estado / dados ================= */
  const dados = {
    site: { whatsapp: '554736335401', portal_noticias: 'https://portalnovafmsbs.com.br', redes: [{ rede: 'instagram', usuario: 'novafm_sbs', link: 'https://instagram.com/novafm_sbs' }] },
    grade: { semana: [], sabado: [], domingo: [] },
    locutores: [],
  };
  const porNome = new Map();

  function locutor(nome) { return porNome.get(norm(nome)) || null; }
  function corDe(l) { return (l && CORES[l.cor]) || (l ? corPorNome(l.nome) : CORES.laranja); }
  function corPrograma(s) { const l = s && (s.apresentadores || []).map(locutor).find(Boolean); return l ? corDe(l) : CORES.laranja; }
  function nomesJuntos(lista) {
    const n = (lista || []).filter(Boolean);
    return n.length <= 1 ? (n[0] || '') : n.slice(0, -1).join(', ') + ' e ' + n[n.length - 1];
  }
  function avatar(nome, extraClasse = '') {
    const l = locutor(nome);
    const cor = l ? corDe(l) : corPorNome(nome);
    // locutor cadastrado sem foto: usa a logo da Nova até a foto ser enviada pelo painel
    const foto = l && (urlSegura(l.foto) || '/img/locutores/sem-foto.webp');
    const dentro = foto ? '<img src="' + esc(foto) + '" alt="" loading="lazy" width="112" height="112">' : esc(iniciais(nome));
    return '<span class="avatar ' + extraClasse + '" style="--ac:' + cor + '" title="' + esc(nome) + '">' + dentro + '</span>';
  }
  function avatarLogo() { return '<span class="avatar logo"><img src="/img/logo-mark.webp" alt="" width="64" height="64"></span>'; }

  function programaAgora() {
    const { dia, min } = agoraSP();
    const lista = dados.grade[chaveDia(dia)] || [];
    const atual = lista.find((s) => min >= paraMin(s.inicio) && min < paraMin(s.fim)) || null;
    let proximo = null;
    if (atual) {
      const i = lista.indexOf(atual);
      proximo = lista[i + 1] || (dados.grade[chaveDia((dia + 1) % 7)] || [])[0] || null;
    }
    return { atual, proximo, dia, min };
  }

  /* ================= Player ================= */
  let audio = $('#stream');
  let tocando = false;
  let conectando = false;
  let errosSeguidos = 0;
  // Web Audio deixa o equalizador seguir a música de verdade. No iOS fica de fora: lá ele corta o som com a tela bloqueada.
  let actx = null, analisador = null, freq = null, usaAnalise = !iOS && !!(window.AudioContext || window.webkitAudioContext);

  function estadoPlay() {
    document.body.classList.toggle('tocando-on', tocando);
    const rotulo = conectando ? 'Conectando…' : tocando ? 'Pausar' : 'Ouvir agora';
    $$('[data-play-label]').forEach((e) => { e.textContent = rotulo; });
    $$('[data-play]').forEach((b) => b.setAttribute('aria-label', tocando ? 'Pausar a rádio' : 'Ouvir ao vivo'));
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = tocando ? 'playing' : 'paused';
    atualizarTitulo();
  }

  function montarAnalise() {
    if (actx || !usaAnalise) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      actx = new AC();
      const fonte = actx.createMediaElementSource(audio);
      analisador = actx.createAnalyser();
      analisador.fftSize = 128;
      analisador.smoothingTimeConstant = 0.8;
      freq = new Uint8Array(analisador.frequencyBinCount);
      fonte.connect(analisador);
      analisador.connect(actx.destination);
    } catch (e) { usaAnalise = false; actx = null; analisador = null; }
  }

  function tocar() {
    tocando = true; conectando = true; travado = 0;
    if (usaAnalise) { audio.crossOrigin = 'anonymous'; montarAnalise(); if (actx && actx.state === 'suspended') actx.resume(); }
    audio.src = STREAM + '?t=' + Date.now(); // sempre pega o ao vivo, não o trecho antigo do buffer
    const p = audio.play();
    if (p && p.catch) p.catch((err) => {
      if (err && err.name === 'NotAllowedError') { tocando = false; conectando = false; estadoPlay(); toast('Toque no play para ouvir a Nova'); }
    });
    estadoPlay();
  }

  function pausar() {
    tocando = false; conectando = false;
    audio.pause();
    audio.removeAttribute('src'); // encerra a conexão: não gasta dados com a rádio pausada
    audio.load();
    estadoPlay();
  }

  const alternar = () => (tocando ? pausar() : tocar());
  document.addEventListener('click', (e) => { const b = e.target.closest('[data-play]'); if (b) { e.preventDefault(); alternar(); } });

  function ligarEventos(el) {
    el.addEventListener('playing', () => { conectando = false; errosSeguidos = 0; estadoPlay(); talvezAnimar(); });
    el.addEventListener('ended', () => { if (tocando) reconectar(); });
    el.addEventListener('error', () => {
      if (!tocando || !el.getAttribute('src')) return;
      // Duas falhas seguidas com o equalizador real: passa para um player simples (sem CORS) e segue tocando
      if (++errosSeguidos >= 2 && usaAnalise) { usaAnalise = false; trocarElemento(); tocar(); return; }
      setTimeout(reconectar, 1500);
    });
  }
  function trocarElemento() {
    const novo = new Audio();
    novo.preload = 'none';
    novo.volume = audio.volume; novo.muted = audio.muted;
    try { audio.pause(); audio.removeAttribute('src'); audio.load(); } catch (e) { /* ignora */ }
    actx = null; analisador = null;
    audio = novo;
    ligarEventos(audio);
  }
  ligarEventos(audio);

  /* Reconexão: só age se o áudio realmente travar por ~8s */
  let ultimoTempo = -1, travado = 0, reconectando = false;
  function reconectar() {
    if (!tocando || reconectando) return;
    reconectando = true; travado = 0;
    audio.src = STREAM + '?r=' + Date.now();
    audio.play().catch(() => {});
    setTimeout(() => { reconectando = false; }, 5000);
  }
  setInterval(() => {
    if (!tocando) { travado = 0; return; }
    if (reconectando) return;
    if (audio.readyState < 2 || audio.currentTime === ultimoTempo) { if (++travado >= 4) reconectar(); }
    else travado = 0;
    ultimoTempo = audio.currentTime;
  }, 2000);

  /* Volume e mudo (o iOS não permite volume pelo site) */
  (() => {
    const vol = $('#volume'), mudo = $('#mudo');
    if (iOS) vol.hidden = true;
    const salvo = store.get('nova_volume', 0.8);
    audio.volume = Math.min(1, Math.max(0, salvo));
    vol.value = Math.round(audio.volume * 100);
    const pinta = () => mudo.classList.toggle('mudo', audio.muted || audio.volume === 0);
    vol.addEventListener('input', () => { audio.volume = vol.value / 100; audio.muted = false; store.set('nova_volume', audio.volume); pinta(); });
    mudo.addEventListener('click', () => {
      audio.muted = !audio.muted;
      if (!audio.muted && audio.volume === 0) { audio.volume = 0.8; vol.value = 80; }
      mudo.setAttribute('aria-label', audio.muted ? 'Ativar som' : 'Silenciar');
      pinta();
    });
    pinta();
  })();

  /* Controles na tela de bloqueio */
  if ('mediaSession' in navigator) {
    try {
      navigator.mediaSession.setActionHandler('play', () => { if (!tocando) tocar(); });
      navigator.mediaSession.setActionHandler('pause', () => { if (tocando) pausar(); });
      navigator.mediaSession.setActionHandler('stop', () => { if (tocando) pausar(); });
    } catch (e) { /* navegador sem suporte */ }
  }
  function metaSessao(titulo, artista) {
    if (!('mediaSession' in navigator) || !window.MediaMetadata) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: titulo || NOME, artist: artista || 'Você ouve, você gosta!', album: NOME,
        artwork: [{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }, { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' }],
      });
    } catch (e) { /* ignora */ }
  }

  /* Equalizador: usa o áudio real quando possível; anima só com a rádio tocando e a aba visível */
  const eq = $('#eq');
  const NBARRAS = 32;
  eq.innerHTML = '<i></i>'.repeat(NBARRAS);
  const barras = $$('i', eq);
  const suave = new Array(NBARRAS).fill(0);
  let quadro = 0, rodando = false;
  function repouso() { barras.forEach((b, i) => { b.style.height = (10 + 8 * Math.abs(Math.sin(i * 0.7))) + '%'; }); }
  function animar() {
    if (!tocando || document.hidden || reduzMovimento) { rodando = false; repouso(); return; }
    rodando = true; quadro++;
    let real = false;
    if (analisador && !audio.paused) {
      analisador.getByteFrequencyData(freq);
      let soma = 0; for (let k = 0; k < freq.length; k++) soma += freq[k];
      if (soma > 0) {
        real = true;
        for (let i = 0; i < NBARRAS; i++) {
          const idx = Math.min(freq.length - 1, Math.floor(Math.pow(i / NBARRAS, 1.4) * freq.length * 0.7) + 1);
          suave[i] = suave[i] * 0.5 + (freq[idx] / 255) * 0.5;
          barras[i].style.height = (8 + suave[i] * 92).toFixed(1) + '%';
        }
      }
    }
    if (!real && quadro % 3 === 0) {
      barras.forEach((b, i) => { b.style.height = (14 + (Math.sin((quadro + i * 9) / 9) * 0.5 + 0.5) * 55 + Math.random() * 18).toFixed(1) + '%'; });
    }
    requestAnimationFrame(animar);
  }
  repouso();
  function talvezAnimar() { if (tocando && !rodando && !document.hidden) requestAnimationFrame(animar); }
  document.addEventListener('visibilitychange', () => { talvezAnimar(); if (!document.hidden) buscarTocando(); });

  /* ================= Tocando agora ================= */
  let musicaAtual = null; // {t, a, h}
  let historico = store.get('nova_historico', []).filter((x) => x && x.t && Date.now() - (x.ts || 0) < 3 * 3600e3);

  function renderHistorico() {
    const ol = $('#historico');
    const vazio = !historico.length;
    ol.closest('.historico').hidden = vazio; // só aparece quando já tocou alguma música
    $('.hero-baixo').classList.toggle('so-no-ar', vazio);
    if (vazio) return;
    ol.innerHTML = historico.slice(0, 4).map((m) =>
      '<li><span class="hora">' + esc(m.h) + '</span><span class="musica"><b>' + esc(m.t) + '</b>' + (m.a ? '<span>' + esc(m.a) + '</span>' : '') + '</span></li>').join('');
  }

  function mostrar(tag, titulo, artista) {
    $$('[data-np-tag]').forEach((e) => { e.textContent = tag; });
    $$('[data-np-titulo]').forEach((e) => { e.textContent = titulo; });
    $$('[data-np-artista]').forEach((e) => { e.textContent = artista; });
    metaSessao(titulo, artista);
    atualizarTitulo();
  }
  function atualizarTitulo() {
    document.title = tocando && musicaAtual ? '▶ ' + musicaAtual.t + ' — ' + NOME : NOME + ' — Você ouve, você gosta! | São Bento do Sul';
  }

  function modoPrograma() {
    const { atual } = programaAgora();
    const quem = atual && nomesJuntos(atual.apresentadores);
    mostrar('Você está ouvindo', atual ? atual.programa : NOME, quem ? 'com ' + quem : (atual && atual.descricao) || 'Você ouve, você gosta!');
  }

  function aplicarTocando(artista, titulo) {
    titulo = (titulo || '').trim(); artista = (artista || '').trim();
    if (!titulo) {
      if (musicaAtual) { arquivar(musicaAtual); musicaAtual = null; }
      modoPrograma();
      return;
    }
    if (!musicaAtual || musicaAtual.t !== titulo || musicaAtual.a !== artista) {
      if (musicaAtual) arquivar(musicaAtual);
      musicaAtual = { t: titulo, a: artista, h: horaAgora(), ts: Date.now() };
    }
    mostrar('Tocando agora', titulo, artista || NOME);
  }
  function arquivar(m) {
    if (historico[0] && historico[0].t === m.t && historico[0].a === m.a) return;
    historico.unshift(m);
    historico = historico.slice(0, 6);
    store.set('nova_historico', historico);
    renderHistorico();
  }

  let buscando = false;
  function buscarTocando() {
    if (buscando || (document.hidden && !tocando)) return;
    buscando = true;
    getJSON(NOWPLAYING, 10000)
      .then((d) => { const s = (d && d.now_playing && d.now_playing.song) || {}; aplicarTocando(s.artist, s.title); })
      .catch(() => { if (!musicaAtual) modoPrograma(); })
      .finally(() => { buscando = false; });
  }

  /* ================= Programação ================= */
  let abaAtiva = null, chaveAtual = '';

  function renderGrade(dia) {
    abaAtiva = dia;
    $$('.abas button').forEach((b) => { const on = b.dataset.dia === dia; b.setAttribute('aria-selected', on); b.tabIndex = on ? 0 : -1; });
    const lista = dados.grade[dia] || [];
    const ag = agoraSP();
    const hoje = chaveDia(ag.dia) === dia;
    if (!lista.length) { $('#grade').innerHTML = '<li><span class="p"><span>Programação indisponível no momento.</span></span></li>'; return; }
    $('#grade').innerHTML = lista.map((s) => {
      const ini = paraMin(s.inicio), fim = paraMin(s.fim);
      const agora = hoje && ag.min >= ini && ag.min < fim;
      const passou = hoje && ag.min >= fim;
      const quem = nomesJuntos(s.apresentadores);
      const lado = agora ? '<span class="tag-agora">No ar</span>'
        : (s.apresentadores || []).length ? '<span class="rostos">' + s.apresentadores.map((n) => avatar(n)).join('') + '</span>' : '';
      return '<li class="' + (agora ? 'agora' : passou ? 'passou' : '') + '" style="--ac:' + corPrograma(s) + '">' +
        '<span class="h">' + faixa(s) + '</span>' +
        '<div class="p"><b>' + esc(s.programa) + '</b><span>' + (quem ? '<span class="quem">' + esc(quem) + '</span> · ' : '') + esc(s.descricao || '') + '</span></div>' +
        (lado ? '<div class="lado">' + lado + '</div>' : '') + '</li>';
    }).join('');
  }

  $$('.abas button').forEach((b, i, todos) => {
    b.addEventListener('click', () => renderGrade(b.dataset.dia));
    b.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const prox = todos[(i + (e.key === 'ArrowRight' ? 1 : todos.length - 1)) % todos.length];
      prox.focus(); prox.click();
    });
  });

  function renderNoAr() {
    const { atual, proximo, min } = programaAgora();
    const numero = dados.site.whatsapp;
    if (!atual) return;
    const cor = corPrograma(atual);
    const quem = atual.apresentadores || [];
    $('#noAr').style.setProperty('--ac', cor);
    const primeiro = quem.find((n) => locutor(n)) || quem[0];
    $('#noArAvatar').innerHTML = primeiro ? avatar(primeiro) : avatarLogo();
    $('#noArPrograma').textContent = atual.programa;
    $('#noArApresentador').textContent = quem.length ? 'com ' + nomesJuntos(quem) : (atual.descricao || 'Programação musical');
    $('#noArHorario').textContent = faixa(atual);
    const ini = paraMin(atual.inicio), fim = paraMin(atual.fim);
    $('#noArBarra').style.width = Math.max(2, Math.min(100, ((min - ini) / (fim - ini)) * 100)) + '%';
    $('#aSeguir').textContent = proximo ? 'A seguir: ' + proximo.programa + ' · ' + hora(proximo.inicio) : '';
    $('#recado').href = wa(numero, 'Olá, estúdio da Nova FM! Estou ouvindo o ' + atual.programa + ' pelo site e quero mandar um recado: ');
    $('#pedirMusica').href = wa(numero, 'Olá, Nova FM! Quero pedir uma música no ' + atual.programa + ': ');
  }

  /* ================= Locutores ================= */
  function rotuloDias(dias) {
    const k = dias.join(',');
    return { 'semana,sabado,domingo': 'Todos os dias', 'semana,sabado': 'Seg a Sáb', semana: 'Seg a Sex', sabado: 'Sáb', domingo: 'Dom', 'sabado,domingo': 'Sáb e Dom', 'semana,domingo': 'Seg a Sex e Dom' }[k] || '';
  }
  function programasDe(nome) {
    const k = norm(nome), mapa = new Map();
    DIAS.forEach((dia) => (dados.grade[dia] || []).forEach((s) => {
      if (!(s.apresentadores || []).some((n) => norm(n) === k)) return;
      const chave = s.programa + '|' + s.inicio + '|' + s.fim;
      if (!mapa.has(chave)) mapa.set(chave, { s, dias: [] });
      mapa.get(chave).dias.push(dia);
    }));
    return Array.from(mapa.values()).map(({ s, dias }) => ({ programa: s.programa, quando: rotuloDias(dias) + ' · ' + faixa(s) }));
  }
  function instagramURL(v) {
    v = String(v || '').trim();
    if (!v) return '';
    if (/^https?:\/\//i.test(v)) return v;
    return 'https://instagram.com/' + v.replace(/^@/, '').replace(/^.*instagram\.com\//i, '').replace(/\/$/, '');
  }
  function renderEquipe() {
    const { atual } = programaAgora();
    const noAr = new Set(((atual && atual.apresentadores) || []).map(norm));
    $('#equipe').innerHTML = dados.locutores.filter((l) => l.mostrar !== false).map((l) => {
      const progs = programasDe(l.nome).slice(0, 3);
      const ig = instagramURL(l.instagram);
      return '<article class="locutor" style="--ac:' + corDe(l) + '">' +
        (noAr.has(norm(l.nome)) ? '<span class="tag-agora"><i></i>No ar</span>' : '') +
        avatar(l.nome) +
        '<h3>' + esc(l.nome) + '</h3>' + (l.apelido ? '<span class="apelido">“' + esc(l.apelido) + '”</span>' : '') +
        '<ul>' + (progs.length ? progs.map((p) => '<li><b>' + esc(p.programa) + '</b><br>' + esc(p.quando) + '</li>').join('') : '<li>Equipe Nova FM</li>') + '</ul>' +
        (ig ? '<div class="redes-l"><a href="' + esc(ig) + '" target="_blank" rel="noopener" aria-label="Instagram de ' + esc(l.nome) + '"><svg><use href="#i-ig"/></svg></a></div>' : '') +
        '</article>';
    }).join('');
  }

  /* Atualiza tudo que depende do horário */
  function tique() {
    const { atual } = programaAgora();
    const chave = atual ? atual.programa + atual.inicio : '';
    renderNoAr();
    if (chave !== chaveAtual) {
      chaveAtual = chave;
      renderEquipe();
      if (abaAtiva) renderGrade(abaAtiva);
      if (!musicaAtual) modoPrograma();
    }
  }

  /* ================= Compartilhar ================= */
  $('#compartilhar').addEventListener('click', () => {
    const texto = musicaAtual ? 'Tô ouvindo "' + musicaAtual.t + '"' + (musicaAtual.a ? ' (' + musicaAtual.a + ')' : '') + ' na Nova FM 87,5 🎶' : 'Ouça a Nova FM 87,5 ao vivo 🎶';
    if (navigator.share) { navigator.share({ title: NOME, text: texto, url: SITE }).catch(() => {}); return; }
    const tudo = texto + ' ' + SITE;
    (navigator.clipboard ? navigator.clipboard.writeText(tudo) : Promise.reject(new Error('sem clipboard')))
      .then(() => toast('Link copiado! É só colar no WhatsApp.'))
      .catch(() => window.open('https://wa.me/?text=' + encodeURIComponent(tudo), '_blank', 'noopener'));
  });

  /* ================= Banner de campanha ================= */
  function carregarBanner() {
    getJSON('/content/banner.json').then((b) => {
      if (!b || !b.ativo || !b.texto) return;
      if (b.fim) { const fim = new Date(b.fim); if (!isNaN(fim) && Date.now() > fim.getTime()) return; }
      const chave = 'nova_banner_fechado';
      const id = norm(b.texto) + '|' + (b.fim || '');
      if (store.get(chave, '') === id) return;
      const el = $('#campanha');
      const cor = ['gradiente', 'laranja', 'azul', 'escuro'].includes(b.cor) ? b.cor : 'gradiente';
      const link = urlSegura(b.cta_link);
      el.className = 'campanha ' + cor;
      el.innerHTML = '<span>' + esc(b.texto) + '</span>' +
        (b.cta_texto && link ? '<a href="' + esc(link) + '" target="_blank" rel="noopener">' + esc(b.cta_texto) + '</a>' : '') +
        '<button class="fechar" type="button" aria-label="Fechar aviso"><svg><use href="#i-close"/></svg></button>';
      el.hidden = false;
      $('.fechar', el).addEventListener('click', () => { el.hidden = true; store.set(chave, id); });
    }).catch(() => {});
  }

  /* ================= Notícias (portal) ================= */
  function tempoAtras(data) {
    const d = new Date(data); if (isNaN(d)) return '';
    const m = Math.round((Date.now() - d) / 60000);
    if (m < 60) return 'Há ' + Math.max(1, m) + ' min';
    const h = Math.round(m / 60); if (h < 24) return 'Há ' + h + 'h';
    const dd = Math.round(h / 24); return dd === 1 ? 'Ontem' : 'Há ' + dd + ' dias';
  }
  function carregarNoticias() {
    const portal = urlSegura(dados.site.portal_noticias) || 'https://portalnovafmsbs.com.br';
    $('#portalLink').href = portal;
    getJSON(NOTICIAS, 10000).then((d) => {
      const itens = (d && d.itens) || [];
      if (!itens.length) return;
      $('#portalLista').innerHTML = itens.slice(0, 4).map((n) => {
        const link = urlSegura(n.link) || portal;
        return '<li><a href="' + esc(link) + '" target="_blank" rel="noopener"><b>' + esc(n.titulo) + '</b><span>' + esc(tempoAtras(n.data)) + '</span></a></li>';
      }).join('');
      $('#portalUltimas').hidden = false;
      $('#portal').classList.add('com-lista');
    }).catch(() => {});
  }

  /* ================= Redes sociais ================= */
  const REDES = {
    instagram: { nome: 'Instagram', icone: 'i-ig', url: (u) => 'https://instagram.com/' + u, txt: 'Bastidores, promoções, sorteios e os locutores no dia a dia.' },
    facebook: { nome: 'Facebook', icone: 'i-fb', url: (u) => 'https://facebook.com/' + u, txt: 'Novidades, eventos e recados da Nova para a região.' },
    youtube: { nome: 'YouTube', icone: 'i-yt', url: (u) => 'https://youtube.com/@' + u, txt: 'Entrevistas, ao vivos e os melhores momentos da programação.' },
    tiktok: { nome: 'TikTok', icone: 'i-tt', url: (u) => 'https://tiktok.com/@' + u, txt: 'Os cortes mais divertidos do estúdio da Nova.' },
  };
  function renderRedes() {
    const redes = (dados.site.redes || []).filter((r) => REDES[r.rede] && r.usuario);
    if (!redes.length) return; // mantém o card do Instagram que já vem no HTML
    $('#redesLista').innerHTML = redes.map((r) => {
      const def = REDES[r.rede];
      const u = String(r.usuario).replace(/^@/, '');
      const link = urlSegura(r.link) || def.url(u);
      return '<a class="rede ' + r.rede + '" href="' + esc(link) + '" target="_blank" rel="noopener"><span class="ri"><svg><use href="#' + def.icone + '"/></svg></span>' +
        '<span class="rt"><small>' + def.nome + '</small><b>@' + esc(u) + '</b><span>' + def.txt + '</span></span>' +
        '<span class="btn btn-primario">Seguir<svg><use href="#i-arrow"/></svg></span></a>';
    }).join('');
  }

  /* ================= Apoiadores ================= */
  function cartaoApoio(it, dup) {
    const nome = typeof it === 'string' ? it : (it.nome || '');
    if (!nome) return '';
    const link = urlSegura(it.link);
    const logo = urlSegura(it.logo);
    const sigla = '<span class="sigla">' + (logo ? '<img src="' + esc(logo) + '" alt="" loading="lazy">' : esc(iniciais(nome, 2))) + '</span>';
    const corpo = sigla + '<span class="nome">' + esc(nome) + '</span>' + (link ? '<svg class="ext"><use href="#i-arrow"/></svg>' : '');
    const attrs = ' style="--ac:' + corPorNome(nome) + '"' + (dup ? ' aria-hidden="true" tabindex="-1"' : '');
    return link ? '<a class="apoio' + (dup ? ' dup' : '') + '" href="' + esc(link) + '" target="_blank" rel="noopener"' + attrs + '>' + corpo + '</a>'
      : '<div class="apoio' + (dup ? ' dup' : '') + '"' + attrs + '>' + corpo + '</div>';
  }
  function renderApoiadores(itens) {
    itens = itens.filter((i) => i && (i.nome || typeof i === 'string'));
    if (!itens.length) { $('#apoiadores').hidden = true; return; }
    const linhas = itens.length > 8 ? [itens.filter((_, i) => i % 2 === 0), itens.filter((_, i) => i % 2 === 1)] : [itens];
    $('#apoioFaixas').innerHTML = linhas.map((l, i) => {
      const html = l.map((x) => cartaoApoio(x)).join('');
      const dup = l.map((x) => cartaoApoio(x, true)).join('');
      return '<div class="faixa' + (i % 2 ? ' inversa' : '') + '" style="--dur:' + Math.max(30, l.length * 6) + 's">' + html + dup + '</div>';
    }).join('');
    $('#apoioGrade').innerHTML = itens.map((x) => cartaoApoio(x)).join('');
    const bt = $('#apoioTodos');
    bt.addEventListener('click', () => {
      const abrir = $('#apoioGrade').hidden;
      $('#apoioGrade').hidden = !abrir;
      $('#apoioFaixas').hidden = abrir;
      bt.textContent = abrir ? 'Recolher' : 'Ver todos';
      bt.setAttribute('aria-expanded', abrir);
    });
    $('#anuncie').href = wa(dados.site.whatsapp, 'Olá! Quero anunciar minha empresa na Nova FM 87,5.');
  }
  function carregarApoiadores() {
    getJSON('/content/apoiadores.json').then((d) => renderApoiadores((d && d.itens) || [])).catch(() => { $('#apoiadores').hidden = true; });
  }

  /* ================= Promoções (dentro do site) ================= */
  const dlg = $('#promo');
  const corpo = $('#promoCorpo');
  let promo = { programa: null, lista: [], ts: 0, erro: false };
  let escolhida = null;

  function carregarPromos(forcar) {
    if (!forcar && promo.ts && Date.now() - promo.ts < 60000) return Promise.resolve(promo);
    return Promise.all([getJSON(PROMO_API + '/api/agora'), getJSON(PROMO_API + '/api/promocoes')]).then(([a, p]) => {
      const programa = (a && a.programa) || null;
      const lista = ((p && p.promocoes) || []).filter((x) => x && (x.escopo === 'geral' || x.programa === programa));
      promo = { programa, lista, ts: Date.now(), erro: false };
      return promo;
    }).catch(() => { promo = { programa: null, lista: [], ts: Date.now(), erro: true }; return promo; });
  }

  function sinalizarPromos() {
    const tem = promo.lista.length > 0;
    $$('.promo-dot').forEach((d) => { d.hidden = !tem; });
    const aviso = $('#avisoPromo');
    if (!tem || dlg.open) { aviso.hidden = true; return; }
    const hoje = new Date().toISOString().slice(0, 10);
    const id = hoje + '|' + promo.lista.map((x) => x.id).join(',');
    if (store.get('nova_aviso_promo', '') === id) return;
    $('#avisoPromoNome').textContent = promo.lista.length === 1 ? promo.lista[0].nome : promo.lista.length + ' promoções abertas agora';
    aviso.hidden = false;
    const dispensar = () => { aviso.hidden = true; store.set('nova_aviso_promo', id); };
    $('#avisoPromoFechar').onclick = dispensar;
    aviso.querySelector('[data-promo-abrir]').onclick = dispensar;
  }

  function icone(nome) { return '<svg><use href="#' + nome + '"/></svg>'; }

  function telaCarregando() { corpo.innerHTML = '<div class="carregando"><i></i>Buscando promoções no ar…</div>'; }
  function telaEstado(classe, ic, titulo, texto, botao) {
    corpo.innerHTML = '<div class="estado ' + classe + '"><div class="ei">' + icone(ic) + '</div><h3>' + titulo + '</h3><p>' + texto + '</p>' + (botao || '') + '</div>';
  }
  function telaPromo() {
    if (promo.erro) {
      telaEstado('', 'i-gift', 'Promoções indisponíveis', 'O sistema de promoções não respondeu agora. Tente de novo em instantes.', '<button class="btn btn-primario" type="button" id="promoDeNovo">Tentar de novo</button>');
      $('#promoDeNovo').addEventListener('click', () => { telaCarregando(); carregarPromos(true).then(() => { sinalizarPromos(); telaPromo(); }); });
      return;
    }
    if (!promo.lista.length) {
      const prog = promo.programa;
      const texto = prog ? 'Nenhuma promoção aberta no ' + esc(prog) + ' agora. Fica ligado na Nova: quando abrir, ela aparece aqui!'
        : 'As promoções acontecem durante a programação ao vivo, das 8h às 22h. Volte mais tarde!';
      telaEstado('', 'i-gift', 'Nada rolando agora', texto, tocando ? '' : '<button class="btn btn-primario" type="button" data-play><svg class="ic-play"><use href="#i-play"/></svg><svg class="ic-pause"><use href="#i-pause"/></svg>Ouvir a Nova enquanto isso</button>');
      return;
    }
    if (promo.lista.length === 1) { escolhida = promo.lista[0]; telaFormulario(); return; }
    telaLista();
  }

  function telaLista() {
    corpo.innerHTML = '<h3 id="promoTitulo">Escolha a promoção</h3><p class="sub">Toque na que você quer participar.</p><div class="promo-lista">' +
      promo.lista.map((x, i) => '<button class="promo-item" type="button" data-i="' + i + '"><span class="pi">' + icone('i-gift') + '</span><span><b>' + esc(x.nome) + '</b>' +
        (x.premio ? '<span>' + esc(x.premio) + '</span>' : x.escopo === 'geral' ? '<span>Promoção geral da Nova</span>' : '') + '</span><svg class="seta"><use href="#i-arrow"/></svg></button>').join('') + '</div>';
    $$('.promo-item', corpo).forEach((b) => b.addEventListener('click', () => { escolhida = promo.lista[+b.dataset.i]; telaFormulario(); }));
  }

  function telaFormulario() {
    const salvo = store.get('nova_participante', null);
    corpo.innerHTML =
      '<h3 id="promoTitulo">Participe do sorteio</h3><p class="sub">Leva 10 segundos. Boa sorte!</p>' +
      '<div class="escolhida"><div><small>Concorrendo em</small><b>' + esc(escolhida.nome) + '</b>' + (escolhida.premio ? '<br><span class="sub">' + esc(escolhida.premio) + '</span>' : '') + '</div>' +
      (promo.lista.length > 1 ? '<button type="button" id="trocar">trocar</button>' : '') + '</div>' +
      '<form id="formPromo" novalidate>' +
      '<label class="campo"><span>Seu nome</span><input id="fNome" name="nome" autocomplete="name" placeholder="Como te chamam no ar" maxlength="60" required><small class="erro" id="eNome"></small></label>' +
      '<label class="campo"><span>Seu WhatsApp com DDD</span><input id="fFone" name="whatsapp" type="tel" inputmode="numeric" autocomplete="tel-national" placeholder="(47) 99999-9999" maxlength="16" required><small class="erro" id="eFone"></small></label>' +
      '<label class="check"><input type="checkbox" id="fOk"><span>Autorizo a Nova FM a usar meu nome e WhatsApp para contato sobre este sorteio.<small>Seu número só é usado para avisar se você ganhar e nunca é repassado a terceiros. Você pode pedir a remoção quando quiser (LGPD).</small></span></label>' +
      '<label class="check"><input type="checkbox" id="fLembrar"' + (salvo || !store.get('nova_nao_lembrar', false) ? ' checked' : '') + '><span>Lembrar meus dados neste aparelho</span></label>' +
      '<button class="btn btn-primario btn-enviar" type="submit" id="fEnviar" disabled>Participar</button></form>';
    const nome = $('#fNome'), fone = $('#fFone'), ok = $('#fOk'), enviar = $('#fEnviar');
    if (salvo) { nome.value = salvo.nome || ''; fone.value = mascara(salvo.fone || ''); }
    const digitos = () => fone.value.replace(/\D/g, '');
    const valida = () => { enviar.disabled = !(nome.value.trim().length >= 2 && digitos().length >= 10 && ok.checked); };
    fone.addEventListener('input', () => { fone.value = mascara(fone.value); valida(); });
    nome.addEventListener('input', valida); ok.addEventListener('change', valida);
    if ($('#trocar')) $('#trocar').addEventListener('click', telaLista);
    valida();
    if (!salvo && !('ontouchstart' in window)) nome.focus();

    $('#formPromo').addEventListener('submit', (e) => {
      e.preventDefault();
      const nomeOk = nome.value.trim().length >= 2, foneOk = digitos().length >= 10;
      nome.setAttribute('aria-invalid', !nomeOk); fone.setAttribute('aria-invalid', !foneOk);
      $('#eNome').textContent = nomeOk ? '' : 'Digite seu nome.';
      $('#eFone').textContent = foneOk ? '' : 'Número incompleto — confira o DDD.';
      if (!nomeOk || !foneOk || !ok.checked) return;
      const lembrar = $('#fLembrar').checked;
      if (lembrar) { store.set('nova_participante', { nome: nome.value.trim(), fone: digitos() }); store.set('nova_nao_lembrar', false); }
      else { try { localStorage.removeItem('nova_participante'); } catch (er) { /* ignora */ } store.set('nova_nao_lembrar', true); }
      enviar.disabled = true; enviar.textContent = 'Enviando…';
      const corpoReq = { nome: nome.value.trim(), whatsapp: digitos(), promocao_id: escolhida.id, consentimento: true };
      fetch(PROMO_API + '/api/participar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpoReq) })
        .then((r) => r.json().catch(() => ({})).then((j) => { if (!r.ok) throw new Error(j.erro || 'Não foi possível enviar agora.'); return j; }))
        .then((j) => {
          telaEstado('ok', 'i-check', 'Você está concorrendo!', esc(j.mensagem || 'Sua participação em ' + escolhida.nome + ' foi registrada.') + '<br><b>' + esc(corpoReq.nome) + '</b>, boa sorte! 🍀',
            promo.lista.length > 1 ? '<button class="btn" type="button" id="outra">Participar de outra</button>' : '<button class="btn" type="button" data-promo-fechar>Voltar para a rádio</button>');
          if ($('#outra')) $('#outra').addEventListener('click', telaLista);
        })
        .catch((er) => {
          enviar.disabled = false; enviar.textContent = 'Participar';
          $('#eFone').textContent = er.message === 'Failed to fetch' ? 'Sem conexão. Tente de novo.' : er.message;
        });
    });
  }
  function mascara(v) {
    const d = String(v).replace(/\D/g, '').slice(0, 11);
    if (!d) return '';
    if (d.length <= 2) return '(' + d;
    const corte = d.length === 10 ? 6 : 7; // fixo (47) 3633-5401 · celular (47) 99999-9999
    return '(' + d.slice(0, 2) + ') ' + d.slice(2, corte) + (d.length > corte ? '-' + d.slice(corte) : '');
  }

  function abrirPromo() {
    if (dlg.open) return;
    $('#avisoPromo').hidden = true;
    fecharMenu();
    dlg.showModal();
    if (!(history.state && history.state.promo)) history.pushState({ promo: 1 }, '', '#promocoes');
    telaCarregando();
    carregarPromos(true).then(() => { sinalizarPromos(); telaPromo(); });
  }
  // Fechou pela tela (X, Esc, fundo): desfaz o #promocoes. Se o navegador ignorar o back(), limpa o endereço.
  dlg.addEventListener('close', () => {
    if (!(history.state && history.state.promo)) return;
    history.back();
    setTimeout(() => { if (history.state && history.state.promo) history.replaceState(null, '', location.pathname + location.search); }, 250);
  });
  window.addEventListener('popstate', () => { if (dlg.open && !(history.state && history.state.promo)) dlg.close(); });
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-promo-abrir]')) { e.preventDefault(); abrirPromo(); }
    else if (e.target.closest('[data-promo-fechar]')) dlg.close();
  });
  // links antigos (/promocoes.html) e QR codes chegam como /#promocoes
  function abrirPeloLink() {
    if (location.hash !== '#promocoes') return;
    history.replaceState(null, '', location.pathname + location.search);
    abrirPromo();
  }

  /* ================= Menu ================= */
  const menu = $('#menu'), burger = $('#burger');
  function fecharMenu() { menu.classList.remove('aberto'); burger.setAttribute('aria-expanded', 'false'); burger.setAttribute('aria-label', 'Abrir menu'); }
  burger.addEventListener('click', () => {
    const abre = !menu.classList.contains('aberto');
    menu.classList.toggle('aberto', abre);
    burger.setAttribute('aria-expanded', abre);
    burger.setAttribute('aria-label', abre ? 'Fechar menu' : 'Abrir menu');
  });
  menu.addEventListener('click', (e) => { if (e.target.closest('a,button')) fecharMenu(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') fecharMenu(); });
  document.addEventListener('click', (e) => { if (!e.target.closest('.topo')) fecharMenu(); });

  /* ================= Instalar o app (PWA) ================= */
  let pedidoInstalar = null;
  const instalado = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  function botoesInstalar() {
    $$('[data-instalar]').forEach((b) => { b.hidden = instalado() || (b.classList.contains('menu-extra') && !pedidoInstalar && !iOS); });
    $('#rodapeApp').hidden = instalado(); // dentro do app instalado não faz sentido oferecer a instalação
  }
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); pedidoInstalar = e; botoesInstalar(); });
  window.addEventListener('appinstalled', () => { pedidoInstalar = null; botoesInstalar(); toast('App instalado! 🎉'); });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('[data-instalar]')) return;
    if (pedidoInstalar) { pedidoInstalar.prompt(); pedidoInstalar.userChoice.finally(() => { pedidoInstalar = null; botoesInstalar(); }); return; }
    toast(iOS ? 'No iPhone: toque em Compartilhar (□↑) e depois em "Adicionar à Tela de Início".' : 'Abra o menu do navegador (⋮) e toque em "Instalar app" ou "Adicionar à tela inicial".', 6500);
  });
  botoesInstalar();

  /* ================= Início ================= */
  $('#ano').textContent = new Date().getFullYear();
  renderHistorico();
  estadoPlay();
  carregarBanner();
  carregarApoiadores();

  Promise.all([
    getJSON('/content/site.json').catch(() => null),
    getJSON('/content/programacao.json').catch(() => null),
    getJSON('/content/locutores.json').catch(() => null),
  ]).then(([site, grade, equipe]) => {
    if (site) dados.site = Object.assign(dados.site, site);
    if (grade) DIAS.forEach((d) => { dados.grade[d] = (grade[d] || []).slice().sort((a, b) => paraMin(a.inicio) - paraMin(b.inicio)); });
    if (equipe) dados.locutores = (equipe.itens || []).filter((l) => l && l.nome);
    dados.locutores.forEach((l) => porNome.set(norm(l.nome), l));
    $$('[data-wa-link]').forEach((a) => { a.href = wa(dados.site.whatsapp, 'Olá, Nova FM! Vim pelo site 😊'); });
    renderGrade(chaveDia(agoraSP().dia));
    tique();
    renderEquipe();
    renderRedes();
    carregarNoticias();
    buscarTocando();
    setInterval(tique, 30000);
    setInterval(buscarTocando, 15000);
  });

  // promoções: confere sem atrapalhar o carregamento da página
  setTimeout(() => carregarPromos().then(sinalizarPromos), 2500);
  setInterval(() => { if (!document.hidden) carregarPromos(true).then(sinalizarPromos); }, 5 * 60000);
  abrirPeloLink();
  window.addEventListener('hashchange', abrirPeloLink);

  if ('serviceWorker' in navigator && location.hostname !== 'localhost') window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
})();
