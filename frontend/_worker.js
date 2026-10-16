// Static-export router for Cloudflare Workers. Assets in `out/` are served
// first (clean URLs like /arena -> arena.html); this worker only sees misses.
//
// Match pages are static and take the ID as a query parameter
// (`/play?id=…`, `/spectate?id=…`). Older links used `/play/<id>` and
// `/play/<id>/spectate`, which rendered a "placeholder" match; redirect them.
//
// playzug.xyz serves everything (landing at /, the app at /arena, /play, ...).
// arena.playzug.xyz and the old workers.dev hosts 301 there (the latter while
// REDIRECT_LEGACY_HOST is "true"). Path and query are kept.
const HOST = "playzug.xyz";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    const moved =
      url.hostname === `arena.${HOST}` ||
      (url.hostname.endsWith(".workers.dev") && env.REDIRECT_LEGACY_HOST === "true");
    if (moved) return Response.redirect(`https://${HOST}${url.pathname}${url.search}`, 301);

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
