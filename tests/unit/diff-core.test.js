// Node 24: node --test tests/unit/  (순수 함수만. DOM 함수는 tests/review-notes.js에서 검증)
const test = require('node:test');
const assert = require('node:assert/strict');
require('../../assets/doc-diff.js');
const D = globalThis.DocEditorDiff;
const eq = (a, b) => a === b;

test('myers: equal sequences', () => {
  assert.deepEqual(D.myers(['a', 'b'], ['a', 'b'], eq).map(o => o.op), ['eq', 'eq']);
});
test('myers: delete and insert with indexes', () => {
  const ops = D.myers(['a', 'b', 'c'], ['a', 'c', 'd'], eq);
  assert.deepEqual(ops.map(o => o.op), ['eq', 'del', 'eq', 'ins']);
  assert.equal(ops[1].a, 1);
  assert.equal(ops[3].b, 2);
});
test('myers: empty sides', () => {
  assert.deepEqual(D.myers([], ['x'], eq).map(o => o.op), ['ins']);
  assert.deepEqual(D.myers(['x'], [], eq).map(o => o.op), ['del']);
  assert.deepEqual(D.myers([], [], eq), []);
});
test('myers: maxD exceeded returns null', () => {
  assert.equal(D.myers(['a', 'b', 'c'], ['x', 'y', 'z'], eq, 2), null);
});
test('tokenize splits tags, words and whitespace', () => {
  assert.deepEqual(D.tokenize('<b>안녕</b> 세상  a'), ['<b>', '안녕', '</b>', ' ', '세상', '  ', 'a']);
});
test('normText collapses whitespace and nbsp', () => {
  assert.equal(D.normText(' 하나  둘\n셋 '), '하나 둘 셋');
});
test('dice similarity', () => {
  assert.equal(D.dice('a b c', 'a b c'), 1);
  assert.equal(D.dice('a b', 'c d'), 0);
  assert.equal(D.dice('', ''), 1);
  assert.ok(Math.abs(D.dice('a b c d', 'a b x y') - 0.5) < 1e-9);
});
test('wordDiff wraps inserted and deleted words', () => {
  const out = D.wordDiff('하나 둘 셋', '하나 넷 셋');
  assert.ok(out.startsWith('하나 ') && out.endsWith(' 셋'), out);
  assert.ok(out.includes('<del class="doc-ed-del">둘</del>'), out);
  assert.ok(out.includes('<ins class="doc-ed-ins">넷</ins>'), out);
});
test('wordDiff keeps the current tag structure and drops deleted tags', () => {
  assert.equal(D.wordDiff('<b>a</b> b', '<i>a</i> b'), '<i>a</i> b');
});
test('wordDiff keeps deleted images inside del', () => {
  assert.ok(D.wordDiff('x <img src="a.png"> y', 'x y').includes('<del class="doc-ed-del"><img src="a.png">'));
});
test('wordDiff ignores whitespace-only changes', () => {
  assert.equal(D.wordDiff('a b', 'a  b'), 'a  b');
});
test('wordDiff keeps one wrapper across inserted words', () => {
  assert.equal(D.wordDiff('x', 'x a b'), 'x<ins class="doc-ed-ins"> a b</ins>');
});
test('wordDiff returns null when the token diff is too large', () => {
  const a = Array.from({ length: 3000 }, (_, i) => 'a' + i).join(' ');
  const b = Array.from({ length: 3000 }, (_, i) => 'b' + i).join(' ');
  assert.equal(D.wordDiff(a, b), null);
});
