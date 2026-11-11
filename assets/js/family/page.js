/**
 * /assets/js/family/page.js
 * The client's family history page. Private by default; sending to a therapist is a separate, deliberate step.
 */
import { ensureVaultReady } from '../vault/gate.js';
import { therapistTarget } from '../sharing/store.js';
import { RELATIONSHIPS, STATUSES, LIMITS, blankMember, cleanFamily, isEmpty, loadFamily, saveFamily, sharedFamilyInfo, sendFamily, withdrawFamily } from './family.js';

const day = iso => iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '';
function h(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) { if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else if (v === true) n.setAttribute(k, ''); else if (v !== false && v != null) n.setAttribute(k, v); }
  for (const c of kids.flat()) if (c != null) n.append(c.nodeType ? c : document.createTextNode(String(c)));
  return n;
}

export async function mountFamily(root) {
  const sb = await new Promise(res => { if (window._supabase && window._currentUser) res(window._supabase); else window.addEventListener('authReady', () => res(window._supabase), { once: true }); });
  const uid = window._currentUser?.id;
  root.replaceChildren(h('p', { class: 'th-muted' }, 'Opening…'));
  // The family history is a form a therapist can ask for. Without a request there is nothing to fill in.
  const { data: links } = await sb.from('my_therapists').select('*').eq('status', 'active').limit(1);
  const link = links && links[0];
  if (!link || !link.family_requested_at) {
    root.replaceChildren(h('h2', { class: 'th-h2' }, 'Nothing to fill in'),
      h('p', { class: 'th-muted' }, 'A therapist can ask you for a family history, and when they do you will be notified here and in the bell at the top of the page. Nothing is shared unless you choose to send it.'));
    return;
  }
  let session, doc, updatedAt;
  try {
    session = await ensureVaultReady();
    ({ doc, updated_at: updatedAt } = await loadFamily({ sb, session, uid }));
  } catch (e) { root.replaceChildren(h('p', { class: 'msg show error' }, e.message)); return; }

  const status = h('p', { class: 'msg', role: 'status', 'aria-live': 'polite' });
  let timer = null, dirty = false;

  const say = (text, kind = 'success') => { status.textContent = text; status.className = 'msg show ' + kind; };
  async function save() {
    clearTimeout(timer);
    try { doc = await saveFamily({ sb, session, uid, doc }); dirty = false; say('Saved. Only you can read this.'); }
    catch (e) { say(e.message, 'error'); }
  }
  const touched = () => { dirty = true; say('Not saved yet…', 'info'); clearTimeout(timer); timer = setTimeout(save, 1500); };
  addEventListener('beforeunload', e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });

  const overview = h('textarea', { id: 'fhOverview', rows: 5, maxlength: LIMITS.overview, 'aria-label': 'Childhood and family overview' });
  overview.value = doc.overview; overview.oninput = () => { doc.overview = overview.value; touched(); };

  const list = h('div', { class: 'fh-list' });
  function field(m, key, label, { type = 'text', rows = 3, max, hint } = {}) {
    const id = `fh_${m.id}_${key}`;
    const input = type === 'textarea' ? h('textarea', { id, rows, maxlength: max }) : h('input', { id, type: 'text', maxlength: max });
    input.value = m[key] || ''; input.oninput = () => { m[key] = input.value; touched(); renderSummary(m); };
    return h('div', { class: 'field' }, h('label', { for: id }, label), hint ? h('p', { class: 'th-muted', style: 'margin:.1rem 0 .3rem' }, hint) : null, input);
  }
  function select(m, key, label, options) {
    const id = `fh_${m.id}_${key}`, el = h('select', { id }, h('option', { value: '' }, 'Choose…'), options.map(o => h('option', { value: o }, o)));
    el.value = options.includes(m[key]) ? m[key] : ''; el.onchange = () => { m[key] = el.value; touched(); renderSummary(m); };
    return h('div', { class: 'field' }, h('label', { for: id }, label), el);
  }
  const summaries = new Map();
  const renderSummary = m => { const s = summaries.get(m.id); if (s) s.textContent = [m.name || 'New person', m.relationship].filter(Boolean).join(' · '); };

  function card(m, open) {
    const sum = h('summary', {}); summaries.set(m.id, sum);
    const rm = h('button', { type: 'button', class: 'action-btn action-btn--quiet', onclick: () => {
      if (!confirm(`Remove ${m.name || 'this person'} from your family history?`)) return;
      doc.members = doc.members.filter(x => x.id !== m.id); wrap.remove(); touched(); if (!doc.members.length) empty.hidden = false;
    } }, 'Remove this person');
    const wrap = h('details', { class: 'fh-card', open }, sum,
      field(m, 'name', 'What you call them', { max: LIMITS.name, hint: 'A first name, nickname or role. Whatever helps you remember.' }),
      select(m, 'relationship', 'Relationship to you', RELATIONSHIPS),
      select(m, 'status', 'Are they living?', STATUSES),
      field(m, 'born', 'Born (year or approximately)', { max: LIMITS.born }),
      field(m, 'description', 'Who they are', { type: 'textarea', max: LIMITS.description, hint: 'Personality, role in the family, how things were between you.' }),
      field(m, 'history', 'Significant history', { type: 'textarea', rows: 4, max: LIMITS.history, hint: 'Events, losses, illness, moves, conflicts, anything that shaped them or you.' }),
      field(m, 'impact', 'Why they matter in your story', { type: 'textarea', max: LIMITS.impact }), rm);
    renderSummary(m); return wrap;
  }
  const empty = h('p', { class: 'th-muted', hidden: doc.members.length > 0 }, 'No one added yet. Add the people who matter to your story, in any order.');
  doc.members.forEach(m => list.append(card(m, false)));
  const add = h('button', { type: 'button', class: 'action-btn', id: 'fhAdd', onclick: () => {
    if (doc.members.length >= LIMITS.members) { say(`You can add up to ${LIMITS.members} people.`, 'error'); return; }
    const m = blankMember(); doc.members.push(m); empty.hidden = true; const c = card(m, true); list.append(c); c.querySelector('input')?.focus();
  } }, 'Add a person');
  const saveBtn = h('button', { type: 'button', class: 'action-btn', id: 'fhSave', onclick: save }, 'Save now');

  // ── sending to a therapist (optional) ──
  const share = h('div', { class: 'ws-callout', id: 'fhShare' });
  async function drawShare() {
    share.replaceChildren();
    if (!link) { share.append(h('strong', {}, 'Keeping this private'), 'This stays encrypted on your device and in your account. If you connect with a therapist you can choose to send them a copy, and take it back whenever you like.'); return; }
    const name = link.display_name || 'your therapist';
    let info = null; try { info = await sharedFamilyInfo(sb, link.link_id); } catch { /* shown as not sent */ }
    const msg = h('p', { class: 'msg', role: 'status', 'aria-live': 'polite' });
    const send = h('button', { type: 'button', class: 'action-btn', id: 'fhSend', onclick: async () => {
      send.disabled = true;
      try { await save(); const target = await therapistTarget(sb);
        if (!target) throw new Error(`${name} has not finished setting up their secure vault yet. Nothing has been sent.`);
        await sendFamily({ sb, session, target, doc }); await drawShare();
      } catch (e) { msg.textContent = e.message; msg.className = 'msg show error'; send.disabled = false; }
    } }, info ? `Send the current version to ${name}` : `Send to ${name}`);
    share.append(h('strong', {}, info ? `${name} has a copy` : `Not sent to ${name}`),
      info ? `You sent it on ${day(info.sent_at)}. Later changes stay private until you send again. ` : 'Nothing is sent unless you press the button. ',
      `If you send it, only you and ${name} can read it. It is encrypted on your device first, so we cannot read it either.`, h('div', { class: 'fh-actions' }, send,
        info ? h('button', { type: 'button', class: 'action-btn action-btn--quiet', id: 'fhWithdraw', onclick: async () => {
          if (!confirm(`Remove ${name}'s copy? They will no longer be able to read it. Your own copy stays.`)) return;
          try { await withdrawFamily(sb, link.link_id); await drawShare(); } catch (e) { msg.textContent = e.message; msg.className = 'msg show error'; }
        } }, 'Take it back') : null), msg);
  }
  await drawShare();

  root.replaceChildren(
    h('p', { class: 'th-lede' }, 'An optional quick reference for the people in your story: names, relationships and the points that matter. It is useful when therapy turns to family or childhood, and for you.'),
    h('div', { class: 'ws-callout' }, h('strong', {}, 'Private to you'), 'It is encrypted on your device before it is saved. Nothing is shared with anyone unless you choose to send it.'),
    h('h2', { class: 'th-h2' }, 'Childhood and family overview'), h('p', { class: 'th-muted' }, 'Optional. Where you grew up, who lived at home, what it was like. Skip anything you prefer not to write.'), overview,
    h('h2', { class: 'th-h2' }, 'People'), empty, list, h('div', { class: 'fh-actions' }, add, saveBtn), status,
    h('h2', { class: 'th-h2' }, 'Your therapist'), share);
  void updatedAt; void cleanFamily; void isEmpty;
}
