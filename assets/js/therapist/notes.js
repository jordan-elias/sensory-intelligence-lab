/**
 * /assets/js/therapist/notes.js
 * A therapist's private notes about one client. Each note is encrypted in the therapist's browser with
 * their own vault key before it is saved, so nobody else (the client, the practice owner, the platform)
 * can read it. Notes are the therapist's own record: they stay when a connection ends.
 */
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const MAX = 20000;

export function makeNotesStore(sb, session) {
  const seal = text => session.encrypt(JSON.stringify({ v: 1, text }));
  return {
    async list(clientId) {
      const { data, error } = await sb.from('therapist_notes').select('id, payload, created_at, updated_at')
        .eq('client_id', clientId).order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      const out = [];
      for (const r of data || []) {
        let text = null;
        try { text = JSON.parse(await session.decrypt(r.payload)).text; } catch { text = null; }
        out.push({ id: r.id, created_at: r.created_at, updated_at: r.updated_at, text });
      }
      return out;
    },
    async add(clientId, text) {
      text = String(text || '').trim();
      if (!text) throw new Error('Write something first.');
      if (text.length > MAX) throw new Error('That note is too long.');
      const { error } = await sb.from('therapist_notes').insert({ client_id: clientId, payload: await seal(text) });
      if (error) throw new Error(error.message);
    },
    async update(id, text) {
      text = String(text || '').trim();
      if (!text) throw new Error('A note cannot be empty. Delete it instead.');
      if (text.length > MAX) throw new Error('That note is too long.');
      const { error } = await sb.from('therapist_notes').update({ payload: await seal(text) }).eq('id', id);
      if (error) throw new Error(error.message);
    },
    async remove(id) {
      const { error } = await sb.from('therapist_notes').delete().eq('id', id);
      if (error) throw new Error(error.message);
    },
  };
}

const stamp = iso => new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/** Renders the Notes tab into `box`. */
export async function mountNotes(box, { store, clientId, clientName }) {
  const msgOf = () => box.querySelector('#noteMsg');
  const say = (t, kind) => { const m = msgOf(); if (m) { m.textContent = t; m.className = 'msg show ' + (kind || ''); } };

  async function draw() {
    let notes;
    try { notes = await store.list(clientId); }
    catch (e) { box.innerHTML = `<p class="msg show error">${esc(e.message)}</p>`; return; }
    box.innerHTML = `
      <p class="th-hint" style="margin-top:0">Private to you. Notes are encrypted with your vault, so the client, the practice owner and the platform cannot read them.
        They stay with you if the connection ends, and are removed if ${esc(clientName)} deletes their account.</p>
      <label class="ws-label" for="noteNew">New note</label>
      <textarea class="ws-input" id="noteNew" rows="4" maxlength="20000" placeholder="Session notes, observations, plans…"></textarea>
      <div style="margin:.5rem 0 1rem"><button type="button" class="action-btn" id="noteAdd">Save note</button></div>
      <div class="msg" id="noteMsg" role="status"></div>
      <ul class="th-list" id="noteList">${notes.map(n => `
        <li data-id="${esc(n.id)}">
          <div class="th-muted">${esc(stamp(n.created_at))}${n.updated_at && n.updated_at !== n.created_at ? ` · edited ${esc(stamp(n.updated_at))}` : ''}</div>
          ${n.text === null ? '<div class="th-muted">This note could not be opened with your current keys.</div>'
            : `<div class="note-text" style="white-space:pre-wrap;margin:.2rem 0">${esc(n.text)}</div>
               <button type="button" class="action-btn sm" data-edit>Edit</button>
               <button type="button" class="action-btn sm" data-del>Delete</button>`}
        </li>`).join('') || '<li class="th-muted">No notes yet.</li>'}</ul>`;

    box.querySelector('#noteAdd').onclick = async e => {
      e.target.disabled = true;
      try { await store.add(clientId, box.querySelector('#noteNew').value); await draw(); }
      catch (err) { say(err.message, 'error'); e.target.disabled = false; }
    };
    box.querySelectorAll('li[data-id]').forEach(li => {
      const id = li.dataset.id, n = notes.find(x => x.id === id);
      const editBtn = li.querySelector('[data-edit]');
      if (editBtn) editBtn.onclick = () => {
        li.querySelector('.note-text').outerHTML = `<textarea class="ws-input" rows="4" maxlength="20000" data-editbox>${esc(n.text)}</textarea>`;
        li.querySelector('[data-edit]').textContent = 'Save changes';
        li.querySelector('[data-edit]').onclick = async e => {
          e.target.disabled = true;
          try { await store.update(id, li.querySelector('[data-editbox]').value); await draw(); }
          catch (err) { say(err.message, 'error'); e.target.disabled = false; }
        };
      };
      li.querySelector('[data-del]')?.addEventListener('click', e => {
        e.target.outerHTML = '<span> Delete this note for good? <button type="button" class="action-btn sm" data-yes>Yes, delete</button> <button type="button" class="action-btn sm" data-no>Keep</button></span>';
        li.querySelector('[data-no]').onclick = draw;
        li.querySelector('[data-yes]').onclick = async () => { try { await store.remove(id); await draw(); } catch (err) { say(err.message, 'error'); } };
      });
    });
  }
  await draw();
}
