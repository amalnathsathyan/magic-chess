// Minimal worker — serves static assets for SPA routing.
// Non-asset paths fall back to index.html for client-side routing.
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.includes(".")) {
      const asset = await env.ASSETS.fetch(new Request(new URL("/index.html", request.url), request));
      if (asset.ok) return asset;
    }
    const asset = await env.ASSETS.fetch(request);
    return asset.ok ? asset : new Response("Not Found", { status: 404 });
  }
}
