/* Cloudflare Pages Function — "tocando agora" da Nova FM. Rota: /api/nowplaying
   1º lê a página de status do Icecast (música atual + histórico + ouvintes, numa requisição só);
   se falhar, lê o título embutido no próprio stream (ICY).
   O playout manda "Artista - Música" e logo depois "Album: ...": quando o atual for um "Album:",
   usamos a última música de verdade do histórico.
   Título vazio = vinheta/comercial: o site mostra o programa do horário. */

const STREAM = "https://radio.novafmsbs.com.br/stream";
const STATUS = "https://radio.novafmsbs.com.br/status.xsl";
const ESTACAO = /nova\s*fm/i;  // títulos com o nome da rádio são tratados como vinheta
const ALBUM = /^\s*album\s*:/i; // linha de álbum que o playout manda por cima do título

const HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "access-control-allow-origin": "*",
  "cache-control": "public, max-age=10",
};

// Metadados chegam às vezes em latin-1, às vezes em UTF-8: tenta UTF-8 e cai para latin-1.
function decodifica(bytes) {
  try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch (e) { let s = ""; for (const b of bytes) s += String.fromCharCode(b); return s; }
}
function deHtml(s) {
  return s.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").trim();
}
const util = (t) => !!t && !ALBUM.test(t);

async function doStatusHtml() {
  const r = await fetch(STATUS, { cf: { cacheTtl: 5 } });
  if (!r.ok) throw new Error("status " + r.status);
  const bytes = new Uint8Array(await r.arrayBuffer());
  // A página é UTF-8, mas os títulos podem vir em latin-1: lê byte a byte e corrige título por título.
  let html = ""; for (const b of bytes) html += String.fromCharCode(b);
  const conserta = (s) => decodifica(Uint8Array.from(s, (c) => c.charCodeAt(0) & 0xff));
  const atual = (html.match(/Currently playing:<\/td>\s*<td[^>]*>([^<]*)<\/td>/i) || [])[1];
  const ouvintes = (html.match(/Listeners \(current\):<\/td>\s*<td[^>]*>(\d+)<\/td>/i) || [])[1];
  const bloco = (html.match(/<h4>Playlist<\/h4>([\s\S]*?)<\/table>/i) || [])[1] || "";
  const historico = [...bloco.matchAll(/<tr>\s*(?:<td>[^<]*<\/td>\s*){3}<td>([^<]*)<\/td>\s*<\/tr>/g)].map((m) => deHtml(conserta(m[1])));
  let raw = atual ? deHtml(conserta(atual)) : "";
  if (!util(raw)) raw = [...historico].reverse().find(util) || ""; // o mais recente fica no fim da tabela
  return { raw, ouvintes: ouvintes ? +ouvintes : null };
}

async function doStream() {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 6000);
  try {
    const r = await fetch(STREAM, { headers: { "Icy-MetaData": "1", "User-Agent": "NovaFM-Site/1.0" }, signal: ctrl.signal });
    const metaint = parseInt(r.headers.get("icy-metaint") || "0", 10);
    if (!r.ok || !metaint || !r.body) { try { r.body && r.body.cancel(); } catch (e) {} throw new Error("sem icy"); }
    const leitor = r.body.getReader();
    let buf = new Uint8Array(0);
    let precisa = metaint + 1;
    for (;;) {
      if (buf.length >= precisa) {
        const tam = buf[metaint] * 16;
        if (buf.length >= metaint + 1 + tam) {
          leitor.cancel().catch(() => {});
          const txt = decodifica(buf.slice(metaint + 1, metaint + 1 + tam));
          const m = txt.match(/StreamTitle='([\s\S]*?)';/);
          return { raw: m ? m[1] : "", ouvintes: null };
        }
        precisa = metaint + 1 + tam;
      }
      const { value, done } = await leitor.read();
      if (done) throw new Error("stream terminou");
      const novo = new Uint8Array(buf.length + value.length);
      novo.set(buf); novo.set(value, buf.length);
      buf = novo;
    }
  } finally { clearTimeout(t); }
}

function separa(raw) {
  let titulo = String(raw || "").replace(/\0/g, "").trim();
  let artista = "";
  if (!util(titulo) || ESTACAO.test(titulo)) return { artist: "", title: "" };
  const i = titulo.indexOf(" - ");
  if (i > -1) { artista = titulo.slice(0, i).trim(); titulo = titulo.slice(i + 3).trim(); }
  artista = artista.split("/").map((a) => a.trim()).filter(Boolean).join(", "); // "A/B" -> "A, B"
  return { artist: artista, title: titulo };
}

export async function onRequest(ctx) {
  const cache = caches.default;
  const chave = new Request(new URL("/api/nowplaying", ctx.request.url).toString());
  const salvo = await cache.match(chave);
  if (salvo) return salvo;

  let info = null, fonte = "";
  try { info = await doStatusHtml(); fonte = "icecast"; } catch (e) { /* página de status fora: tenta o stream */ }
  if (!info || !info.raw) {
    try { const icy = await doStream(); if (util(icy.raw)) { info = { raw: icy.raw, ouvintes: info && info.ouvintes }; fonte = "icy"; } }
    catch (e) { /* sem título: o site mostra o programa do horário */ }
  }

  const corpo = {
    now_playing: { song: separa(info && info.raw) },
    listeners: { current: (info && info.ouvintes) ?? null },
    source: fonte || "indisponivel",
    updated: new Date().toISOString(),
  };
  const resp = new Response(JSON.stringify(corpo), { headers: HEADERS });
  ctx.waitUntil(cache.put(chave, resp.clone()));
  return resp;
}
