/**
 * /assets/js/messages/handover.js
 * A client's agreement that their therapist may hand a copy of their record to another therapist. The agreement is a message in
 * their encrypted conversation (signed by the client), so the therapist can see it is really theirs. Nothing is sent anywhere by
 * this: the therapist prepares a file on their own device and passes it on themselves.
 */
const MAX_NAME = 80;
/** { to, withdrawn } or null. The name is trimmed, single-line and limited in length. */
export function cleanHandover(h) {
  if (!h || typeof h !== 'object') return null;
  const to = String(h.to ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME);
  return to ? { to, withdrawn: h.withdrawn === true } : null;
}
/**
 * The agreements in force, from a conversation as loadConversation returns it. Only messages from the client count, and only ones whose
 * signature did not fail. For each name the latest message wins, so a later withdrawal cancels an earlier agreement.
 */
export function currentConsents(msgs, { fromClient = m => !m.mine } = {}) {
  const latest = new Map();
  for (const m of [...(msgs || [])].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))) {
    if (!m.handover || !fromClient(m) || m.verified === false) continue;
    latest.set(m.handover.to.toLowerCase(), { to: m.handover.to, at: m.created_at, withdrawn: m.handover.withdrawn, verified: m.verified === true });
  }
  return [...latest.values()].filter(c => !c.withdrawn).map(({ withdrawn, ...c }) => c);
}
/** The lines put at the top of a handover file. The importer ignores them, so the notes come across unchanged. */
export function handoverHeader({ client, to, at, verified, today }) {
  const day = String(at || '').slice(0, 10) || 'an earlier date';
  return [`> Handover of the record of ${client} to ${to}.`, `> ${client} agreed to this on ${day}${verified ? ' (their signed message was checked)' : ''}. Prepared on ${today}.`, '> Keep it private and import it on your own device.', '', ''].join('\n');
}
