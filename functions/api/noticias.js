/* Cloudflare Pages Function — últimas notícias do Portal Nova Mais (portalnovafmsbs.com.br). Rota: /api/noticias
   1º usa a API do WordPress (traz imagem destacada, texto alternativo, resumo e categoria);
   se ela falhar, cai para o feed RSS (só título, link, data e categoria).
   As matérias completas, a busca e as categorias continuam no portal: aqui só listamos e linkamos. */

const PORTAL = "https://portalnovafmsbs.com.br";
const FEEDS = ["/feed/", "/rss.xml", "/feed.xml", "/rss", "/atom.xml"];
const MAX = 7;

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
    .replace(/&quot;/g, '"').replace(/&apos;|&#039;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ").replace(/&hellip;/g, "…").replace(/&amp;/g, "&")
    .replace(/\s*\[(?:…|\.\.\.)\]\s*$/, "…")
    .replace(/\s+/g, " ").trim();
}
const http = (u) => (/^https:\/\//i.test(String(u || "")) ? String(u) : "");

// ---------- API do WordPress ----------
async function viaApi() {
  const campos = "id,date_gmt,link,title,excerpt,_links,_embedded";
  const url = `${PORTAL}/wp-json/wp/v2/posts?per_page=${MAX}&_embed=wp:featuredmedia,wp:term&_fields=${campos}`;
  const r = await fetch(url, { headers: { "User-Agent": "NovaFM-Site/1.0" }, cf: { cacheTtl: 300 } });
  if (!r.ok) throw new Error("api " + r.status);
  const posts = await r.json();
  if (!Array.isArray(posts) || !posts.length) throw new Error("api vazia");
  return posts.map((p) => {
    const emb = p._embedded || {};
    const midia = (emb["wp:featuredmedia"] || [])[0] || {};
    const tam = (midia.media_details && midia.media_details.sizes) || {};
    const escolhe = (...nomes) => { for (const n of nomes) if (tam[n] && http(tam[n].source_url)) return tam[n]; return null; };
    const card = escolhe("pnm-card", "medium_large", "medium", "post-thumbnail");
    const grande = escolhe("pnm-destaque", "large", "medium_large");
    const cat = ([].concat(...(emb["wp:term"] || [])).find((t) => t && t.taxonomy === "category")) || null;
    return {
      titulo: limpa(p.title && p.title.rendered),
      link: http(p.link),
      data: p.date_gmt ? new Date(p.date_gmt + "Z").toISOString() : "", // date_gmt vem em UTC sem o "Z"
      resumo: limpa(p.excerpt && p.excerpt.rendered).slice(0, 220),
      categoria: cat ? { nome: limpa(cat.name), link: http(cat.link) } : null,
      imagem: card ? {
        url: http(card.source_url), largura: card.width, altura: card.height,
        grande: grande ? http(grande.source_url) : "", grandeLargura: grande ? grande.width : 0, grandeAltura: grande ? grande.height : 0,
        alt: limpa(midia.alt_text),
      } : null,
    };
  }).filter((n) => n.titulo && n.link);
}

// ---------- RSS (reserva) ----------
const tag = (xml, nome) => { const m = xml.match(new RegExp("<" + nome + "(?:\\s[^>]*)?>([\\s\\S]*?)</" + nome + ">", "i")); return m ? m[1] : ""; };
function interpretaRss(xml) {
  const blocos = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) || [];
  return blocos.slice(0, MAX).map((b) => {
    let link = limpa(tag(b, "link"));
    if (!link) { const m = b.match(/<link[^>]*href="([^"]+)"/i); link = m ? m[1] : ""; }
    const data = limpa(tag(b, "pubDate") || tag(b, "published") || tag(b, "updated") || tag(b, "dc:date"));
    const cat = limpa(tag(b, "category"));
    return { titulo: limpa(tag(b, "title")), link: http(link), data: data ? new Date(data).toISOString() : "", resumo: limpa(tag(b, "description")).slice(0, 220), categoria: cat ? { nome: cat, link: "" } : null, imagem: null };
  }).filter((n) => n.titulo && n.link);
}
async function viaRss() {
  for (const caminho of FEEDS) {
    try {
      const r = await fetch(PORTAL + caminho, { headers: { "User-Agent": "NovaFM-Site/1.0" }, cf: { cacheTtl: 300 } });
      if (!r.ok) continue;
      const xml = await r.text();
      if (!/<(rss|feed)[\s>]/i.test(xml)) continue;
      const itens = interpretaRss(xml);
      if (itens.length) return itens;
    } catch (e) { /* tenta o próximo */ }
  }
  return [];
}

export async function onRequest(ctx) {
  const cache = caches.default;
  const chave = new Request(new URL("/api/noticias", ctx.request.url).toString());
  const salvo = await cache.match(chave);
  if (salvo) return salvo;

  let itens = [], fonte = "";
  try { itens = await viaApi(); fonte = "wordpress"; } catch (e) { /* API fora: tenta o RSS */ }
  if (!itens.length) { itens = await viaRss(); fonte = itens.length ? "rss" : "indisponivel"; }

  const corpo = { portal: PORTAL, busca: PORTAL + "/?s=", fonte, itens };
  const resp = new Response(JSON.stringify(corpo), { headers: HEADERS });
  ctx.waitUntil(cache.put(chave, resp.clone()));
  return resp;
}
