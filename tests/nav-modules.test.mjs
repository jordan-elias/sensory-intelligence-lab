import test from 'node:test'; import assert from 'node:assert/strict';
import { MODULES, MESSAGES, TABS, GROUPS, GROUP_ORDER, tabFor, isTabRoot, titleOf, normalise, moduleFor, inGroup, search } from '../assets/js/nav/modules.js';
import { readFileSync, existsSync } from 'node:fs';

test('every tool has a unique id and address, a real group, an icon and a description', () => {
  const all = MODULES.concat(MESSAGES); assert.equal(new Set(all.map(m => m.id)).size, all.length); assert.equal(new Set(all.map(m => m.href)).size, all.length);
  for (const m of all) { assert.ok(m.href.startsWith('/') && m.href.endsWith('/'), m.id); assert.ok(GROUP_ORDER.includes(m.group), m.id); assert.ok(m.icon.includes('<'), m.id); assert.ok(m.title && m.blurb && m.words, m.id); }
});
test('every address points at a page that exists', () => { for (const m of MODULES.concat(MESSAGES)) assert.ok(existsSync(`.${m.href}index.html`) || existsSync(`.${m.href}index.htm`), m.href); });
test('each group has tools, in a sensible number for a phone screen', () => { for (const g of GROUP_ORDER) { const n = inGroup(g).length; assert.ok(n >= 3 && n <= 6, `${g}: ${n}`); assert.ok(GROUPS[g].label && GROUPS[g].blurb); } });
test('five tabs: Home plus the four groups', () => { assert.deepEqual(TABS.map(t => t.id), ['home', ...GROUP_ORDER]); assert.ok(TABS.every(t => t.href.startsWith('/dashboard/') && t.icon && t.label)); });
test('pages belong to the right tab, and the dashboard follows its address', () => {
  for (const [p, t] of [['/regulation/', 'calm'], ['/breathing/index.html', 'calm'], ['/ambience/', 'calm'], ['/ear-training/', 'listen'], ['/spatial-game/', 'listen'], ['/cocktail-party-problem/', 'listen'],
    ['/sequencer/', 'create'], ['/compositions/oramics', 'create'], ['/compositions/semantic-synth/', 'create'], ['/experiments/', 'create'], ['/experiments/some-one/', 'create'], ['/journal/', 'create'],
    ['/worksheets/coping/', 'you'], ['/library/', 'you'], ['/booking', 'you'], ['/messages/', 'you'], ['/account/', 'you'], ['/subscribe/', 'you'], ['/', 'home'], ['/unknown/', 'home']]) assert.equal(tabFor(p), t, p);
  assert.equal(tabFor('/dashboard/'), 'home'); assert.equal(tabFor('/dashboard/', '?g=listen'), 'listen'); assert.equal(tabFor('/dashboard/', '?g=nope'), 'home'); assert.equal(tabFor('/dashboard', '?g='), 'home');
});
test('only the dashboard is a tab root; titles and paths clean up', () => {
  assert.ok(isTabRoot('/dashboard/index.html') && isTabRoot('/dashboard') && !isTabRoot('/journal/') && !isTabRoot('/account/'));
  assert.equal(titleOf('Experiments in Creativity — Sensory Intelligence Lab'), 'Experiments in Creativity'); assert.equal(titleOf(''), 'Sensory Intelligence Lab'); assert.equal(normalise('/a/index.html'), '/a');
});
test('a tool is found from its address', () => { assert.equal(moduleFor('/spatial-game/').id, 'spatial'); assert.equal(moduleFor('/experiments/x/').id, 'experiments'); assert.equal(moduleFor('/nothing/'), null); assert.equal(moduleFor('/messages/').id, 'messages'); });
test('search: by title, by the words people use, all words must match, best first', () => {
  const ids = q => search(q).map(m => m.id);
  assert.equal(ids('breath')[0], 'breathing'); assert.ok(ids('sleep').includes('ambience')); assert.ok(ids('oramics').includes('compositions')); assert.ok(ids('beat').includes('sequencer'));
  assert.ok(ids('headphones').includes('spatial')); assert.ok(ids('therapist').includes('booking')); assert.equal(ids('seq')[0], 'sequencer');
  assert.deepEqual(ids('breath xylophone'), []); assert.deepEqual(ids('   '), []); assert.deepEqual(ids(''), []);
  assert.ok(ids('calm').includes('breathing'));   // the group name counts too
});
