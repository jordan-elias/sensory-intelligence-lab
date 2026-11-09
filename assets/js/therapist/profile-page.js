/**
 * /assets/js/therapist/profile-page.js
 * Lets a therapist edit their own profile: name, short bio, booking link, whether they are
 * taking new clients, and a photo. The row itself is created by the practice owner in SQL; therapists
 * can change only these fields (the database enforces it).
 */
import { photoUrl } from './my-therapist.js';

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const PHOTO = 512;           // square, pixels
const MAX_BIO = 600;

/** Centre-crops to a square, scales to 512px and re-encodes as JPEG. Re-encoding also drops EXIF (including GPS). */
export async function preparePhoto(file) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error('Please choose a JPEG, PNG or WebP image.');
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const side = Math.min(bmp.width, bmp.height);
  const canvas = Object.assign(document.createElement('canvas'), { width: PHOTO, height: PHOTO });
  canvas.getContext('2d').drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, PHOTO, PHOTO);
  bmp.close?.();
  const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.85));
  if (!blob) throw new Error('Could not process that image.');
  return blob;
}

export function validBookingLink(v) { return !v || /^https:\/\/[^\s]+$/.test(v); }

export async function mountProfile(root) {
  const sb = await new Promise(res => { if (window._supabase && window._currentUser) res(window._supabase); else window.addEventListener('authReady', () => res(window._supabase), { once: true }); });
  const uid = window._currentUser.id;
  const { data: row, error } = await sb.from('therapist_profiles').select('*').eq('user_id', uid).maybeSingle();
  if (error) { root.innerHTML = `<div class="ws-callout"><strong>Could not load your profile</strong>${esc(error.message)}</div>`; return; }
  if (!row) { root.innerHTML = `<div class="ws-callout"><strong>This page is for therapists</strong>If you should have access, please contact the practice owner.</div>`; return; }

  let photoPath = row.photo_path;
  const draw = async () => {
    const url = await photoUrl(sb, photoPath).catch(() => null);
    root.innerHTML = `
      <form class="th-form" id="thForm" novalidate>
        <div class="msg" id="thMsg" role="status" aria-live="polite"></div>

        <div class="ws-field"><span class="ws-label">Photo</span>
          <div class="th-photo">
            ${url ? `<img src="${esc(url)}" alt="Your current photo">` : `<div class="th-initial" aria-hidden="true">${esc((row.display_name || '?')[0].toUpperCase())}</div>`}
            <div class="th-photo-actions">
              <input type="file" id="thFile" accept="image/jpeg,image/png,image/webp" hidden>
              <button type="button" class="action-btn outline sm" id="thPick">${url ? 'Change photo' : 'Add a photo'}</button>
              ${url ? '<button type="button" class="action-btn outline sm" id="thDropPhoto">Remove photo</button>' : ''}
            </div>
          </div>
          <p class="th-hint">Cropped to a square and resized on your device. Location data in the photo is removed. Clients who are signed in can see it.</p>
        </div>

        <div class="ws-field"><label class="ws-label" for="thName">Display name</label>
          <input class="ws-input" id="thName" maxlength="80" value="${esc(row.display_name)}" required></div>

        <div class="ws-field"><label class="ws-label" for="thBio">Short bio</label>
          <textarea class="ws-input" id="thBio" rows="5" maxlength="${MAX_BIO}">${esc(row.bio || '')}</textarea>
          <div class="th-count" id="thCount"></div></div>

        <div class="ws-field"><label class="ws-label" for="thLink">Booking link</label>
          <input class="ws-input" id="thLink" type="url" inputmode="url" placeholder="https://cal.com/your-name" value="${esc(row.booking_link || '')}">
          <p class="th-hint">Where your clients book sessions with you. Must start with https://. Leave empty if you have none yet.</p></div>

        <label class="th-switch"><input type="checkbox" id="thAccepting" ${row.accepting_clients ? 'checked' : ''}>
          <span>Taking new clients<small>When off, you are not shown to new clients and they cannot connect with you. Your current clients can still book and message you.</small></span></label>

        <button type="submit" class="action-btn" id="thSave">Save profile</button>
      </form>`;
    wire();
  };

  function wire() {
    const $ = id => root.querySelector('#' + id);
    const msg = (t, kind) => { const m = $('thMsg'); m.textContent = t; m.className = 'msg ' + (kind || ''); m.scrollIntoView?.({ block: 'nearest' }); };
    const count = () => { $('thCount').textContent = `${$('thBio').value.length} / ${MAX_BIO}`; };
    $('thBio').addEventListener('input', count); count();

    $('thPick').onclick = () => $('thFile').click();
    $('thFile').onchange = async () => {
      const f = $('thFile').files[0]; if (!f) return;
      $('thPick').disabled = true; msg('Uploading photo…');
      try {
        const blob = await preparePhoto(f);
        const path = `${uid}/avatar-${Date.now()}.jpg`;
        const up = await sb.storage.from('therapist-photos').upload(path, blob, { contentType: 'image/jpeg', upsert: false });
        if (up.error) throw new Error(up.error.message);
        const { error: e2 } = await sb.from('therapist_profiles').update({ photo_path: path }).eq('user_id', uid);
        if (e2) { await sb.storage.from('therapist-photos').remove([path]); throw new Error(e2.message); }
        if (photoPath) await sb.storage.from('therapist-photos').remove([photoPath]);
        photoPath = path; await draw(); root.querySelector('#thMsg').textContent = 'Photo updated.'; root.querySelector('#thMsg').className = 'msg success';
      } catch (e) { msg(e.message, 'error'); $('thPick').disabled = false; }
    };
    $('thDropPhoto')?.addEventListener('click', async () => {
      try {
        const { error: e } = await sb.from('therapist_profiles').update({ photo_path: null }).eq('user_id', uid);
        if (e) throw new Error(e.message);
        await sb.storage.from('therapist-photos').remove([photoPath]); photoPath = null; await draw();
      } catch (e) { msg(e.message, 'error'); }
    });

    root.querySelector('#thForm').addEventListener('submit', async ev => {
      ev.preventDefault();
      const name = $('thName').value.trim(), bio = $('thBio').value.trim(), link = $('thLink').value.trim();
      if (!name) return msg('Please enter a display name.', 'error');
      if (!validBookingLink(link)) return msg('The booking link must start with https://', 'error');
      $('thSave').disabled = true;
      const { error: e } = await sb.from('therapist_profiles').update({
        display_name: name, bio: bio || null, booking_link: link || null,
        accepting_clients: $('thAccepting').checked,
      }).eq('user_id', uid);
      $('thSave').disabled = false;
      if (e) return msg('Could not save: ' + e.message, 'error');
      msg('Saved.', 'success');
    });
  }
  await draw();
}
