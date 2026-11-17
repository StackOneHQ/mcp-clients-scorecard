// Serves dist/ (wrangler.jsonc). Runs before every asset, so it also sets the headers a _headers file would:
// Cloudflare does not apply _headers to responses that pass through a Worker.
// AI agents get each page's Markdown copy (index.md): when they ask with `Accept: text/markdown`,
// when their User-Agent names a known AI fetcher, or when they add .md to a page URL (/clients/codex.md).
const CSP = "default-src 'self'; img-src 'self' data:; style-src 'self'; font-src 'self'; script-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";
// Data other sites may fetch from the browser: badges in READMEs, the JSON, the text copies
const OPEN = /^\/(badges\/.*|data\.json|llms(-full)?\.txt|sitemap\.md|(.*\/)?index\.md)$/;
// AI crawlers and fetchers that read text. Search engine crawlers (Googlebot, Bingbot) are not on the list and get HTML.
const AGENT_UA = /ClaudeBot|Claude-User|Claude-SearchBot|anthropic-ai|GPTBot|ChatGPT-User|OAI-SearchBot|PerplexityBot|Perplexity-User|CCBot|cohere-ai|Meta-ExternalAgent|Amazonbot|DuckAssistBot|MistralAI-User/i;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const isPage = url.pathname.endsWith('/');
    const markdown = isPage && (/\btext\/markdown\b/.test(request.headers.get('Accept') || '') || AGENT_UA.test(request.headers.get('User-Agent') || ''));
    // /clients/codex.md is the copy of /clients/codex/; index.md and sitemap.md are real files
    const shortMd = url.pathname.match(/^\/(.+)\.md$/);
    const target = markdown ? `${url.pathname}index.md` : shortMd && !/(^|\/)index$|^sitemap$/.test(shortMd[1]) ? `/${shortMd[1]}/index.md` : null;
    // Rebuilt from the origin, so a path like //other.host/ cannot turn into another host
    const asset = await env.ASSETS.fetch(target ? new Request(new URL(`/${target.replace(/^\/+/, '')}`, url.origin), request) : request);
    const res = new Response(asset.body, asset);
    const h = res.headers;
    h.set('X-Content-Type-Options', 'nosniff');
    h.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    h.set('Content-Security-Policy', CSP);
    if (asset.ok && (target || url.pathname.endsWith('.md'))) h.set('Content-Type', 'text/markdown; charset=utf-8');
    if (isPage) {
      h.append('Vary', 'Accept, User-Agent');
      if (asset.ok && !markdown) h.set('Link', `<${url.pathname}index.md>; rel="alternate"; type="text/markdown"`);
    }
    // style.css and app.js carry a content hash in ?v=, fonts never change
    const hashed = (/^\/(style\.css|app\.js)$/.test(url.pathname) && url.searchParams.has('v')) || url.pathname.startsWith('/assets/fonts/');
    if (asset.ok && hashed) h.set('Cache-Control', 'public, max-age=31536000, immutable');
    if (asset.ok && (OPEN.test(url.pathname) || target)) {
      h.set('Access-Control-Allow-Origin', '*');
      h.set('Cache-Control', 'public, max-age=3600');
    }
    return res;
  },
};
