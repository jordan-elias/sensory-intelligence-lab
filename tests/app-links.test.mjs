import test from 'node:test'; import assert from 'node:assert/strict';
import { appPathFromUrl } from '../assets/js/app/links.js';
test('the return from paying still works', () => {
  assert.equal(appPathFromUrl('de.jordanelias.sil://open?path=/subscribe/?success=true'), '/subscribe/index.html?success=true');
  assert.equal(appPathFromUrl('de.jordanelias.sil://open'), '/dashboard/index.html');
});
test('sign-in email links keep their code or token and open inside the app', () => {
  assert.equal(appPathFromUrl('https://lab.jordanelias.de/account/#access_token=abc&type=signup'), '/account/index.html#access_token=abc&type=signup'.replace('index.html', 'index.html'));
  assert.equal(appPathFromUrl('https://lab.jordanelias.de/dashboard/?code=xyz'), '/dashboard/index.html?code=xyz');
});
test('the hand-back page follows its own "to"', () => {
  assert.equal(appPathFromUrl('https://lab.jordanelias.de/app-return/?to=/subscribe/'), '/subscribe/index.html');
});
test('anything else is refused: other hosts, other paths, tricks', () => {
  for (const u of ['https://evil.example/account/', 'https://lab.jordanelias.de.evil.example/account/', 'https://lab.jordanelias.de/privacy/', 'http://lab.jordanelias.de/account/', 'https://lab.jordanelias.de:8443/account/', 'https://user@lab.jordanelias.de/account/', 'de.jordanelias.sil://open?path=//evil.example', 'de.jordanelias.sil://open?path=https://evil.example', 'de.jordanelias.sil://open?path=/a\\b', 'https://lab.jordanelias.de/app-return/?to=//evil.example', 'javascript:alert(1)', 'not a url', ''])
    assert.equal(appPathFromUrl(u), null, u);
});
