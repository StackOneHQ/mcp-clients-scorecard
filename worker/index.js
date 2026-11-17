// Serves dist/ (wrangler.jsonc). Runs before every asset, so it also sets the headers a _headers file would:
// Cloudflare does not apply _headers to responses that pass through a Worker.
// A page asked for with `Accept: text/markdown` gets its Markdown copy (index.md), for AI agents.
const CSP = "default-src 'self'; img-src 'self' data:; style-src 'self'; font-src 'self'; script-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";
// Data other sites may fetch from the browser: badges in READMEs, the JSON, the text copies
const OPEN = /^\/(badges\/.*|data\.json|llms(-full)?\.txt|(.*\/)?index\.md)$/;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const isPage = url.pathname.endsWith('/');
    const markdown = isPage && /\btext\/markdown\b/.test(request.headers.get('Accept') || '');
    // Rebuilt from the origin, so a path like //other.host/ cannot turn into another host
    const mdUrl = new URL(`/${url.pathname.replace(/^\/+/, '')}index.md`, url.origin);
    const asset = await env.ASSETS.fetch(markdown ? new Request(mdUrl, request) : request);
    const res = new Response(asset.body, asset);
    const h = res.headers;
    h.set('X-Content-Type-Options', 'nosniff');
    h.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    h.set('Content-Security-Policy', CSP);
    if (asset.ok && (markdown || url.pathname.endsWith('.md'))) h.set('Content-Type', 'text/markdown; charset=utf-8');
    if (isPage) {
      h.append('Vary', 'Accept');
      if (asset.ok && !markdown) h.set('Link', `<${url.pathname}index.md>; rel="alternate"; type="text/markdown"`);
    }
    // style.css and app.js carry a content hash in ?v=, fonts never change
    const hashed = (/^\/(style\.css|app\.js)$/.test(url.pathname) && url.searchParams.has('v')) || url.pathname.startsWith('/assets/fonts/');
    if (asset.ok && hashed) h.set('Cache-Control', 'public, max-age=31536000, immutable');
    if (asset.ok && OPEN.test(url.pathname)) {
      h.set('Access-Control-Allow-Origin', '*');
      h.set('Cache-Control', 'public, max-age=3600');
    }
    return res;
  },
};
