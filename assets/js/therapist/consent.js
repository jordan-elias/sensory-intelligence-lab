/**
 * /assets/js/therapist/consent.js
 * The wording a client agrees to before being linked to a therapist.
 * Change the text only together with the version, and keep LINK_CONSENT_VERSION in step with
 * CONSENT_VERSION in netlify/functions/link-therapist.js: the server refuses a stale version.
 */
export const LINK_CONSENT_VERSION = 'link-1.2';

export const LINK_CONSENT_TEXT = [
  'Your therapist will be able to see your name, email, subscription and intake status, and the times of the sessions you book with them.',
  'Nothing else is visible to them unless you choose to share it.',
  'You can end the connection at any time. Ending it stops their access to anything new. Anything you chose to share before then stays with them, and nothing can undo what they have already seen.',
];
