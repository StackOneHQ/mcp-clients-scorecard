import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evidenceHtml, evidencePlain, evidenceLead, evidenceTableCell } from './evidence.mjs';

const ev = 'Docs: Code Mode ships **experimental and off by default**.\n\n- Turned on with `CODE_MODE=1`, see [the docs](https://example.com/a?b=1&c=2).\n- The gate is *not* open to every account';

test('evidence renders paragraphs, lists, bold, italic, code and https links', () => {
  assert.equal(evidenceHtml(ev),
    '<p>Docs: Code Mode ships <strong>experimental and off by default</strong>.</p>'
    + '<ul><li>Turned on with <code>CODE_MODE=1</code>, see <a href="https://example.com/a?b=1&amp;c=2" rel="nofollow">the docs</a>.</li>'
    + '<li>The gate is <em>not</em> open to every account</li></ul>');
});

test('evidence escapes HTML and leaves marks inside code and identifiers alone', () => {
  assert.equal(evidenceHtml('<script>x</script> and [bad](javascript:alert(1))'), '<p>&lt;script&gt;x&lt;/script&gt; and [bad](javascript:alert(1))</p>');
  assert.equal(evidenceHtml('`mcp__**x**` and snake_case_name'), '<p><code>mcp__**x**</code> and snake_case_name</p>');
  assert.equal(evidenceHtml('`<b>&</b>`'), '<p><code>&lt;b&gt;&amp;&lt;/b&gt;</code></p>');
});

test('marks can wrap code spans and links, and a lone * in a glob stays', () => {
  assert.equal(evidenceHtml('**never sets `clientMetadataUrl`** in [the `x` doc](https://a.b/c)'),
    '<p><strong>never sets <code>clientMetadataUrl</code></strong> in <a href="https://a.b/c" rel="nofollow">the <code>x</code> doc</a></p>');
  assert.equal(evidencePlain('Reads `crates/*.rs` and *args'), 'Reads crates/*.rs and *args');
  assert.equal(evidenceHtml('Matches *.ts and *.js files'), '<p>Matches *.ts and *.js files</p>');
  assert.equal(evidenceHtml('*`x`* and *[a](https://a.b)*'), '<p><em><code>x</code></em> and <em><a href="https://a.b" rel="nofollow">a</a></em></p>');
  assert.equal(evidenceHtml('**bold with *ital* inside**'), '<p><strong>bold with <em>ital</em> inside</strong></p>');
  assert.equal(evidenceHtml('see [wiki](https://en.wikipedia.org/wiki/Foo_(bar))'), '<p>see <a href="https://en.wikipedia.org/wiki/Foo_(bar)" rel="nofollow">wiki</a></p>');
});

test('blank lines between bullets and indented continuations stay in one list', () => {
  assert.equal(evidenceHtml('a\n\n- x\n\n- y\n  continues\n\nafter'), '<p>a</p><ul><li>x</li><li>y continues</li></ul><p>after</p>');
});

test('the plain, lead and table forms drop the markup', () => {
  assert.equal(evidenceLead(ev), 'Docs: Code Mode ships experimental and off by default.');
  assert.equal(evidencePlain(ev), 'Docs: Code Mode ships experimental and off by default. Turned on with CODE_MODE=1, see the docs (https://example.com/a?b=1&c=2). The gate is not open to every account.');
  assert.equal(evidenceTableCell('a | b\n\n- one\n- two'), 'a \\| b<br>• one<br>• two');
});

test('a long run of unclosed brackets renders in linear time', () => {
  for (const s of ['['.repeat(80000), '[a](https://'.repeat(8000), '](https://x'.repeat(8000), '[a](https://x('.repeat(8000), '**a *'.repeat(16000)]) {
    const t = performance.now();
    evidenceHtml(s);
    assert.ok(performance.now() - t < 200, `${s.slice(0, 12)} took too long`);
  }
});
