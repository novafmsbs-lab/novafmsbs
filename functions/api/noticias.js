/* Cloudflare Pages Function — últimas manchetes do Portal Nova FM. Rota: /api/noticias
   Lê o feed RSS/Atom do portal (WordPress e a maioria das plataformas têm um).
   Enquanto o portal não estiver no ar, devolve lista vazia e o site mostra só o destaque do portal. */

const PORTAL = "https://portalnovafmsbs.com.br";
const FEEDS = ["/feed/", "/rss.xml", "/feed.xml", "/rss", "/atom.xml"];
const MAX = 4;

const HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "access-control-allow-origin": "*",
  "cache-control": "public, max-age=600",
};

function limpa(s) {
  return String(s || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&quot;/g, '"').replace(/&apos;|&#039;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
    .replace(/\s+/g, " ").trim();
}
const tag = (xml, nome) => { const m = xml.match(new RegExp("<" + nome + "(?:\\s[^>]*)?>([\\s\\S]*?)</" + nome + ">", "i")); return m ? m[1] : ""; };

function interpreta(xml) {
  const itens = [];
  const blocos = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) || [];
  for (const b of blocos.slice(0, MAX)) {
    const titulo = limpa(tag(b, "title"));
    let link = limpa(tag(b, "link"));
    if (!link) { const m = b.match(/<link[^>]*href="([^"]+)"/i); link = m ? m[1] : ""; }
    const data = limpa(tag(b, "pubDate") || tag(b, "published") || tag(b, "updated") || tag(b, "dc:date"));
    if (titulo && /^https?:\/\//i.test(link)) itens.push({ titulo, link, data: data ? new Date(data).toISOString() : "" });
  }
  return itens;
}

export async function onRequest(ctx) {
  const cache = caches.default;
  const chave = new Request(new URL("/api/noticias", ctx.request.url).toString());
  const salvo = await cache.match(chave);
  if (salvo) return salvo;

  let itens = [];
  for (const caminho of FEEDS) {
    try {
      const r = await fetch(PORTAL + caminho, { headers: { "User-Agent": "NovaFM-Site/1.0" }, cf: { cacheTtl: 300 } });
      if (!r.ok) continue;
      const xml = await r.text();
      if (!/<(rss|feed)[\s>]/i.test(xml)) continue;
      itens = interpreta(xml);
      if (itens.length) break;
    } catch (e) { /* portal fora do ar ou sem esse feed: tenta o próximo */ }
  }

  const resp = new Response(JSON.stringify({ portal: PORTAL, itens }), { headers: HEADERS });
  ctx.waitUntil(cache.put(chave, resp.clone()));
  return resp;
}
