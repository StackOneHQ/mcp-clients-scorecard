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
});

test('the plain, lead and table forms drop the markup', () => {
  assert.equal(evidenceLead(ev), 'Docs: Code Mode ships experimental and off by default.');
  assert.equal(evidencePlain(ev), 'Docs: Code Mode ships experimental and off by default. Turned on with CODE_MODE=1, see the docs. The gate is not open to every account.');
  assert.equal(evidenceTableCell('a | b\n\n- one\n- two'), 'a \\| b<br>• one<br>• two');
});
