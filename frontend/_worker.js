// Minimal worker — serves static assets with SPA fallback.
// Dynamic routes (e.g. /play/<matchId>) map to their static placeholder files.
const DYNAMIC_ROUTES = [
  { pattern: /^\/play\/[^/]+$/, asset: "/play/[matchId].html" },
  { pattern: /^\/play\/[^/]+\/spectate$/, asset: "/play/[matchId]/spectate.html" },
];

function dynamicAsset(pathname) {
  for (const { pattern, asset } of DYNAMIC_ROUTES) {
    if (pattern.test(pathname)) return asset;
  }
  return null;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // SPA fallback for dynamic routes
    const dynAsset = dynamicAsset(url.pathname);
    if (dynAsset) {
      const asset = await env.ASSETS.fetch(new Request(new URL(dynAsset, request.url), request));
      if (asset.ok) return asset;
    }

    // Non-file paths → index.html (catch-all SPA fallback)
    if (!url.pathname.includes(".")) {
      const asset = await env.ASSETS.fetch(new Request(new URL("/index.html", request.url), request));
      if (asset.ok) return asset;
    }

    const asset = await env.ASSETS.fetch(request);
    return asset.ok ? asset : new Response("Not Found", { status: 404 });
  }
}
