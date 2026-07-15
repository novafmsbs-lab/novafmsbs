/**
 * Nova FM 87.9 — Sorteador (Cloudflare Worker + D1)  ·  v2
 * =======================================================
 * Público:
 *   GET  /api/agora                 → programa no ar agora
 *   GET  /api/programacao           → grade completa (pro site exibir)
 *   GET  /api/promocoes             → promoções abertas
 *   GET  /api/sorteados?limite=10   → últimos ganhadores (nome mascarado)
 *   POST /api/participar            → { nome, whatsapp, promocao_id, consentimento }
 *
 * Estúdio (header  Authorization: Bearer <ADMIN_TOKEN>):
 *   GET  /api/admin/programacao                 → grade pra editar
 *   POST /api/admin/programacao                 → { itens:[{nome,inicio,fim,ativo}] }  (substitui tudo)
 *   GET  /api/admin/promocoes                   → todas as promoções
 *   POST /api/admin/promocao                    → cria promoção
 *   POST /api/admin/promocao/status             → { id, status }
 *   GET  /api/admin/pool?promocao_id=1          → bolo do sorteio
 *   POST /api/admin/sortear                     → { promocao_id, ganhadores, suplentes }
 *   GET  /api/admin/historico                   → sorteios realizados
 */

const TZ = 'America/Sao_Paulo';

// Grade de segurança: só é usada se a tabela do banco estiver vazia ou falhar.
const GRADE_FALLBACK = [
  { ini: '08:00', fim: '10:00', nome: 'Manhã da Nova' },
  { ini: '10:00', fim: '12:00', nome: 'Papo de Comadre' },
  { ini: '12:00', fim: '13:00', nome: 'Almoçando com a Nova' },
  { ini: '13:00', fim: '16:00', nome: 'Salada Mista' },
  { ini: '16:00', fim: '19:00', nome: 'Boteco da Nova' },
  { ini: '19:00', fim: '20:00', nome: 'Voz do Brasil' },
  { ini: '20:00', fim: '22:00', nome: 'Bailão da Nova' },
];

function agoraNaRadio() {
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
  const p = Object.fromEntries(f.formatToParts(new Date()).map(x => [x.type, x.value]));
  const hora = parseInt(p.hour, 10) % 24;
  const minuto = parseInt(p.minute, 10);
  return {
    dia: `${p.year}-${p.month}-${p.day}`,
    hora, minuto,
    hhmm: `${String(hora).padStart(2, '0')}:${String(minuto).padStart(2, '0')}`,
  };
}

/**
 * Programa no ar. Lê a grade do banco; cai no fallback só se a tabela
 * não existir ainda ou der erro. DEV_PROGRAMA (local) força um valor.
 */
async function programaNoAr(env, db) {
  if (env && env.DEV_PROGRAMA) return env.DEV_PROGRAMA;
  const { hhmm } = agoraNaRadio();
  try {
    if (db) {
      const row = await db.prepare(
        `SELECT nome FROM programacao WHERE ativo=1 AND inicio<=? AND fim>? ORDER BY ordem LIMIT 1`
      ).bind(hhmm, hhmm).first();
      if (row) return row.nome;
      // Tabela tem grade ativa mas nada casa o horário → fora da programação.
      const any = await db.prepare(`SELECT COUNT(*) AS n FROM programacao WHERE ativo=1`).first();
      if (any && any.n > 0) return null;
    }
  } catch (e) { /* tabela ainda não migrada → usa fallback */ }
  const g = GRADE_FALLBACK.find(x => x.ini <= hhmm && hhmm < x.fim);
  return g ? g.nome : null;
}

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  },
});

function limparWhatsapp(v) {
  const d = String(v || '').replace(/\D/g, '');
  if (d.length < 10 || d.length > 11) return null;
  if (parseInt(d.slice(0, 2), 10) < 11) return null;
  return d;
}

function aleatorio() {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] / 4294967296;
}
function sortearUm(pool) {
  const total = pool.reduce((s, p) => s + p.chances, 0);
  let r = aleatorio() * total, acc = 0;
  for (let i = 0; i < pool.length; i++) {
    acc += pool[i].chances;
    if (r <= acc) return pool.splice(i, 1)[0];
  }
  return pool.splice(pool.length - 1, 1)[0];
}

