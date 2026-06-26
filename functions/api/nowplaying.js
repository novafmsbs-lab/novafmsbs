/* Cloudflare Pages Function — espelho do "tocando agora" do Icecast.
   Rota automática: /api/nowplaying
   Roda no servidor (sem CORS), lê o status do Icecast e devolve JSON limpo. */

const ICECAST_STATUS = "https://radio.novafmsbs.com.br/status-json.xsl"; // ajuste se mudar host/porta
const MOUNT = "/stream"; // o ponto de montagem do BUTT/Icecast

export async function onRequest() {
  const headers = {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "cache-control": "public, max-age=8"
  };
  try {
    const r = await fetch(ICECAST_STATUS, { cf: { cacheTtl: 5, cacheEverything: true } });
    const data = await r.json();
    let src = data && data.icestats && data.icestats.source;
    if (Array.isArray(src)) {
      src = src.find(s => String(s.listenurl || "").endsWith(MOUNT)) || src[0];
    }
    let title = (src && (src.title || src.yp_currently_playing || src.server_name)) || "Nova FM 87,9";
    let artist = "";
    const i = title.indexOf(" - ");
    if (i > -1) { artist = title.slice(0, i).trim(); title = title.slice(i + 3).trim(); }
    const listeners = (src && (src.listeners != null ? src.listeners : src.listener_peak)) || 0;
    return new Response(JSON.stringify({
      now_playing: { song: { artist, title } },
      listeners: { current: listeners },
      source: "icecast"
    }), { headers });
  } catch (e) {
    return new Response(JSON.stringify({
      now_playing: { song: { artist: "", title: "Nova FM 87,9" } },
      error: String(e)
    }), { headers });
  }
}
