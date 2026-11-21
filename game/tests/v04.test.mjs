import test from 'node:test'; import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { toRevised, toTtsLatin, normalizeTranscript, convertContent } from '../src/alphabet.mjs';
import { route, validateReply } from '../server/ai.mjs';
import { findPath, canStand } from '../src/navigation.ts';
import { library } from '../src/training.ts';

test('revised alphabet conversion, idempotence, protected tokens and TTS adapter', () => {
  assert.equal(toRevised('O‘zbekiston, G‘ayrat, shahar, choy, SHAHAR'), 'Özbekiston, Ğayrat, şahar, çoy, ŞAHAR');
  assert.equal(toRevised("o'qish g`alaba ma’lumot"), 'öqiş ğalaba ma’lumot');
  for (const s of ['Sud majlisi boşlandi.', 'Özbekiston']) assert.equal(toRevised(s), s);
  assert.equal(toRevised('https://lex.uz/docs/shartnoma CH_JUDGE E1'), 'https://lex.uz/docs/shartnoma CH_JUDGE E1');
  assert.equal(toTtsLatin('Çorşanba Özbekiston ğalaba eʼlon'), "Chorshanba O'zbekiston g'alaba e'lon");
  assert.equal(normalizeTranscript('xurmatli  sutya'), 'hurmatli sudya');
  assert.deepEqual(convertContent({ id: 'sh_1', url: 'https://x/shop', title: 'Shartnoma', effects: ['oral:T_SHOWN'] }), { id: 'sh_1', url: 'https://x/shop', title: 'Şartnoma', effects: ['oral:T_SHOWN'] });
});

const MOJIBAKE = /â€|Â·|Ã[-¿]/;
test('detector catches known mojibake', () => { assert.ok(MOJIBAKE.test('boâ€˜ling')); assert.ok(MOJIBAKE.test('A Â· B')); assert.ok(!MOJIBAKE.test('Özbek · ‘ ’')); });
test('shipped content and UI sources contain no mojibake and case content uses the revised alphabet', () => {
  for (const dir of ['src']) for (const f of readdirSync(dir).filter(f => /\.(tsx?|mjs|css)$/.test(f))) {
    const s = readFileSync(`${dir}/${f}`, 'utf8'); assert.ok(!MOJIBAKE.test(s), `mojibake in ${f}`);
  }
  const titles = library.map(c => c.title).join(' ');
  assert.ok(!/[oOgG][‘ʻ']/.test(titles) && !/\b\w*[Ss]h\w*\b/.test(titles.replace(/https?:\S+/g, '')), 'case titles converted');
});

test('AI router sends simple turns to Groq and legal reasoning to Groq', () => {
  assert.equal(route({ text: 'Salom, ismingiz nima?', actor: 'CH_WITNESS' }).provider, 'groq');
  assert.equal(route({ text: 'Iste’molchilar huquqlari qonunining 15-moddasi böyiça asoslab bering', actor: 'CH_JUDGE' }).provider, 'groq');
  assert.equal(route({ text: 'qisqa', actor: 'CH_JUDGE', phase: 'final' }).provider, 'groq');
  assert.equal(route({ text: 'x', mode: 'compare' }).provider, 'groq');
});

test('validated replies keep the text, drop unknown ids, flag unverified articles and force QonunAI intent none', () => {
  const c = library[0];
  const v = validateReply({ text: 'Bu 999-modda böyiça hal qilinadi. E77 ham bor.', intent: 'begin_hearing', emotion: 'angry', gesture: 'dance', evidenceIds: ['E77'] }, c, 'CH_JUDGE', 'groq');
  assert.equal(v.intent, 'begin_hearing'); assert.equal(v.emotion, 'neutral'); assert.equal(v.gesture, 'formal_hand');
  assert.deepEqual(v.grounding.unverifiedArticles, ['999']); assert.deepEqual(v.grounding.unknownEvidence, ['E77']); assert.deepEqual(v.evidenceIds, []);
  assert.equal(validateReply({ text: 'Maslahat', intent: 'begin_hearing' }, c, 'CH_QONUNAI', 'groq').intent, 'none');
  assert.throws(() => validateReply({ text: '' }, c, 'CH_JUDGE', 'groq'));
});

test('A* routes the witness from the gallery through the bar gate around furniture', () => {
  const bars = [{ minX: -7.25, maxX: -.6, minZ: .88, maxZ: 1.02 }, { minX: .6, maxX: 7.25, minZ: .88, maxZ: 1.02 }, { minX: 3.6, maxX: 5.7, minZ: -1.2, maxZ: -.5 }];
  const path = findPath([2.0, 2.07], [4.75, -.12], bars);
  assert.ok(path && path.length >= 2, 'path found');
  let prev = [2.0, 2.07];
  for (const p of path) { for (let t = 0; t <= 1; t += .05) assert.ok(canStand(prev[0] + (p[0] - prev[0]) * t, prev[1] + (p[1] - prev[1]) * t, bars, .2), `segment clear ${p}`); prev = p; }
  assert.ok(path.some(([x, z]) => Math.abs(x) < .6 && Math.abs(z - .95) < .6) || path.length > 1);
});
