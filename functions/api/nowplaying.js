/* Cloudflare Pages Function — "tocando agora" da Nova FM. Rota: /api/nowplaying
   1º tenta o status-json do Icecast; se falhar, lê o título embutido no próprio stream (ICY).
   Título vazio = vinheta/comercial: o site mostra o programa do horário. */

const STREAM = "https://radio.novafmsbs.com.br/stream";
const STATUS = "https://radio.novafmsbs.com.br/status-json.xsl";
const MOUNT = "/stream";
const ESTACAO = /nova\s*fm/i; // títulos com o nome da rádio são tratados como vinheta

const HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "access-control-allow-origin": "*",
  "cache-control": "public, max-age=10",
};

async function doStatus() {
  const r = await fetch(STATUS, { cf: { cacheTtl: 5 } });
  if (!r.ok) throw new Error("status " + r.status);
  const d = await r.json();
  let src = d && d.icestats && d.icestats.source;
  if (Array.isArray(src)) src = src.find((s) => String(s.listenurl || "").endsWith(MOUNT)) || src[0];
  if (!src) throw new Error("sem source");
  return { raw: src.title || src.yp_currently_playing || "", ouvintes: src.listeners ?? null };
}

function decodifica(bytes) {
  try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch (e) { let s = ""; for (const b of bytes) s += String.fromCharCode(b); return s; } // latin-1
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
  if (!titulo || ESTACAO.test(titulo)) return { artist: "", title: "" };
  const i = titulo.indexOf(" - ");
  if (i > -1) { artista = titulo.slice(0, i).trim(); titulo = titulo.slice(i + 3).trim(); }
  return { artist: artista, title: titulo };
}

export async function onRequest(ctx) {
  const cache = caches.default;
  const chave = new Request(new URL("/api/nowplaying", ctx.request.url).toString());
  const salvo = await cache.match(chave);
  if (salvo) return salvo;

  let info = null, fonte = "";
  try { info = await doStatus(); fonte = "icecast"; } catch (e) { /* status-json quebrado: tenta o stream */ }
  if (!info || !info.raw) { try { info = await doStream(); fonte = "icy"; } catch (e) { info = info || null; } }

  const corpo = {
    now_playing: { song: separa(info && info.raw) },
    listeners: { current: (info && info.ouvintes) || null },
    source: fonte || "indisponivel",
    updated: new Date().toISOString(),
  };
  const resp = new Response(JSON.stringify(corpo), { headers: HEADERS });
  ctx.waitUntil(cache.put(chave, resp.clone()));
  return resp;
}
