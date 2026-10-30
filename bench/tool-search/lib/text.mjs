// Tokenizer shared by the lexical rankers: split snake_case, kebab-case and camelCase,
// lowercase, drop English stop words, optional Porter stemming (Codex's bm25 crate uses
// an English stemmer and stop word list, so the default here does the same).

export const STOPWORDS = new Set(`a about above after again against all am an and any are as at be because been before
being below between both but by can could did do does doing down during each few for from further had has have having
he her here hers herself him himself his how i if in into is it its itself just me more most my myself no nor not now
of off on once only or other our ours ourselves out over own same she should so some such than that the their theirs
them themselves then there these they this those through to too under until up very was we were what when where which
while who whom why will with would you your yours yourself yourselves`.split(/\s+/));

export function splitWords(text) {
  return String(text || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

export function tokenize(text, { stem = true } = {}) {
  const words = splitWords(text).filter((w) => !STOPWORDS.has(w));
  return stem ? words.map(porter) : words;
}

// Porter (1980) stemmer, compact implementation.
const step2list = { ational: 'ate', tional: 'tion', enci: 'ence', anci: 'ance', izer: 'ize', bli: 'ble', alli: 'al', entli: 'ent', eli: 'e', ousli: 'ous', ization: 'ize', ation: 'ate', ator: 'ate', alism: 'al', iveness: 'ive', fulness: 'ful', ousness: 'ous', aliti: 'al', iviti: 'ive', biliti: 'ble', logi: 'log' };
const step3list = { icate: 'ic', ative: '', alize: 'al', iciti: 'ic', ical: 'ic', ful: '', ness: '' };
const c = '[^aeiou]', v = '[aeiouy]', C = c + '[^aeiouy]*', V = v + '[aeiou]*';
const mgr0 = new RegExp('^(' + C + ')?' + V + C);
const meq1 = new RegExp('^(' + C + ')?' + V + C + '(' + V + ')?$');
const mgr1 = new RegExp('^(' + C + ')?' + V + C + V + C);
const sV = new RegExp('^(' + C + ')?' + v);

function porter(w) {
  if (w.length < 3 || /\d/.test(w)) return w;
  let stem, suffix, re, re2, re3, re4;
  const first = w[0];
  if (first === 'y') w = 'Y' + w.slice(1);
  re = /^(.+?)(ss|i)es$/; re2 = /^(.+?)([^s])s$/;
  if (re.test(w)) w = w.replace(re, '$1$2'); else if (re2.test(w)) w = w.replace(re2, '$1$2');
  re = /^(.+?)eed$/; re2 = /^(.+?)(ed|ing)$/;
  if (re.test(w)) {
    const fp = re.exec(w);
    if (mgr0.test(fp[1])) w = w.replace(/.$/, '');
  } else if (re2.test(w)) {
    const fp = re2.exec(w);
    stem = fp[1];
    if (sV.test(stem)) {
      w = stem;
      re2 = /(at|bl|iz)$/; re3 = /([^aeiouylsz])\1$/; re4 = new RegExp('^' + C + v + '[^aeiouwxy]$');
      if (re2.test(w)) w += 'e';
      else if (re3.test(w)) w = w.replace(/.$/, '');
      else if (re4.test(w)) w += 'e';
    }
  }
  re = /^(.+?)y$/;
  if (re.test(w)) { stem = re.exec(w)[1]; if (sV.test(stem)) w = stem + 'i'; }
  re = /^(.+?)(ational|tional|enci|anci|izer|bli|alli|entli|eli|ousli|ization|ation|ator|alism|iveness|fulness|ousness|aliti|iviti|biliti|logi)$/;
  if (re.test(w)) { const fp = re.exec(w); stem = fp[1]; suffix = fp[2]; if (mgr0.test(stem)) w = stem + step2list[suffix]; }
  re = /^(.+?)(icate|ative|alize|iciti|ical|ful|ness)$/;
  if (re.test(w)) { const fp = re.exec(w); stem = fp[1]; suffix = fp[2]; if (mgr0.test(stem)) w = stem + step3list[suffix]; }
  re = /^(.+?)(al|ance|ence|er|ic|able|ible|ant|ement|ment|ent|ou|ism|ate|iti|ous|ive|ize)$/; re2 = /^(.+?)(s|t)(ion)$/;
  if (re.test(w)) { stem = re.exec(w)[1]; if (mgr1.test(stem)) w = stem; }
  else if (re2.test(w)) { const fp = re2.exec(w); stem = fp[1] + fp[2]; if (mgr1.test(stem)) w = stem; }
  re = /^(.+?)e$/;
  if (re.test(w)) {
    stem = re.exec(w)[1]; re2 = new RegExp('^' + C + v + '[^aeiouwxy]$');
    if (mgr1.test(stem) || (meq1.test(stem) && !re2.test(stem))) w = stem;
  }
  if (/ll$/.test(w) && mgr1.test(w)) w = w.replace(/.$/, '');
  if (first === 'y') w = 'y' + w.slice(1);
  return w;
}

// Clients expose MCP tools under a server-qualified name (Claude Code and Codex use
// mcp__<server>__<tool>), so the server id is part of the indexed name.
export function qualifiedName(tool) {
  return `mcp__${tool.server}__${tool.name}`;
}

// Text a tool is indexed by: qualified name (split into words), description, input param names.
export function toolFields(tool) {
  return { name: splitWords(qualifiedName(tool)).filter((w) => w !== 'mcp').join(' '), description: tool.description, params: tool.params.join(' ') };
}
