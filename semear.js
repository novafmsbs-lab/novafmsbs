/**
 * Nova FM — Povoador de teste
 * ============================
 * Simula ouvintes reais participando, batendo no seu Worker LOCAL.
 * Serve pra você testar o sorteio com volume antes de subir pro ar.
 *
 * Com o `wrangler dev` rodando em outro terminal:
 *
 *   node semear.js                 → 60 ouvintes na promoção 1
 *   node semear.js 200 1           → 200 ouvintes na promoção 1
 *
 * Cada ouvinte ganha um WhatsApp fictício único (DDD 47).
 * Alguns participam várias vezes de propósito, pra você ver o teto
 * diário barrando e a cartela acumulando.
 */

const BASE = process.env.BASE || 'http://127.0.0.1:8787';
const QTD = parseInt(process.argv[2], 10) || 60;
const PROMO = parseInt(process.argv[3], 10) || 1;

const NOMES = ['Ana', 'Carlos', 'Maria', 'João', 'Luana', 'Pedro', 'Fernanda', 'Rafael',
  'Juliana', 'Marcos', 'Patrícia', 'Bruno', 'Camila', 'Diego', 'Leticia', 'Gustavo',
  'Sandra', 'Tiago', 'Vanessa', 'Rodrigo'];
const SOBRE = ['Silva', 'Souza', 'Oliveira', 'Lima', 'Costa', 'Pereira', 'Almeida',
  'Ferreira', 'Ribeiro', 'Martins', 'Schmitt', 'Hoffmann', 'Kruger'];

const pick = a => a[Math.floor(Math.random() * a.length)];

async function participar(nome, whatsapp) {
  const r = await fetch(`${BASE}/api/participar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nome, whatsapp, promocao_id: PROMO, consentimento: true }),
  });
  return { status: r.status, body: await r.json() };
}

(async () => {
  console.log(`Semeando ${QTD} ouvintes na promoção ${PROMO} → ${BASE}\n`);

  let ok = 0, repetidos = 0, erros = 0;

  for (let i = 0; i < QTD; i++) {
    const nome = `${pick(NOMES)} ${pick(SOBRE)}`;
    const whatsapp = `47${String(90000000 + i).padStart(9, '0')}`;

    // ~20% tenta participar duas vezes — pra ver o teto barrar
    const tentativas = Math.random() < 0.2 ? 2 : 1;

    for (let t = 0; t < tentativas; t++) {
      try {
        const r = await participar(nome, whatsapp);
        if (r.status !== 200) { erros++; if (erros <= 3) console.log('  erro:', r.body.erro); }
        else if (r.body.repetido) repetidos++;
        else ok++;
      } catch (e) {
        erros++;
        if (erros === 1) console.log('  Não consegui falar com o Worker. O `wrangler dev` está rodando?');
      }
    }
  }

  console.log(`\n  entraram:   ${ok}`);
  console.log(`  barrados:   ${repetidos}  (teto diário funcionando)`);
  console.log(`  erros:      ${erros}`);
  console.log(`\nAgora veja o bolo:`);
  console.log(`  curl "${BASE}/api/admin/pool?promocao_id=${PROMO}" -H "Authorization: Bearer teste123"`);
  console.log(`\nE sorteie:`);
  console.log(`  curl -X POST "${BASE}/api/admin/sortear" -H "Authorization: Bearer teste123" \\`);
  console.log(`    -H "Content-Type: application/json" -d '{"promocao_id":${PROMO},"ganhadores":1,"suplentes":1}'`);
})();
