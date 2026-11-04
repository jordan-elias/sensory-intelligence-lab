/**
 * /assets/js/vault/vault-ui.js
 * The vault screens: set up, save recovery key, unlock, forgot passphrase, settings.
 * mountVaultPanel(container, vault) renders into `container` and follows vault state.
 */
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const nextPaint = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 30)));

const PASSPHRASE_HELP = `Choose a short sentence of unrelated words, at least 12 characters. For example, <em>purple tractor eats seven clouds</em> (please invent your own). Easy to remember and hard to guess.`;

const LOSS_WARNING = `We cannot recover your passphrase or your recovery key. If you lose both, your private content cannot be opened by anyone, including Jordan.`;

export function mountVaultPanel(root, vault) {
  let view = 'loading';
  let notice = null;               // { kind: 'ok' | 'error', text }
  let busy = false;
  let recovery = null;             // { key, mode: 'setup' | 'rotate' }
  let state = { state: 'loading' };

  const setNotice = (kind, text) => { notice = text ? { kind, text } : null; };
  const go = (v, keepNotice = false) => { view = v; if (!keepNotice) notice = null; draw(); };

  // ── shared pieces ──
  const msg = () => notice
    ? `<div class="msg ${notice.kind === 'error' ? 'error' : 'success'}" role="${notice.kind === 'error' ? 'alert' : 'status'}">${esc(notice.text)}</div>` : '<div class="msg" role="status"></div>';

  const passField = (id, label, auto, extra = '') => `
    <div class="ws-field">
      <label class="ws-label" for="${id}">${label}</label>
      <div class="vault-pass">
        <input class="ws-input" id="${id}" type="password" autocomplete="${auto}" spellcheck="false" autocapitalize="off" ${extra}>
        <button type="button" class="vault-reveal" data-action="reveal" data-target="${id}" aria-label="Show or hide ${esc(label.toLowerCase())}" aria-pressed="false">Show</button>
      </div>
    </div>`;

  const newPassBlock = (prefix = 'new') => `
    <p class="vault-help">${PASSPHRASE_HELP}</p>
    ${passField(prefix + 'Pass', 'New passphrase', 'new-password')}
    ${passField(prefix + 'Confirm', 'Type it again', 'new-password')}
    <ul class="vault-checks" id="${prefix}Checks" aria-live="polite"></ul>`;

  const keepToggle = (id = 'keep') => `
    <label class="vault-check">
      <input type="checkbox" id="${id}">
      <span><strong>Keep me unlocked on this device.</strong> You will not be asked for your passphrase here again until you lock, sign out, or 30 days pass. Only use this on a device that is yours.</span>
    </label>`;

  // ── views ──
  const views = {
    loading: () => `<p class="vault-lead">Loading…</p>`,

    working: () => `
      <div class="vault-working" role="status">
        <div class="vault-spinner" aria-hidden="true"></div>
        <p><strong>${esc(busy)}</strong></p>
        <p class="vault-help">This takes a few seconds. It is deliberately slow, so that anyone trying to guess your passphrase is slowed down too.</p>
      </div>`,

    setup: () => `
      <h3>Set up your private vault</h3>
      <p class="vault-lead">What you write here (worksheets, journal, check-ins and messages) will be locked with a passphrase that only you know. Nobody else can read it, including us.</p>
      <div class="ws-callout ws-callout--care"><strong>Please read this</strong>${LOSS_WARNING} In the next step you will get a recovery key to keep safe.</div>
      <form id="setupForm" novalidate>
        ${newPassBlock('new')}
        ${msg()}
        <button class="action-btn" type="submit">Create my vault</button>
      </form>`,

    recovery: () => `
      <h3>${recovery.mode === 'rotate' ? 'Your new recovery key' : 'Save your recovery key'}</h3>
      <p class="vault-lead">${recovery.mode === 'rotate'
        ? 'Your old recovery key stops working once you continue.'
        : 'If you ever forget your passphrase, this key is the only way back in.'}</p>
      <div class="vault-printarea">
        <p class="vault-keylabel">Recovery key</p>
        <code class="vault-key" id="recoveryKey" aria-label="Your recovery key">${esc(recovery.key)}</code>
      </div>
      <div class="vault-row">
        <button type="button" class="action-btn outline sm" data-action="copy-key">Copy</button>
        <button type="button" class="action-btn outline sm" data-action="download-key">Download</button>
        <button type="button" class="action-btn outline sm" data-action="print-key">Print</button>
      </div>
      <div class="ws-callout ws-callout--care"><strong>Keep it somewhere safe</strong>A password manager or a piece of paper in a safe place is ideal. Do not keep the only copy on this device. ${LOSS_WARNING}</div>
      <form id="recoveryForm" novalidate>
        <div class="ws-field">
          <label class="ws-label" for="keyCheck">To check you saved it, type the first four characters of the key</label>
          <input class="ws-input" id="keyCheck" type="text" autocomplete="off" spellcheck="false" autocapitalize="characters" maxlength="9" aria-describedby="keyCheckHelp">
          <p class="vault-help" id="keyCheckHelp">That is the first group, before the first dash.</p>
        </div>
        <label class="vault-check">
          <input type="checkbox" id="savedBox">
          <span>I have saved my recovery key somewhere safe.</span>
        </label>
        ${recovery.mode === 'setup' ? keepToggle('keep') : ''}
        ${msg()}
        <div class="vault-row">
          <button class="action-btn" type="submit" id="recoveryContinue" disabled>Continue</button>
          ${recovery.mode === 'rotate' ? '<button type="button" class="action-btn outline" data-action="cancel-rotate">Cancel</button>' : ''}
        </div>
      </form>`,

    unlock: () => `
      <h3>Unlock your vault</h3>
      <p class="vault-lead">Enter your passphrase to open your private content on this device.</p>
      <form id="unlockForm" novalidate>
        ${passField('unlockPass', 'Passphrase', 'current-password', 'autofocus')}
        ${keepToggle('keep')}
        ${msg()}
        <div class="vault-row">
          <button class="action-btn" type="submit">Unlock</button>
          <button type="button" class="vault-link" data-action="to-recover">Forgot your passphrase?</button>
        </div>
      </form>`,

    recover: () => `
      <h3>Use your recovery key</h3>
      <p class="vault-lead">Enter your recovery key and choose a new passphrase. Your content stays exactly as it is.</p>
      <form id="recoverForm" novalidate>
        <div class="ws-field">
          <label class="ws-label" for="rkInput">Recovery key</label>
          <input class="ws-input" id="rkInput" type="text" autocomplete="off" spellcheck="false" autocapitalize="characters" placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XX">
        </div>
        ${newPassBlock('new')}
        ${keepToggle('keep')}
        ${msg()}
        <div class="vault-row">
          <button class="action-btn" type="submit">Set new passphrase</button>
          <button type="button" class="vault-link" data-action="to-unlock">Back</button>
        </div>
      </form>`,

    settings: () => `
      <div class="vault-status"><span class="vault-dot" aria-hidden="true"></span><strong>Your vault is unlocked</strong></div>
      ${msg()}

      <section class="vault-section" aria-labelledby="scHead">
        <h4 id="scHead">Your safety code</h4>
        <p class="vault-help">A short code that identifies your keys. When you work with a therapist, you compare codes once in a session. If they match, nobody has put a different key in between.</p>
        <code class="vault-code" aria-label="Your safety code">${esc(state.fingerprint || '')}</code>
      </section>

      <section class="vault-section" aria-labelledby="devHead">
        <h4 id="devHead">This device</h4>
        <label class="vault-check">
          <input type="checkbox" id="trustBox" ${state.trusted ? 'checked' : ''}>
          <span><strong>Keep me unlocked on this device</strong> for up to 30 days. Turn this off on shared or borrowed devices.</span>
        </label>
        <div class="vault-row"><button type="button" class="action-btn outline" data-action="lock">Lock now</button></div>
      </section>

      <section class="vault-section" aria-labelledby="pwHead">
        <h4 id="pwHead">Change passphrase</h4>
        <form id="changeForm" novalidate>
          ${passField('curPass', 'Current passphrase', 'current-password')}
          ${newPassBlock('new')}
          <button class="action-btn outline" type="submit">Change passphrase</button>
        </form>
      </section>

      <section class="vault-section" aria-labelledby="rkHead">
        <h4 id="rkHead">Recovery key</h4>
        <p class="vault-help">Lost your recovery key, or think someone saw it? Make a new one. The old one stops working.</p>
        <form id="rotateForm" novalidate>
          ${passField('rotPass', 'Your passphrase', 'current-password')}
          <button class="action-btn outline" type="submit">Make a new recovery key</button>
        </form>
      </section>`,
  };

  // ── rendering and wiring ──
  function draw() {
    root.innerHTML = `<div class="vault-card">${views[view]()}</div>`;
    wire();
  }

  function liveChecks(prefix) {
    const pass = root.querySelector('#' + prefix + 'Pass');
    const conf = root.querySelector('#' + prefix + 'Confirm');
    const list = root.querySelector('#' + prefix + 'Checks');
    if (!pass || !list) return;
    const update = () => {
      const p = vault.checkPassphrase(pass.value);
      const items = [];
      if (pass.value) {
        items.push(...(p.ok ? [['ok', 'Strong enough']] : p.issues.map(i => ['no', i])));
        if (conf.value) items.push(conf.value === pass.value ? ['ok', 'Both entries match'] : ['no', 'The two entries do not match yet']);
      }
      list.innerHTML = items.map(([k, t]) => `<li class="${k}">${esc(t)}</li>`).join('');
    };
    pass.addEventListener('input', update); conf.addEventListener('input', update);
  }

  function validateNew(prefix) {
    const pass = root.querySelector('#' + prefix + 'Pass').value;
    const conf = root.querySelector('#' + prefix + 'Confirm').value;
    const p = vault.checkPassphrase(pass);
    if (!p.ok) return { error: p.issues[0] };
    if (pass !== conf) return { error: 'The two passphrases do not match.' };
    return { pass };
  }

  const friendly = e => ({
    'wrong-passphrase': 'That passphrase is not correct.',
    'wrong-recovery-key': 'That recovery key is not correct.',
    'bad-recovery-key': e.message,
    'weak-passphrase': e.message,
    conflict: e.message,
    exists: 'A vault already exists for this account. Reload the page to unlock it.',
    network: e.message,
  }[e.code] || 'Something went wrong: ' + (e.message || e.code || 'unknown error'));

  async function run(label, fn, onError) {
    if (busy) return;
    const back = view;
    busy = label;
    if (label) { view = 'working'; draw(); await nextPaint(); }
    try { await fn(); }
    catch (e) { busy = false; if (onError) onError(e); else { setNotice('error', friendly(e)); go(back, true); } return; }
    busy = false;
  }

  function wire() {
    const q = id => root.querySelector('#' + id);
    liveChecks('new');

    q('setupForm')?.addEventListener('submit', async e => {
      e.preventDefault();
      const v = validateNew('new');
      if (v.error) { setNotice('error', v.error); return go('setup', true); }
      await run('Creating your keys…', async () => {
        const r = await vault.startSetup(v.pass);
        recovery = { key: r.recoveryKey, mode: 'setup' };
        busy = false; go('recovery');
      }, e2 => { setNotice('error', friendly(e2)); go('setup', true); });
    });

    const rf = q('recoveryForm');
    if (rf) {
      const check = q('keyCheck'), saved = q('savedBox'), btn = q('recoveryContinue');
      const update = () => {
        const first = recovery.key.split('-')[0];
        btn.disabled = !(saved.checked && check.value.trim().toUpperCase() === first);
      };
      check.addEventListener('input', update); saved.addEventListener('change', update);
      rf.addEventListener('submit', async e => {
        e.preventDefault();
        if (btn.disabled) return;
        const keep = !!q('keep')?.checked;
        await run('', async () => {
          if (recovery.mode === 'setup') await vault.finishSetup({ keepUnlocked: keep });
          else await vault.finishRecoveryRotation();
          const was = recovery.mode; recovery = null;
          setNotice('ok', was === 'setup' ? 'Your vault is ready.' : 'Your new recovery key is active. The old one no longer works.');
          go('settings', true);
        }, err => { setNotice('error', friendly(err)); draw(); });
      });
    }

    q('unlockForm')?.addEventListener('submit', async e => {
      e.preventDefault();
      const pass = q('unlockPass').value;
      if (!pass) { setNotice('error', 'Enter your passphrase.'); return go('unlock', true); }
      const keep = !!q('keep').checked;
      await run('Unlocking…', async () => { await vault.unlock(pass, { keepUnlocked: keep }); busy = false; setNotice('ok', 'Unlocked.'); go('settings', true); },
        err => { setNotice('error', friendly(err)); go('unlock', true); });
    });

    q('recoverForm')?.addEventListener('submit', async e => {
      e.preventDefault();
      const key = q('rkInput').value;
      const v = validateNew('new');
      if (!key.trim()) { setNotice('error', 'Enter your recovery key.'); return go('recover', true); }
      if (v.error) { setNotice('error', v.error); return go('recover', true); }
      const keep = !!q('keep').checked;
      await run('Setting your new passphrase…', async () => { await vault.recover(key, v.pass, { keepUnlocked: keep }); busy = false; setNotice('ok', 'Your passphrase has been changed and your vault is unlocked.'); go('settings', true); },
        err => { setNotice('error', friendly(err)); go('recover', true); });
    });

    q('changeForm')?.addEventListener('submit', async e => {
      e.preventDefault();
      const v = validateNew('new');
      const cur = q('curPass').value;
      if (!cur) { setNotice('error', 'Enter your current passphrase.'); return go('settings', true); }
      if (v.error) { setNotice('error', v.error); return go('settings', true); }
      await run('Changing your passphrase…', async () => { await vault.changePassphrase(cur, v.pass); busy = false; setNotice('ok', 'Passphrase changed. Your content did not need to change.'); go('settings', true); },
        err => { setNotice('error', friendly(err)); go('settings', true); });
    });

    q('rotateForm')?.addEventListener('submit', async e => {
      e.preventDefault();
      const pass = q('rotPass').value;
      if (!pass) { setNotice('error', 'Enter your passphrase.'); return go('settings', true); }
      await run('Making a new recovery key…', async () => { const r = await vault.startRecoveryRotation(pass); recovery = { key: r.recoveryKey, mode: 'rotate' }; busy = false; go('recovery'); },
        err => { setNotice('error', friendly(err)); go('settings', true); });
    });

    q('trustBox')?.addEventListener('change', async e => {
      const on = e.target.checked;
      try { const now = await vault.setTrusted(on); if (on && !now) { setNotice('error', 'This browser would not let us remember the key. You will be asked for your passphrase each time.'); go('settings', true); } }
      catch (err) { setNotice('error', friendly(err)); go('settings', true); }
    });
  }

  // delegated clicks (reveal, copy, download, print, navigation)
  root.addEventListener('click', async e => {
    const b = e.target.closest('[data-action]');
    if (!b) return;
    switch (b.dataset.action) {
      case 'reveal': {
        const input = root.querySelector('#' + b.dataset.target);
        const show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        b.textContent = show ? 'Hide' : 'Show'; b.setAttribute('aria-pressed', String(show));
        break;
      }
      case 'copy-key':
        try { await navigator.clipboard.writeText(recovery.key); b.textContent = 'Copied'; setTimeout(() => { b.textContent = 'Copy'; }, 2000); }
        catch { b.textContent = 'Select and copy it by hand'; }
        break;
      case 'download-key': {
        const text = ['Sensory Intelligence Lab: recovery key', '', recovery.key, '',
          'Keep this somewhere safe and private, away from the device you use for the lab.',
          'It is the only way back in if you forget your passphrase.',
          'We cannot recover it for you. Created ' + new Date().toISOString().slice(0, 10) + '.', ''].join('\n');
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
        a.download = 'sil-recovery-key.txt';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
        break;
      }
      case 'print-key': document.body.classList.add('vault-printing'); window.print(); document.body.classList.remove('vault-printing'); break;
      case 'cancel-rotate': vault.cancelPending(); recovery = null; go('settings'); break;
      case 'to-recover': go('recover'); break;
      case 'to-unlock': go('unlock'); break;
      case 'lock': await vault.lock(); setNotice('ok', 'Your vault is locked.'); go('unlock', true); break;
    }
  });

  // keep in step with the vault (sign-out elsewhere, trusted-device unlock, etc.)
  vault.onChange(s => {
    state = s;
    if (busy || view === 'recovery' || view === 'recover') return;
    if (s.state === 'locked' && view === 'settings') go('unlock');
  });

  (async () => {
    draw();
    try {
      state = await vault.load();
      go(state.state === 'no-vault' ? 'setup' : state.state === 'unlocked' ? 'settings' : 'unlock');
    } catch (e) {
      setNotice('error', friendly(e));
      view = 'loading';
      root.innerHTML = `<div class="vault-card">${msg()}</div>`;
    }
  })();
}
