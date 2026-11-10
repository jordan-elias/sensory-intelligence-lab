/**
 * /assets/js/checkins/insight-card.js
 * A small card on the dashboard: your streak, this week's mood against last week, and now and then
 * one thing worth noticing. Analysis runs here, on decrypted data, and nothing is sent anywhere.
 * If the vault is locked the card waits for a tap instead of asking for the passphrase unprompted.
 */
import { hasUserKey } from '/assets/js/vault/gate.js';
import { load } from './store.js';
import { streak, trend, pickInsight } from './trends.js';

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const KEY = 'sil.insights.v1';
const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) || { shown: {}, lastAt: null }; } catch { return { shown: {}, lastAt: null }; } };
const write = v => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* private window: it just may repeat */ } };

export function render(root, checkins, now = new Date()) {
  if (!checkins.length) { root.hidden = true; return; }
  const s = streak(checkins, now), t = trend(checkins, { now });
  const state = read(), pick = pickInsight(checkins, { now, ...state });
  if (pick) { state.shown[pick.id] = now.toISOString(); state.lastAt = now.toISOString(); write(state); }
  const arrow = t.direction === 'up' ? '↑' : t.direction === 'down' ? '↓' : '→';
  root.hidden = false;
  root.innerHTML = `
    <p class="section-label">Your patterns</p>
    <div class="insight-card">
      <div class="insight-stats">
        <div><strong>${s.days}</strong><span>day${s.days === 1 ? '' : 's'} in a row</span></div>
        <div><strong>${t.enough ? `${arrow} ${t.recent}` : '—'}</strong><span>${t.enough ? 'mood this week' : 'a few more days for a trend'}</span></div>
      </div>
      ${pick ? `<div class="insight-note"><strong>${esc(pick.title)}</strong><p>${esc(pick.text)}</p></div>` : ''}
      <p class="insight-foot">Worked out on this device from your check-ins. <a href="/check-in/insights/">See more</a></p>
    </div>`;
}

export async function mountInsightCard(root) {
  const go = async () => { try { render(root, await load({ sinceDays: 120 })); } catch (e) { console.warn('[insights]', e.message); root.hidden = true; } };
  if (hasUserKey()) return go();
  root.hidden = false;
  root.innerHTML = `<p class="section-label">Your patterns</p><div class="insight-card"><p class="insight-foot" style="margin:0 0 .6rem">Your check-ins are private to you, so unlock them to see your patterns.</p><button type="button" class="insight-btn" id="insightUnlock">Show my patterns</button></div>`;
  root.querySelector('#insightUnlock').onclick = go;
}
