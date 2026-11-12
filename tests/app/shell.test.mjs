import test from 'node:test';
import assert from 'node:assert/strict';
import { TABS, tabFor, isTabRoot, titleOf, normalise } from '../../assets/js/app/shell.js';

test('five tabs, each with an address and an icon', () => { assert.equal(TABS.length, 5); assert.ok(TABS.every(t => t.href.startsWith('/') && t.icon && t.label)); });
test('pages map to the right tab, and everything else sits under Home', () => {
  for (const [p, t] of [['/dashboard/', 'home'], ['/dashboard/index.html', 'home'], ['/journal/', 'home'], ['/sequencer/', 'home'], ['/worksheets/coping/', 'home'],
    ['/regulation/', 'calm'], ['/breathing/index.html', 'calm'], ['/experiments/', 'course'], ['/booking', 'sessions'], ['/messages/', 'sessions'], ['/family/', 'sessions'],
    ['/account/', 'you'], ['/subscribe/', 'you']]) assert.equal(tabFor(p), t, p);
});
test('only the five tab roots count as roots', () => { assert.ok(isTabRoot('/account/index.html') && isTabRoot('/dashboard') && !isTabRoot('/journal/') && !isTabRoot('/messages/')); });
test('titles lose the site name', () => { assert.equal(titleOf('Within Limits — Sensory Intelligence Lab'), 'Within Limits'); assert.equal(titleOf(''), 'Sensory Intelligence Lab'); assert.equal(normalise('/a/index.html'), '/a'); });
