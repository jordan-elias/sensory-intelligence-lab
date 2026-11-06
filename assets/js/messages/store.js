/**
 * /assets/js/messages/store.js
 * End-to-end encrypted messages between a client and their therapist.
 * Each message is sealed in the sender's browser for the two people only and signed by the sender.
 * The server keeps the sealed message; it can see who wrote to whom and when, never the words.
 */
import { seal, verifySignature } from '../vault/vault-crypto.js';

export const MAX_CHARS = 4000;
const ctx = (linkId, id) => `msg:${linkId}:${id}`;
/** What the sender signs: binds the sealed text to this link, message and sender. */
export const signedString = (linkId, id, senderId, sealed) => `sil-msg|${linkId}|${id}|${senderId}|${sealed.iv}|${sealed.ciphertext}`;

/**
 * @param other { id, public_enc }  the person being written to
 */
export async function sendMessage({ sb, session, linkId, other, text }) {
  const body = String(text ?? '').trim();
  if (!body) throw new Error('Write something first.');
  if (body.length > MAX_CHARS) throw new Error(`Messages can be up to ${MAX_CHARS} characters.`);
  if (!other?.public_enc) throw new Error('This person has not finished setting up their secure vault yet, so a message cannot be sent.');
  const id = crypto.randomUUID();
  const sealed = await seal(JSON.stringify({ v: 1, text: body }),
    [{ id: other.id, encPublicJwk: other.public_enc }, { id: session.userId, encPublicJwk: session.publicKeys.enc }],
    { context: ctx(linkId, id) });
  const signature = await session.sign(signedString(linkId, id, session.userId, sealed));
  const { error } = await sb.from('messages').insert({ id, link_id: linkId, sender_id: session.userId, recipient_id: other.id, sealed, signature });
  if (error) throw new Error(error.message);
  return id;
}

/**
 * Loads and opens a conversation, oldest first.
 * `verified` is true if the sender's signature checks out, false if it does not, and null when the
 * other person's signing key is not available (for example after the connection ended).
 */
export async function loadConversation({ sb, session, linkId, otherSignKey }) {
  const { data, error } = await sb.from('messages').select('id, sender_id, recipient_id, sealed, signature, read_at, created_at')
    .eq('link_id', linkId).order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  const out = [];
  for (const m of data || []) {
    const mine = m.sender_id === session.userId;
    let text = null, verified = null;
    try { text = JSON.parse(await session.open(m.sealed, { context: ctx(linkId, m.id) })).text; } catch { text = null; }
    const signKey = mine ? session.publicKeys.sign : otherSignKey;
    if (text !== null && signKey) verified = await verifySignature(signKey, signedString(linkId, m.id, m.sender_id, m.sealed), m.signature);
    out.push({ id: m.id, mine, text, verified, read_at: m.read_at, created_at: m.created_at });
  }
  return out;
}

export async function markRead(sb, ids) {
  if (!ids.length) return;
  const { error } = await sb.from('messages').update({ read_at: new Date().toISOString() }).in('id', ids);
  if (error) console.warn('[messages] could not mark read:', error.message);
}

export async function unreadCount(sb, uid) {
  const { count, error } = await sb.from('messages').select('id', { count: 'exact', head: true }).eq('recipient_id', uid).is('read_at', null);
  return error ? 0 : (count || 0);
}

export async function hideConversation(sb, linkId) {
  const { error } = await sb.rpc('hide_messages', { p_link: linkId });
  if (error) throw new Error(error.message);
}
