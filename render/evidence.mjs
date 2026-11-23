// Evidence strings are a small Markdown subset, so long proofs stay readable:
// paragraphs, "- " bullet lists, **bold**, *italic*, `code` and [text](https://...) links.
import { esc, attr } from './images.mjs';

const LINK_ONE = /^\[([^\]]+)\]\((https:\/\/[^\s)]+)\)$/;

// Blocks: a run of "- " lines is a list, anything else up to a blank line is a paragraph
export function blocks(s) {
  const out = [];
  for (const line of String(s).trim().split('\n')) {
    const t = line.trim();
    const item = t.match(/^[-*] (.*)$/);
    const last = out.at(-1);
    if (!t) out.push(null);
    else if (item) last?.list ? last.list.push(item[1]) : out.push({ list: [item[1]] });
    else if (last?.text !== undefined) last.text += ' ' + t;
    else out.push({ text: t });
  }
  return out.filter(Boolean);
}

// Code spans and link targets are cut out first, so ** or _ inside them stay literal
function inline(s, code, link, bold, ital, text) {
  const marks = t => text(t)
    .replace(/\*\*([^*]+)\*\*/g, (_, x) => bold(x))
    .replace(/(^|[^\w*])[*_]([^*_\s][^*_]*?)[*_](?=$|[^\w*])/g, (_, p, x) => p + ital(x));
  return String(s).split(/(`[^`]+`)/).map((part, i) => {
    if (i % 2) return code(part.slice(1, -1));
    return part.split(/(\[[^\]]+\]\(https:\/\/[^\s)]+\))/).map((seg, j) => {
      if (!(j % 2)) return marks(seg);
      const [, t, u] = seg.match(LINK_ONE);
      return link(marks(t), u);
    }).join('');
  }).join('');
}

export const inlineHtml = s => inline(s, t => `<code>${esc(t)}</code>`, (t, u) => `<a href="${attr(u)}" rel="nofollow">${t}</a>`, t => `<strong>${t}</strong>`, t => `<em>${t}</em>`, esc);

export const evidenceHtml = s => blocks(s).map(b => (b.list ? `<ul>${b.list.map(i => `<li>${inlineHtml(i)}</li>`).join('')}</ul>` : `<p>${inlineHtml(b.text)}</p>`)).join('');

export const inlinePlain = s => inline(s, t => t, t => t, t => t, t => t, t => t);
const plainBlocks = s => blocks(s).flatMap(b => (b.list ? b.list.map(inlinePlain) : [inlinePlain(b.text)]));

// One line of plain text, for title attributes, FAQ answers, llms.txt and JSON-LD
export const evidencePlain = s => {
  const parts = plainBlocks(s);
  return (parts.length > 1 ? parts.map(p => (/[.!?:;]$/.test(p) ? p : p + '.')) : parts).join(' ').replace(/\s+/g, ' ').trim();
};

// The opening paragraph, for the short card text that links to the full proof
export const evidenceLead = s => {
  const [first] = blocks(s);
  return inlinePlain(first.list ? first.list[0] : first.text);
};

// GitHub table cell: inline Markdown kept, lists as <br>• lines, pipes escaped
export const evidenceTableCell = s => blocks(s).map(b => (b.list ? b.list.map(i => `• ${i}`).join('<br>') : b.text)).join('<br>').replace(/\|/g, '\\|');
