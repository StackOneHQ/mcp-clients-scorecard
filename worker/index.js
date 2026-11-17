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
    const asset = await env.ASSETS.fetch(markdown ? new Request(new URL(`${url.pathname}index.md`, url), request) : request);
    const res = new Response(asset.body, asset);
    const h = res.headers;
    h.set('X-Content-Type-Options', 'nosniff');
    h.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    h.set('Content-Security-Policy', CSP);
    if (url.pathname.endsWith('.md') || (markdown && asset.ok)) h.set('Content-Type', 'text/markdown; charset=utf-8');
    if (isPage) {
      h.append('Vary', 'Accept');
      if (asset.ok && !markdown) h.set('Link', `<${url.pathname}index.md>; rel="alternate"; type="text/markdown"`);
    }
    // style.css and app.js carry a content hash in ?v=, fonts never change
    if (url.searchParams.has('v') || url.pathname.startsWith('/assets/fonts/')) h.set('Cache-Control', 'public, max-age=31536000, immutable');
    if (OPEN.test(url.pathname)) {
      h.set('Access-Control-Allow-Origin', '*');
      h.set('Cache-Control', 'public, max-age=3600');
    }
    return res;
  },
};
