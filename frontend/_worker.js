// Static-export router for Cloudflare Workers. Assets in `out/` are served
// first (clean URLs like /arena -> arena.html); this worker only sees misses.
//
// Match pages are static and take the ID as a query parameter
// (`/play?id=…`, `/spectate?id=…`). Older links used `/play/<id>` and
// `/play/<id>/spectate`, which rendered a "placeholder" match; redirect them.
//
// Hosts: playzug.xyz is the landing page, arena.playzug.xyz the app. App paths
// requested on the apex move to the arena host, and the old workers.dev hosts
// redirect there once REDIRECT_LEGACY_HOST is "true".
const APP_HOST = "arena.playzug.xyz";
const APEX_HOST = "playzug.xyz";
const APP_PATHS = /^\/(arena|play|spectate|review|profile|leaderboard|settings)(\/|$)/;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    const toApp = (pathname = url.pathname) =>
      Response.redirect(`https://${APP_HOST}${pathname}${url.search}`, 301);
    if (url.hostname.endsWith(".workers.dev") && env.REDIRECT_LEGACY_HOST === "true") return toApp();
    if (url.hostname === APEX_HOST && APP_PATHS.test(url.pathname)) return toApp();
    if (url.hostname === APP_HOST && url.pathname === "/") return toApp("/arena");

    const legacy = url.pathname.match(/^\/play\/([^/]+?)(\/spectate)?\/?$/);
    if (legacy && legacy[1] !== "placeholder") {
      const target = new URL(legacy[2] ? "/spectate" : "/play", url.origin);
      target.searchParams.set("id", decodeURIComponent(legacy[1]));
      return Response.redirect(target.toString(), 302);
    }

    const asset = await env.ASSETS.fetch(request);
    if (asset.status !== 404) return asset;

    const notFound = await env.ASSETS.fetch(new URL("/404.html", url.origin));
    return new Response(notFound.ok ? notFound.body : "Not Found", {
      status: 404,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  },
};
