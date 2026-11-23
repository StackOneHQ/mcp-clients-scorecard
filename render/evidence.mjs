// Evidence strings are a small Markdown subset, so long proofs stay readable:
// paragraphs, "- " bullet lists, **bold**, *italic*, `code` and [text](https://...) links.
import { esc, attr } from './images.mjs';

// Blocks: "- " lines form a list (indented lines continue an item), anything else up to a blank line is a paragraph
export function blocks(s) {
  const out = [];
  let gap = false;
  for (const line of String(s).trim().split('\n')) {
    const t = line.trim();
    const item = t.match(/^[-*] (.*)$/);
    const last = out.at(-1);
    if (!t) gap = true;
    else if (item && last?.list) last.list.push(item[1]);
    else if (item) out.push({ list: [item[1]] });
    else if (last?.list && !gap && /^\s/.test(line)) last.list[last.list.length - 1] += ' ' + t;
    else if (last?.text !== undefined && !gap) last.text += ' ' + t;
    else out.push({ text: t });
    if (t) gap = false;
  }
  return out;
}

// Code spans and links are held aside behind \0n\0 placeholders while ** and * are applied to the whole line,
// so marks can wrap them and marks inside them stay literal. Labels and URLs exclude brackets so a run of
// unclosed "[" is scanned once, not once per bracket.
const LINK = /\[([^[\]]+)\]\((https:\/\/(?:[^\s()[\]\0]|\([^\s()[\]\0]*\))+)\)/g;

function inline(s, code, link, bold, ital, text) {
  const held = [];
  const hold = out => `\0${held.push(out) - 1}\0`;
  const restore = t => t.replace(/\0(\d+)\0/g, (_, i) => held[i]);
  const marks = t => text(t)
    .replace(/\*\*((?:[^*]|\*(?!\*))+?)\*\*/g, (_, x) => bold(x))
    .replace(/(^|[^\w*])\*([\w\0](?:[^*]*?[^\s*])?)\*(?=$|[^\w*])/g, (_, p, x) => p + ital(x));
  const masked = String(s).replace(/\0/g, '')
    .replace(/`[^`]+`/g, m => hold(code(m.slice(1, -1))))
    .replace(LINK, (_, t, u) => hold(link(restore(marks(t)), u)));
  return restore(marks(masked));
}

export const inlineHtml = s => inline(s, t => `<code>${esc(t)}</code>`, (t, u) => `<a href="${attr(u)}" rel="nofollow">${t}</a>`, t => `<strong>${t}</strong>`, t => `<em>${t}</em>`, esc);

export const evidenceHtml = s => blocks(s).map(b => (b.list ? `<ul>${b.list.map(i => `<li>${inlineHtml(i)}</li>`).join('')}</ul>` : `<p>${inlineHtml(b.text)}</p>`)).join('');

const same = t => t;
export const inlinePlain = s => inline(s, same, same, same, same, same);
const inlineWithUrls = s => inline(s, same, (t, u) => `${t} (${u})`, same, same, same);
const plainBlocks = s => blocks(s).flatMap(b => (b.list ? b.list.map(inlineWithUrls) : [inlineWithUrls(b.text)]));

// One line of plain text, for the matrix popover, FAQ answers, llms.txt, JSON-LD and data.json
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