async function montarPool(db, promo) {
  const filtroPrograma = promo.escopo === 'programa' ? 'AND p.programa = ?' : '';
  const args = promo.escopo === 'programa' ? [promo.id, promo.programa] : [promo.id];
  const { results } = await db.prepare(`
    SELECT o.id, o.nome, o.whatsapp, o.ultima_vitoria, COUNT(p.id) AS participacoes
      FROM participacoes p JOIN ouvintes o ON o.id = p.ouvinte_id
     WHERE p.promocao_id = ? ${filtroPrograma} AND o.bloqueado = 0
     GROUP BY o.id ORDER BY o.id`).bind(...args).all();

  const limite = new Date(Date.now() - promo.carencia_dias * 86400000).toISOString().slice(0, 10);
  return (results || [])
    .filter(r => !r.ultima_vitoria || r.ultima_vitoria < limite)
    .map(r => ({
      id: r.id, nome: r.nome, whatsapp: r.whatsapp, participacoes: r.participacoes,
      chances: promo.modo === 'cartela' ? r.participacoes : 1,
    }));
}

function mascararNome(n) {
  const parts = String(n || '').trim().split(/\s+/);
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : parts[0];
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const rota = url.pathname;
    const db = env.DB;
    if (request.method === 'OPTIONS') return json({});

    const admin = () => {
      const h = request.headers.get('Authorization') || '';
      return env.ADMIN_TOKEN && h === `Bearer ${env.ADMIN_TOKEN}`;
    };

    try {
      // ---------------- Público ----------------
      if (rota === '/api/agora') {
        return json({ programa: await programaNoAr(env, db), ...agoraNaRadio() });
      }

      if (rota === '/api/programacao') {
        let itens = [];
        try {
          const { results } = await db.prepare(
            `SELECT nome, inicio, fim FROM programacao WHERE ativo=1 ORDER BY ordem`
          ).all();
          itens = results || [];
        } catch (e) {}
        if (!itens.length) itens = GRADE_FALLBACK.map(g => ({ nome: g.nome, inicio: g.ini, fim: g.fim }));
        return json({ programacao: itens });
      }

      if (rota === '/api/promocoes') {
        const { results } = await db.prepare(
          `SELECT id, nome, premio, escopo, programa, modo FROM promocoes WHERE status='aberta' ORDER BY id DESC`
        ).all();
        return json({ promocoes: results || [] });
      }

      if (rota === '/api/sorteados') {
        const lim = Math.min(parseInt(url.searchParams.get('limite'), 10) || 10, 50);
        let results = [];
        try {
          const q = await db.prepare(`
            SELECT o.nome, p.nome AS promocao, p.premio, s.criado_em
              FROM ganhadores g JOIN sorteios s ON s.id=g.sorteio_id
              JOIN promocoes p ON p.id=s.promocao_id JOIN ouvintes o ON o.id=g.ouvinte_id
             WHERE g.suplente=0 ORDER BY s.id DESC LIMIT ?`).bind(lim).all();
          results = q.results || [];
        } catch (e) {}
        return json({
          sorteados: results.map(r => ({
            nome: mascararNome(r.nome), promocao: r.promocao, premio: r.premio, quando: r.criado_em,
          })),
        });
      }

      if (rota === '/api/participar' && request.method === 'POST') {
        const body = await request.json();
        const nome = String(body.nome || '').trim().slice(0, 80);
        const zap = limparWhatsapp(body.whatsapp);
        const promoId = parseInt(body.promocao_id, 10);

        if (nome.length < 2) return json({ erro: 'Digite seu nome.' }, 400);
        if (!zap) return json({ erro: 'WhatsApp inválido — confira o DDD.' }, 400);
        if (!body.consentimento) return json({ erro: 'É preciso aceitar o uso dos dados.' }, 400);

        const promo = await db.prepare(`SELECT * FROM promocoes WHERE id=? AND status='aberta'`).bind(promoId).first();
        if (!promo) return json({ erro: 'Promoção não encontrada ou encerrada.' }, 404);

        const programa = await programaNoAr(env, db);
        if (!programa) return json({ erro: 'Fora do horário de programação. Participe das 8h às 22h!' }, 400);
        if (promo.escopo === 'programa' && promo.programa !== programa) {
          return json({ erro: `Esta promoção é só do ${promo.programa}.` }, 400);
        }

        const { dia } = agoraNaRadio();
        await db.prepare(
          `INSERT INTO ouvintes (whatsapp, nome) VALUES (?, ?) ON CONFLICT(whatsapp) DO UPDATE SET nome=excluded.nome`
        ).bind(zap, nome).run();
        const ouvinte = await db.prepare(`SELECT id, bloqueado FROM ouvintes WHERE whatsapp=?`).bind(zap).first();
        if (ouvinte.bloqueado) return json({ erro: 'Cadastro indisponível.' }, 403);

        let entrou = false;
        for (let slot = 1; slot <= promo.teto_diario; slot++) {
          try {
            await db.prepare(
              `INSERT INTO participacoes (ouvinte_id, promocao_id, programa, dia, slot) VALUES (?, ?, ?, ?, ?)`
            ).bind(ouvinte.id, promo.id, programa, dia, slot).run();
            entrou = true; break;
          } catch (e) {}
        }
        if (!entrou) {
          return json({ ok: true, repetido: true, programa,
            mensagem: `Você já está concorrendo no ${programa} hoje. Volte amanhã ou em outro programa!` });
        }
        const total = await db.prepare(
          `SELECT COUNT(*) AS n FROM participacoes WHERE ouvinte_id=? AND promocao_id=?`
        ).bind(ouvinte.id, promo.id).first();
        return json({ ok: true, programa,
          chances: promo.modo === 'cartela' ? total.n : 1,
          mensagem: promo.modo === 'cartela'
            ? `Você entrou no ${programa}! Já são ${total.n} chance(s) — participe todo dia pra somar mais.`
            : `Você entrou no ${programa}! Todo mundo tem a mesma chance.` });
      }

      // ---------------- Estúdio ----------------
      if (rota.startsWith('/api/admin/')) {
        if (!admin()) return json({ erro: 'Não autorizado.' }, 401);

        // ----- Programação -----
        if (rota === '/api/admin/programacao' && request.method === 'GET') {
          let results = [];
          try {
            const q = await db.prepare(`SELECT id,nome,inicio,fim,ativo,ordem FROM programacao ORDER BY ordem`).all();
            results = q.results || [];
          } catch (e) {}
          if (!results.length) results = GRADE_FALLBACK.map((g, i) => ({ nome: g.nome, inicio: g.ini, fim: g.fim, ativo: 1, ordem: i + 1 }));
          return json({ itens: results });
        }
        if (rota === '/api/admin/programacao' && request.method === 'POST') {
          const body = await request.json();
          const itens = Array.isArray(body.itens) ? body.itens : [];
          await db.prepare(`CREATE TABLE IF NOT EXISTS programacao (id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL, inicio TEXT NOT NULL, fim TEXT NOT NULL, ativo INTEGER NOT NULL DEFAULT 1, ordem INTEGER NOT NULL DEFAULT 0)`).run();
          const stmts = [db.prepare(`DELETE FROM programacao`)];
          itens.forEach((it, i) => stmts.push(db.prepare(
            `INSERT INTO programacao (nome,inicio,fim,ativo,ordem) VALUES (?,?,?,?,?)`
          ).bind(String(it.nome || '').slice(0, 60), String(it.inicio || ''), String(it.fim || ''), it.ativo ? 1 : 0, i + 1)));
          await db.batch(stmts);
          return json({ ok: true, total: itens.length });
        }

        // ----- Promoções -----
        if (rota === '/api/admin/promocoes' && request.method === 'GET') {
          const { results } = await db.prepare(`
            SELECT p.*, (SELECT COUNT(*) FROM participacoes x WHERE x.promocao_id=p.id) AS participacoes
              FROM promocoes p ORDER BY p.id DESC`).all();
          return json({ promocoes: results || [] });
        }
        if (rota === '/api/admin/promocao' && request.method === 'POST') {
          const b = await request.json();
          const escopo = b.escopo === 'programa' ? 'programa' : 'geral';
          const modo = b.modo === 'igualdade' ? 'igualdade' : 'cartela';
          if (!String(b.nome || '').trim()) return json({ erro: 'Dê um nome à promoção.' }, 400);
          await db.prepare(`
            INSERT INTO promocoes (nome,premio,escopo,programa,modo,carencia_dias,teto_diario)
            VALUES (?,?,?,?,?,?,?)`).bind(
            String(b.nome).slice(0, 80), String(b.premio || '').slice(0, 120), escopo,
            escopo === 'programa' ? String(b.programa || '') : null, modo,
            parseInt(b.carencia_dias, 10) || 30, parseInt(b.teto_diario, 10) || 1).run();
          return json({ ok: true });
        }
        if (rota === '/api/admin/promocao/status' && request.method === 'POST') {
          const b = await request.json();
          const st = b.status === 'aberta' ? 'aberta' : 'encerrada';
          await db.prepare(`UPDATE promocoes SET status=? WHERE id=?`).bind(st, parseInt(b.id, 10)).run();
          return json({ ok: true });
        }

        // ----- Bolo / Sorteio / Histórico -----
        if (rota === '/api/admin/pool') {
          const promo = await db.prepare(`SELECT * FROM promocoes WHERE id=?`)
            .bind(parseInt(url.searchParams.get('promocao_id'), 10)).first();
          if (!promo) return json({ erro: 'Promoção não encontrada.' }, 404);
          const pool = await montarPool(db, promo);
          return json({ promocao: promo, participantes: pool.length, chances: pool.reduce((s, p) => s + p.chances, 0), pool });
        }

        if (rota === '/api/admin/sortear' && request.method === 'POST') {
          const body = await request.json();
          const promo = await db.prepare(`SELECT * FROM promocoes WHERE id=?`).bind(parseInt(body.promocao_id, 10)).first();
          if (!promo) return json({ erro: 'Promoção não encontrada.' }, 404);
          const pool = await montarPool(db, promo);
          if (!pool.length) return json({ erro: 'Ninguém elegível no bolo.' }, 400);

          const snapshot = JSON.stringify(pool.map(p => ({ id: p.id, nome: p.nome, chances: p.chances })));
          const totalPart = pool.length, totalCh = pool.reduce((s, p) => s + p.chances, 0);
          const seedBuf = new Uint8Array(16); crypto.getRandomValues(seedBuf);
          const seed = [...seedBuf].map(b => b.toString(16).padStart(2, '0')).join('');

          const restante = pool.slice();
          const nWin = Math.min(Math.max(1, parseInt(body.ganhadores, 10) || 1), restante.length);
          const nSup = Math.min(Math.max(0, parseInt(body.suplentes, 10) || 0), Math.max(0, restante.length - nWin));
          const ganhadores = []; for (let i = 0; i < nWin; i++) ganhadores.push(sortearUm(restante));
          const suplentes = []; for (let i = 0; i < nSup; i++) suplentes.push(sortearUm(restante));

          const s = await db.prepare(`
            INSERT INTO sorteios (promocao_id, modo, escopo, programa, participantes, chances, seed, snapshot)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).bind(
            promo.id, promo.modo, promo.escopo, promo.programa, totalPart, totalCh, seed, snapshot).run();
          const sorteioId = s.meta.last_row_id;
          const { dia } = agoraNaRadio();
          const stmts = [];
          ganhadores.forEach((g, i) => {
            stmts.push(db.prepare(`INSERT INTO ganhadores (sorteio_id, ouvinte_id, posicao, suplente) VALUES (?, ?, ?, 0)`).bind(sorteioId, g.id, i + 1));
            stmts.push(db.prepare(`UPDATE ouvintes SET vitorias=vitorias+1, ultima_vitoria=? WHERE id=?`).bind(dia, g.id));
          });
          suplentes.forEach((g, i) => stmts.push(db.prepare(`INSERT INTO ganhadores (sorteio_id, ouvinte_id, posicao, suplente) VALUES (?, ?, ?, 1)`).bind(sorteioId, g.id, i + 1)));
          if (stmts.length) await db.batch(stmts);

          return json({ ok: true, sorteio_id: sorteioId, seed, promocao: promo.nome, modo: promo.modo,
            participantes: totalPart, chances: totalCh,
            ganhadores: ganhadores.map(g => ({ nome: g.nome, whatsapp: g.whatsapp, chances: g.chances })),
            suplentes: suplentes.map(g => ({ nome: g.nome, whatsapp: g.whatsapp, chances: g.chances })) });
        }

        if (rota === '/api/admin/historico') {
          const { results } = await db.prepare(`
            SELECT s.id, s.criado_em, s.modo, s.participantes, s.chances, s.seed, p.nome AS promocao,
                   (SELECT GROUP_CONCAT(o.nome, ', ') FROM ganhadores g JOIN ouvintes o ON o.id=g.ouvinte_id
                     WHERE g.sorteio_id=s.id AND g.suplente=0) AS ganhadores
              FROM sorteios s JOIN promocoes p ON p.id=s.promocao_id ORDER BY s.id DESC LIMIT 50`).all();
          return json({ historico: results || [] });
        }
      }

      return json({ erro: 'Rota não encontrada.' }, 404);
    } catch (e) {
      return json({ erro: 'Erro no servidor.', detalhe: String(e && e.message) }, 500);
    }
  },
};
