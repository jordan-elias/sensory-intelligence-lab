import test from 'node:test';
import assert from 'node:assert/strict';
import { TABS, tabFor, isTabRoot, titleOf, normalise } from '../../assets/js/app/shell.js';

test('five tabs, each with an address and an icon', () => { assert.equal(TABS.length, 5); assert.ok(TABS.every(t => t.href.startsWith('/') && t.icon && t.label)); });
test('pages map to the right tab, and unknown pages sit under Home', () => {
  for (const [p, t] of [['/dashboard/', 'home'], ['/dashboard/index.html', 'home'], ['/journal/', 'create'], ['/sequencer/', 'create'], ['/worksheets/coping/', 'you'],
    ['/regulation/', 'calm'], ['/breathing/index.html', 'calm'], ['/experiments/', 'create'], ['/ear-training/', 'listen'], ['/booking', 'you'], ['/messages/', 'you'], ['/family/', 'you'],
    ['/account/', 'you'], ['/subscribe/', 'you'], ['/something-new/', 'home']]) assert.equal(tabFor(p), t, p);
  assert.equal(tabFor('/dashboard/', '?g=listen'), 'listen');
});
test('only the dashboard counts as a tab root', () => { assert.ok(isTabRoot('/dashboard') && isTabRoot('/dashboard/index.html') && !isTabRoot('/journal/') && !isTabRoot('/account/')); });
test('titles lose the site name', () => { assert.equal(titleOf('Experiments in Creativity — Sensory Intelligence Lab'), 'Experiments in Creativity'); assert.equal(titleOf(''), 'Sensory Intelligence Lab'); assert.equal(normalise('/a/index.html'), '/a'); });
