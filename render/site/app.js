// Website behaviour: command palette, live filters with shareable URLs, compare, matrix sorting and
// evidence popovers. Plain JS, no dependencies. Every page works without it: this only adds to the
// server-rendered HTML. No inline styles or scripts (see the CSP in _headers); CSSOM writes are fine.
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  document.documentElement.classList.add('js');
  const mac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  $$('[data-mod]').forEach(k => { k.textContent = mac ? '⌘' : 'Ctrl'; });
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const MARK = { y: 'Yes', p: 'Partial', n: 'No', na: 'n/a' };
  const ORDER = { y: 3, p: 2, n: 1, na: 0 };
  const TIER = { S: 5, A: 4, B: 3, C: 2, D: 1 };
  const GLYPH = {
    check: '<path d="M20 6 9 17l-5-5"/>',
    wrench: '<path d="M14.7 6.3a4 4 0 0 0 5 5L21 13l-8 8-3-3 6.3-6.3a4 4 0 0 1-5-5L13 5z"/>',
    columns: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M12 4v16"/>',
    download: '<path d="M12 4v12m-5-5 5 5 5-5M5 20h14"/>',
    book: '<path d="M4 5a2 2 0 0 1 2-2h14v16H6a2 2 0 0 0-2 2z"/><path d="M4 19V5"/>',
    pr: '<circle cx="6" cy="6" r="2"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="18" r="2"/><path d="M6 8v8M18 16V9a3 3 0 0 0-3-3h-4m2-2-2 2 2 2"/>',
    star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
  };
  let data;
  const getData = () => (data ||= fetch('/data.json').then(r => r.json()));
  const path = u => new URL(u, location.href).pathname;

  // ---------- toast and copy
  const toast = Object.assign(document.createElement('div'), { className: 'toast', role: 'status' });
  document.body.append(toast);
  let toastTimer;
  const say = msg => { toast.textContent = msg; toast.classList.add('on'); clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove('on'), 1600); };
  const copy = text => navigator.clipboard.writeText(text).then(() => say('Copied'), () => say('Copy failed: select and copy by hand'));
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-copy]');
    if (b) copy(b.dataset.copy);
    const x = e.target.closest('[data-close]');
    if (x) x.closest('dialog')?.close();
  });

  // ---------- hero: "who supports X?" tabs
  const askTabs = $$('[data-ask]');
  const pickAsk = t => {
    askTabs.forEach(b => { b.setAttribute('aria-selected', b === t); b.tabIndex = b === t ? 0 : -1; });
    $$('.ask-panel').forEach(p => p.classList.toggle('on', p.id === `ask-${t.dataset.ask}`));
  };
  askTabs.forEach((t, i) => {
    t.addEventListener('click', () => pickAsk(t));
    t.addEventListener('keydown', e => {
      const n = askTabs.length;
      const j = { ArrowRight: i + 1, ArrowLeft: i - 1 + n, Home: 0, End: n - 1 }[e.key];
      if (j === undefined) return;
      e.preventDefault();
      const next = askTabs[j % n];
      pickAsk(next);
      next.focus();
    });
  });

  // ---------- recent changes: one kind at a time. The CSS hides rows by the section's data-f
  const changes = $('#changes');
  if (changes) {
    const clTabs = $$('[data-cl]', changes);
    const empty = $('.cl-empty', changes);
    const recent = $$('#cl-recent li', changes);
    clTabs.forEach(b => b.addEventListener('click', () => {
      const f = b.dataset.cl;
      clTabs.forEach(t => t.setAttribute('aria-pressed', t === b));
      changes.dataset.f = f;
      if (empty) empty.hidden = recent.some(li => f === 'all' || li.dataset.kind === f);
    }));
  }

  // ---------- evidence popover (matrix and compare cells)
  // Hidden from assistive tech until it shows: an empty tooltip has no accessible name
  const pop = Object.assign(document.createElement('div'), { className: 'pop', role: 'tooltip' });
  pop.setAttribute('aria-hidden', 'true');
  pop.inert = true;
  document.body.append(pop);
  let popFor = null;
  // Mouse shows the popover on hover; touch and pen show it on the first tap, with a link to the source
  let touch = matchMedia('(hover: none)').matches;
  document.addEventListener('pointerdown', e => { touch = e.pointerType !== 'mouse'; }, { passive: true, capture: true });
  $$('.matrix td a[title]').forEach(a => { a.dataset.ev = a.title; a.removeAttribute('title'); });
  function showPop(el) {
    popFor = el;
    const v = el.dataset.v;
    const head = el.dataset.head || '';
    pop.innerHTML = `<div class="ph">${v && MARK[v] ? `<img src="/assets/icons/${v}.svg" alt="">${MARK[v]}` : esc(el.textContent.trim())}${head ? ` <span class="muted">· ${esc(head)}</span>` : ''}</div>`
      + `<div>${esc(el.dataset.ev).replace(/`([^`]+)`/g, '<code>$1</code>')}</div>`
      + `<div class="pm">${esc(el.dataset.m)}${el.dataset.ck ? ` · checked ${esc(el.dataset.ck)}` : ''}</div>`
      + (touch && el.href ? `<div class="pm"><a href="${esc(el.href)}" rel="nofollow">Open source ↗</a></div>` : '');
    pop.classList.toggle('touch', touch);
    const r = el.getBoundingClientRect();
    pop.classList.add('on');
    pop.setAttribute('aria-hidden', 'false');
    pop.inert = false;
    const w = pop.offsetWidth, h = pop.offsetHeight;
    const x = Math.min(Math.max(8, r.left + r.width / 2 - w / 2), innerWidth - w - 8);
    let y = r.bottom + 8;
    if (y + h > innerHeight - 8) y = r.top - h - 8;
    pop.style.left = `${x}px`;
    pop.style.top = `${Math.max(8, y)}px`;
  }
  const hidePop = () => { pop.classList.remove('on'); pop.setAttribute('aria-hidden', 'true'); pop.inert = true; popFor = null; };
  document.addEventListener('pointerover', e => { if (e.pointerType !== 'mouse') return; touch = false; const el = e.target.closest('[data-ev]'); if (el) showPop(el); });
  document.addEventListener('pointerout', e => { if (e.pointerType !== 'mouse') return; const el = e.target.closest('[data-ev]'); if (el && !el.contains(e.relatedTarget)) hidePop(); });
  // A tap focuses the cell before its click; leave touch to the click handler so the first tap shows the evidence
  document.addEventListener('focusin', e => { const el = e.target.closest('[data-ev]'); if (el && !touch) showPop(el); });
  document.addEventListener('focusout', e => { if (e.target.closest('[data-ev]')) hidePop(); });
  document.addEventListener('click', e => {
    if (!touch) return;
    const el = e.target.closest('[data-ev]');
    if (el && popFor !== el) { e.preventDefault(); showPop(el); } else if (!e.target.closest('.pop')) hidePop();
  });
  addEventListener('scroll', () => { if (!touch) hidePop(); }, { passive: true, capture: true });

  // ---------- filters on the home page, mirrored in the URL (?q=&g=&f=)
  const board = $('#board');
  let setFeature = null;
  if (board) {
    const q = $('#q'), count = $('#count'), reset = $('#reset');
    const featBtns = $$('[data-feat]'), groupBtns = $$('[data-g]');
    const cards = $$('.card'), rows = $$('.matrix tbody tr[data-client]'), lanes = $$('.lane');
    const total = cards.length;
    const params = new URLSearchParams(location.search);
    const known = (attr, v) => featBtns.concat(groupBtns).some(b => b.dataset[attr] === v);
    const state = { q: params.get('q') || '', g: known('g', params.get('g')) ? params.get('g') : 'all', f: new Set((params.get('f') || '').split(',').filter(f => known('feat', f))) };
    const norm = s => s.toLowerCase().replace(/\b([sabcd])[\s-]*tier\b/g, '$1-tier').trim();
    const matches = el => {
      const has = new Set(`${el.dataset.y} ${el.dataset.p}`.split(' ').filter(Boolean));
      if (state.g !== 'all' && el.dataset.group !== state.g) return false;
      for (const f of state.f) if (!has.has(f)) return false;
      const words = norm(state.q).split(/\s+/).filter(Boolean);
      return words.every(w => el.dataset.hay.includes(w));
    };
    const applyFilters = (push = true) => {
      let n = 0;
      for (const c of cards) { const ok = matches(c); c.classList.toggle('out', !ok); if (ok) n++; }
      for (const r of rows) r.hidden = !matches(r);
      for (const tb of $$('.matrix tbody')) $('.grp', tb).hidden = !$('tr[data-client]:not([hidden])', tb);
      for (const l of lanes) l.classList.toggle('none', !l.querySelector('.card:not(.out)') && l.querySelector('.card'));
      const active = state.q || state.g !== 'all' || state.f.size;
      board.classList.toggle('filtering', !!active);
      count.innerHTML = `<b>${n}</b> of ${total} clients`;
      reset.classList.toggle('on', !!active);
      q.value = state.q;
      featBtns.forEach(b => b.setAttribute('aria-pressed', state.f.has(b.dataset.feat)));
      groupBtns.forEach(b => b.setAttribute('aria-pressed', b.dataset.g === state.g));
      $$('.matrix [data-k]').forEach(c => c.classList.toggle('hl', state.f.has(c.dataset.k)));
      if (push) {
        const p = new URLSearchParams();
        if (state.q) p.set('q', state.q);
        if (state.g !== 'all') p.set('g', state.g);
        if (state.f.size) p.set('f', [...state.f].join(','));
        const s = p.toString();
        history.replaceState(null, '', `${location.pathname}${s ? `?${s}` : ''}${location.hash}`);
      }
    };
    q.addEventListener('input', () => { state.q = q.value; applyFilters(); });
    featBtns.forEach(b => b.addEventListener('click', () => { const f = b.dataset.feat; state.f.has(f) ? state.f.delete(f) : state.f.add(f); applyFilters(); }));
    groupBtns.forEach(b => b.addEventListener('click', () => { state.g = b.dataset.g; applyFilters(); }));
    reset.addEventListener('click', () => { state.q = ''; state.g = 'all'; state.f.clear(); applyFilters(); q.focus(); });
    setFeature = f => { state.f = new Set([f]); applyFilters(); };
    $$('[data-apply]').forEach(b => b.addEventListener('click', () => { setFeature(b.dataset.apply); board.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' }); }));
    applyFilters(false);
  }

  // ---------- matrix sorting
  $$('.matrix .sort').forEach(btn => btn.addEventListener('click', () => {
    const table = btn.closest('table');
    const key = btn.dataset.sort;
    const dir = btn.dataset.dir === 'desc' ? 'asc' : btn.dataset.dir === 'asc' ? '' : 'desc';
    $$('.sort', table).forEach(b => { b.dataset.dir = ''; b.removeAttribute('aria-sort'); });
    btn.dataset.dir = dir;
    btn.closest('th').setAttribute('aria-sort', dir ? (dir === 'desc' ? 'descending' : 'ascending') : 'none');
    for (const tb of $$('tbody', table)) {
      const rs = $$('tr[data-client]', tb);
      const val = r => {
        if (key === 'name') return r.dataset.name;
        if (key === 'tier') return TIER[r.dataset.tier] * 100 + +r.dataset.score;
        if (key === 'fix') return +r.dataset.fix;
        const cell = r.querySelector(`[data-k="${key}"] a`);
        if (key === 'protocol') return cell ? cell.textContent.replace(/\D/g, '') || '0' : '0';
        return cell ? ORDER[cell.dataset.v] ?? 0 : 0;
      };
      const byOrder = (a, b) => +a.dataset.i - +b.dataset.i;
      rs.sort(!dir ? byOrder : (a, b) => {
        const x = val(a), y = val(b);
        const c = typeof x === 'string' ? x.localeCompare(y) : x - y;
        return (dir === 'asc' ? c : -c) || byOrder(a, b);
      });
      rs.forEach(r => tb.append(r));
    }
  }));

  // ---------- compare: pick up to 4 clients, state in #compare=a,b
  const cmpDlg = $('#compare');
  const sel = [];
  const tray = $('#tray');
  const MAX = 4;
  const fromHash = () => (location.hash.match(/compare=([\w,-]+)/) || [])[1]?.split(',').filter(Boolean) || [];
  function syncCompare() {
    $$('[data-cmp]').forEach(b => {
      const on = sel.includes(b.dataset.cmp);
      b.setAttribute('aria-pressed', on);
      b.textContent = on ? '✓' : '+';
    });
    if (!tray) return;
    tray.classList.toggle('on', sel.length > 0);
    $('.lgs', tray).innerHTML = sel.map(s => { const c = $(`.card[data-client="${s}"] img`); return `<span class="lg">${c ? `<img src="${c.getAttribute('src')}" alt="">` : ''}</span>`; }).join('');
    $('.txt', tray).textContent = sel.length < 2 ? 'Pick one more to compare' : `${sel.length} selected`;
    $('#tray-go').disabled = sel.length < 2;
  }
  function toggleCmp(slug) {
    const i = sel.indexOf(slug);
    if (i >= 0) sel.splice(i, 1);
    else if (sel.length >= MAX) return say(`Compare up to ${MAX} at a time`);
    else sel.push(slug);
    syncCompare();
    if (cmpDlg?.open) renderCompare();
  }
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-cmp]');
    if (b) { e.preventDefault(); toggleCmp(b.dataset.cmp); }
  });
  async function renderCompare() {
    const d = await getData();
    const cs = sel.map(s => d.clients.find(c => c.slug === s)).filter(Boolean);
    const body = $('.cmp-body', cmpDlg);
    const head = `<tr><th></th>${cs.map(c => `<th><a class="who" href="/clients/${esc(c.slug)}/"><span class="lg"><img src="${esc(path(c.logo))}" alt=""></span>${esc(c.name)}<span class="tb t-${c.tier}">${c.tier}</span></a><button type="button" class="btn sm ghost" data-cmp="${esc(c.slug)}">Remove</button></th>`).join('')}</tr>`;
    const row = f => {
      const vals = cs.map(c => c.cells[f.id]);
      const same = vals.every(v => v.value === vals[0].value);
      return `<tr class="${same ? 'same' : 'diff'}"><th>${esc(f.label)}${f.kind === 'harness' ? ' <span class="tag">harness</span>' : ''}</th>${vals.map(v => `<td data-k="${f.id}"><span data-ev="${esc(v.evidence)}" data-v="${f.id === 'protocol' ? '' : v.value}" data-m="${esc(v.method)}" data-ck="${esc(v.checked)}" tabindex="0">${f.id === 'protocol' ? `<span class="pv">${esc(v.value)}</span>` : `<img src="/assets/icons/${v.value}.svg" alt="${MARK[v.value]}" width="18" height="18">${v.label ? `<span class="lbl">${esc(v.label)}</span>` : ''}`}</span></td>`).join('')}</tr>`;
    };
    const fixSame = cs.every(c => c.mcp_bugs_fixed_text === cs[0].mcp_bugs_fixed_text);
    const fixRow = `<tr class="${fixSame ? 'same' : 'diff'}"><th>MCP bugs fixed</th>${cs.map(c => `<td class="fix">${esc(c.mcp_bugs_fixed_text)}</td>`).join('')}</tr>`;
    body.innerHTML = cs.length ? `<table class="cmp-table"><thead>${head}</thead><tbody>${d.features.map(row).join('')}${fixRow}</tbody></table>` : '<p class="pal-empty">Pick clients with the + on the tier list.</p>';
    const opts = d.clients.filter(c => !sel.includes(c.slug));
    $('#cmp-pick').innerHTML = `<option value="">Add a client…</option>${opts.map(c => `<option value="${esc(c.slug)}">${esc(c.name)} (${c.tier})</option>`).join('')}`;
    $('#cmp-pick').disabled = sel.length >= MAX;
    const share = `${location.origin}/#compare=${sel.join(',')}`;
    $('#cmp-share').dataset.copy = share;
    if (location.hash !== `#compare=${sel.join(',')}`) history.replaceState(null, '', `${location.pathname}${location.search}#compare=${sel.join(',')}`);
  }
  async function openCompare() {
    if (!cmpDlg) return;
    await renderCompare();
    if (!cmpDlg.open) cmpDlg.showModal();
  }
  if (cmpDlg) {
    $('#tray-go').addEventListener('click', openCompare);
    $('#tray-clear').addEventListener('click', () => { sel.length = 0; syncCompare(); });
    $('#cmp-pick').addEventListener('change', e => { if (e.target.value) toggleCmp(e.target.value); });
    $('#cmp-diff').addEventListener('change', e => $('.cmp-body', cmpDlg).classList.toggle('only-diff', e.target.checked));
    cmpDlg.addEventListener('close', () => { if (/compare=/.test(location.hash)) history.replaceState(null, '', location.pathname + location.search); });
    cmpDlg.addEventListener('click', e => { if (e.target === cmpDlg) cmpDlg.close(); });
    const initial = fromHash().filter(s => $(`.card[data-client="${s}"]`));
    if (initial.length) { initial.slice(0, MAX).forEach(s => sel.includes(s) || sel.push(s)); syncCompare(); openCompare(); }
  }
  syncCompare();

  // ---------- command palette: Cmd/Ctrl+K anywhere, / on pages without a filter box
  const pal = $('#palette');
  const pin = $('#pal-q'), plist = $('#pal-list');
  let items = [], active = 0, shown = [];
  const repo = pal?.dataset.repo || '';
  function fuzzy(q, text) {
    if (!q) return 1;
    const t = text.toLowerCase();
    const i = t.indexOf(q);
    if (i >= 0) return 100 - i + (i === 0 || /\W/.test(t[i - 1]) ? 50 : 0);
    let j = 0, s = 0, last = -2;
    for (let k = 0; k < t.length && j < q.length; k++) if (t[k] === q[j]) { s += last === k - 1 ? 3 : 1; last = k; j++; }
    return j === q.length ? s : 0;
  }
  const hl = (text, q) => {
    if (!q) return esc(text);
    const i = text.toLowerCase().indexOf(q);
    return i < 0 ? esc(text) : `${esc(text.slice(0, i))}<mark>${esc(text.slice(i, i + q.length))}</mark>${esc(text.slice(i + q.length))}`;
  };
  async function buildItems() {
    const d = await getData();
    const feats = d.features.filter(f => f.id !== 'protocol');
    const labels = Object.fromEntries(d.features.map(f => [f.id, f.label]));
    items = [
      ...d.clients.map(c => {
        const ys = feats.filter(f => c.cells[f.id].value === 'y');
        return { kind: 'Clients', title: c.name, sub: `${c.tier} tier · ${c.group === 'cli' ? 'CLI' : 'App or IDE'} · ${ys.length}/${feats.length} features · spec ${c.cells.protocol.value}`, key: `${c.name} ${c.slug} ${c.tier}-tier ${c.group} ${ys.map(f => labels[f.id]).join(' ')}`, href: `/clients/${c.slug}/`, logo: path(c.logo), tier: c.tier };
      }),
      ...feats.map(f => {
        const who = d.clients.filter(c => c.cells[f.id].value === 'y');
        const part = d.clients.filter(c => c.cells[f.id].value === 'p').length;
        return { kind: 'Features', title: `Who supports ${f.label}?`, sub: `${who.length} of ${d.clients.length}${part ? ` (+${part} partly)` : ''}: ${who.map(c => c.name).join(', ') || 'nobody yet'}`, key: `${f.label} ${f.id} ${f.definition}`, glyph: f.kind === 'harness' ? 'wrench' : 'check', feature: f.id, href: `/?f=${f.id}#board` };
      }),
      { kind: 'Actions', title: 'Compare clients side by side', sub: 'Pick 2 to 4 clients', key: 'compare versus vs diff', glyph: 'columns', action: 'compare' },
      { kind: 'Actions', title: 'Download the data', sub: 'data.json, MIT licensed', key: 'json data download api', glyph: 'download', href: '/data.json' },
      { kind: 'Actions', title: 'How the tiers are scored', sub: 'Rubric and methodology', key: 'methodology rubric scoring how', glyph: 'book', href: `${repo}/blob/main/methodology/RUBRIC.md` },
      { kind: 'Actions', title: 'Fix a wrong cell', sub: 'Open a pull request with a source', key: 'contribute pull request wrong fix edit github', glyph: 'pr', href: `${repo}/blob/main/CONTRIBUTING.md` },
      { kind: 'Actions', title: 'Open the GitHub repo', sub: repo.replace('https://github.com/', ''), key: 'github star repo source', glyph: 'star', href: repo },
    ];
  }
  function renderPal() {
    const q = pin.value.trim().toLowerCase().replace(/\b([sabcd])[\s-]*tier\b/g, '$1-tier');
    // Fuzzy on the title, plain substring on the keywords, so 'tasks' does not match every long definition
    const scored = items.map(it => ({ it, s: Math.max(fuzzy(q, it.title) * 2, it.key.toLowerCase().includes(q) ? 40 : 0) })).filter(x => x.s > 0);
    if (q) scored.sort((a, b) => b.s - a.s);
    const caps = { Clients: q ? 8 : 6, Features: q ? 5 : 4, Actions: q ? 4 : 5 };
    shown = [];
    let html = '';
    for (const kind of q ? [...new Set(scored.map(x => x.it.kind))] : ['Clients', 'Features', 'Actions']) {
      const group = scored.filter(x => x.it.kind === kind).slice(0, caps[kind]);
      if (!group.length) continue;
      html += `<li class="pal-sec" role="presentation">${kind}</li>`;
      for (const { it } of group) {
        const i = shown.push(it) - 1;
        const icon = it.logo ? `<span class="lg"><img src="${esc(it.logo)}" alt=""></span>` : `<span class="gl"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true">${GLYPH[it.glyph] || ''}</svg></span>`;
        html += `<li class="pal-item" role="option" id="pi-${i}" data-i="${i}" aria-selected="false">${icon}<span class="tt"><b>${hl(it.title, q)}</b><small>${esc(it.sub)}</small></span>${it.tier ? `<span class="tb t-${it.tier}">${it.tier}</span>` : ''}<span class="go">↵</span></li>`;
      }
    }
    plist.innerHTML = html || `<li class="pal-empty">Nothing matches "${esc(pin.value)}". Try a client, a tier ("a tier") or a feature ("tasks").</li>`;
    setActive(0);
  }
  function setActive(i) {
    if (!shown.length) return;
    active = (i + shown.length) % shown.length;
    $$('.pal-item', plist).forEach(el => el.setAttribute('aria-selected', +el.dataset.i === active));
    const el = $(`#pi-${active}`);
    el?.scrollIntoView({ block: 'nearest' });
    pin.setAttribute('aria-activedescendant', `pi-${active}`);
  }
  function run(it, newTab) {
    if (!it) return;
    if (it.feature && setFeature && !newTab) { pal.close(); setFeature(it.feature); board.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' }); return; }
    if (it.action === 'compare') {
      pal.close();
      if (cmpDlg) { sel.length < 2 ? (say('Tap + on two clients to compare them'), board?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' })) : openCompare(); } else location.href = '/#board';
      return;
    }
    if (newTab) open(it.href, '_blank', 'noopener'); else location.href = it.href;
  }
  async function openPal(seed = '') {
    if (!pal) return;
    if (!pal.open) pal.showModal();
    pin.value = seed;
    plist.innerHTML = '<li class="pal-empty">Loading…</li>';
    try { await buildItems(); renderPal(); } catch { plist.innerHTML = '<li class="pal-empty">Could not load the data. Check your connection.</li>'; }
    pin.focus();
  }
  if (pal) {
    pin.addEventListener('input', renderPal);
    pin.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown') { e.preventDefault(); setActive(active + 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(active - 1); }
      else if (e.key === 'Enter') { e.preventDefault(); run(shown[active], e.metaKey || e.ctrlKey); }
    });
    plist.addEventListener('pointermove', e => { const li = e.target.closest('.pal-item'); if (li && +li.dataset.i !== active) setActive(+li.dataset.i); });
    plist.addEventListener('click', e => { const li = e.target.closest('.pal-item'); if (li) run(shown[+li.dataset.i], e.metaKey || e.ctrlKey); });
    pal.addEventListener('click', e => { if (e.target === pal) pal.close(); });
    $$('[data-palette]').forEach(b => b.addEventListener('click', () => openPal()));
  }
  document.addEventListener('keydown', e => {
    const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName) || document.activeElement?.isContentEditable;
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); pal?.open ? pal.close() : openPal(); return; }
    if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === '/') { e.preventDefault(); const q = $('#q'); if (q) { q.focus(); q.select(); } else openPal(); }
    if (e.key === 'Escape') hidePop();
  });
})();
