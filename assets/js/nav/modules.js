/**
 * /assets/js/nav/modules.js
 * Every tool in one list: where it lives, what group it belongs to, a line icon, and the words people might search for.
 * The phone's bottom tab bar, the icon grid on the dashboard and the search all read this, so a tool is added in one place.
 * Pure data and functions; nothing here touches the page.
 */
export const GROUPS = {
  calm:   { label: 'Calm',   blurb: 'Settle, breathe, slow down' },
  listen: { label: 'Listen', blurb: 'Train your ears and attention' },
  create: { label: 'Create', blurb: 'Make sound, music and writing' },
  you:    { label: 'You',    blurb: 'Your reflections, resources and account' },
};
export const GROUP_ORDER = ['calm', 'listen', 'create', 'you'];

/** Line icons on a 24 x 24 grid (stroke only, they take the page's colour). */
export const MODULES = [
  { id: 'regulation', title: 'Regulation Engine', href: '/regulation/', group: 'calm', gated: false, blurb: 'Sound that moves you from how you feel to where you want to be.', words: 'mood state iso principle mindfulness soundscape shift feel', icon: '<path d="M3 12c2.5-5 5-5 7.5 0s5 5 7.5 0"/><circle cx="20.5" cy="12" r="1.3"/>' },
  { id: 'breathing', title: 'Breathing', href: '/breathing/', group: 'calm', gated: false, blurb: 'A slow breathing pattern to follow, with sound.', words: 'breath breathe hrv parasympathetic relax anxiety panic', icon: '<circle cx="12" cy="12" r="3.5"/><circle cx="12" cy="12" r="8.5"/>' },
  { id: 'ambience', title: 'Ambience', href: '/ambience/', group: 'calm', gated: false, blurb: 'Switch sounds on and off and let a calm mix play.', words: 'background loops nature rain ocean sleep noise relax calm music', icon: '<path d="M7 18a4 4 0 0 1 0-8 5 5 0 0 1 9.5-1A4.5 4.5 0 0 1 17 18H7z"/>' },
  { id: 'checkin', title: 'Check-in', href: '/check-in/', group: 'calm', gated: true, blurb: 'A minute to put words to where you are.', words: 'mood feelings pattern awareness track daily', icon: '<circle cx="12" cy="12" r="8.5"/><path d="M8.5 13.5c1 1.7 2.2 2.5 3.5 2.5s2.5-.8 3.5-2.5M9 9.5h.01M15 9.5h.01"/>' },

  { id: 'ear', title: 'Ear Training', href: '/ear-training/', group: 'listen', gated: false, blurb: 'Short listening exercises: intervals, chords, perception.', words: 'intervals chords pitch hearing music theory', icon: '<path d="M7 11a5 5 0 0 1 10 0c0 3-3 3.5-3 6.5a2.5 2.5 0 0 1-5 0"/><path d="M10 11a2 2 0 0 1 4 0c0 1.5-1.5 1.5-1.5 3"/>' },
  { id: 'spatial', title: 'Spatial Awareness', href: '/spatial-game/', group: 'listen', gated: true, blurb: 'Follow a moving sound by ear alone.', words: 'localisation localization attention shell game headphones 3d', icon: '<circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="12" r="5.5"/><circle cx="12" cy="12" r="9.5" stroke-dasharray="2 3"/>' },
  { id: 'cocktail', title: 'Cocktail Party', href: '/cocktail-party-problem/', group: 'listen', gated: true, blurb: 'Pick one voice out of several.', words: 'selective attention voices source separation noise hearing', icon: '<path d="M4 5h16l-8 9z"/><path d="M12 14v6M8 20h8"/>' },

  { id: 'sequencer', title: 'Sequencer', href: '/sequencer/', group: 'create', gated: false, blurb: 'Make a beat, step by step.', words: 'drum machine beat loops melody rhythm pattern', icon: '<rect x="4" y="4" width="6.5" height="6.5"/><rect x="13.5" y="4" width="6.5" height="6.5"/><rect x="4" y="13.5" width="6.5" height="6.5"/><rect x="13.5" y="13.5" width="6.5" height="6.5"/>' },
  { id: 'soundscape', title: 'Soundscape Machine', href: '/soundscape-machine/', group: 'create', gated: true, blurb: 'Build a soundscape and let it run.', words: 'field recording composition layers sound design', icon: '<path d="M3 15c2-6 4-6 6 0s4 6 6 0 4-6 6 0"/><path d="M3 7h18"/>' },
  { id: 'compositions', title: 'Compositions', href: '/compositions/', group: 'create', gated: true, blurb: 'Phasing, chance, drawn sound and words that become music.', words: 'oramics semantic synth phase machine chance synthesis generative draw', icon: '<path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>' },
  { id: 'experiments', title: 'Experiments', href: '/experiments/', group: 'create', gated: true, blurb: 'Small creative experiments, each with a limit. A minicourse.', words: 'course creativity prompts activities learn creative block writing', icon: '<path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4A2 2 0 0 0 19 18l-5-9V3"/>' },
  { id: 'journal', title: 'Timed Journal', href: '/journal/', group: 'create', gated: true, blurb: 'Write for a set time without stopping.', words: 'writing reflection diary notes free write', icon: '<path d="M6 3h12v18H6z"/><path d="M9 8h6M9 12h6M9 16h3"/>' },

  { id: 'worksheets', title: 'Worksheets', href: '/worksheets/', group: 'you', gated: true, blurb: 'Reflective exercises about music, memory and goals.', words: 'goals skills coping reflection exercise therapy homework', icon: '<path d="M7 3h8l4 4v14H7z"/><path d="M15 3v4h4M10 12h6M10 16h6"/>' },
  { id: 'library', title: 'Library', href: '/library/', group: 'you', gated: false, blurb: 'Books, tools, sound archives and research.', words: 'resources reading research links learn', icon: '<path d="M5 4v16M9.5 4v16M14 6.5l4.2-1 2.8 13.5-4.2 1z"/>' },
  { id: 'booking', title: 'Book a Session', href: '/booking/', group: 'you', gated: false, blurb: 'A one-to-one video session with a music therapist.', words: 'therapy appointment telehealth sessions calendar music therapist', icon: '<path d="M4 6h16v14H4zM4 10h16M8 3v5M16 3v5"/>' },
  { id: 'account', title: 'Account', href: '/account/', group: 'you', gated: false, blurb: 'Your details, privacy and sign out.', words: 'settings profile privacy sign out subscription password', icon: '<circle cx="12" cy="8.5" r="3.8"/><path d="M4.5 20.5c.8-4.3 3.6-6.3 7.5-6.3s6.7 2 7.5 6.3"/>' },
];
/** Shown only to someone connected to a therapist (see nav-links.js). */
export const MESSAGES = { id: 'messages', title: 'Messages', href: '/messages/', group: 'you', gated: false, blurb: 'Messages with your therapist.', words: 'chat therapist inbox', icon: '<path d="M4 5h16v11H9l-5 4V5z"/>' };

/** The five tabs of the bottom bar. The four groups open the dashboard filtered to that group. */
export const TABS = [
  { id: 'home',   href: '/dashboard/',           label: 'Home',   icon: '<path d="M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10"/>' },
  { id: 'calm',   href: '/dashboard/?g=calm',    label: 'Calm',   icon: '<path d="M3 12c3-6 6-6 9 0s6 6 9 0"/>' },
  { id: 'listen', href: '/dashboard/?g=listen',  label: 'Listen', icon: '<path d="M4 15v-3a8 8 0 0 1 16 0v3"/><rect x="3" y="14" width="4" height="6" rx="1.2"/><rect x="17" y="14" width="4" height="6" rx="1.2"/>' },
  { id: 'create', href: '/dashboard/?g=create',  label: 'Create', icon: '<path d="M12 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2z"/><path d="M19 17v4M17 19h4"/>' },
  { id: 'you',    href: '/dashboard/?g=you',     label: 'You',    icon: '<circle cx="12" cy="8.5" r="3.8"/><path d="M4.5 20.5c.8-4.3 3.6-6.3 7.5-6.3s6.7 2 7.5 6.3"/>' },
];

export const normalise = path => String(path || '/').replace(/index\.html$/, '').replace(/\/+$/, '') || '/';
const EXTRA = { you: ['/messages', '/therapy', '/intake', '/family', '/subscribe', '/privacy', '/vault', '/account'] };
const SUB = { regulation: ['/regulation'], breathing: ['/breathing'] };

/** Which tab a page belongs to. The dashboard itself is Home, or the group named in its address (?g=calm). */
export function tabFor(path, search = '') {
  const p = normalise(path);
  if (p === '/dashboard') { const g = new URLSearchParams(search).get('g'); return GROUP_ORDER.includes(g) ? g : 'home'; }
  for (const m of MODULES) { const base = normalise(m.href); if (p === base || p.startsWith(base + '/')) return m.group; }
  for (const [g, roots] of Object.entries(EXTRA)) if (roots.some(r => p === r || p.startsWith(r + '/'))) return g;
  return 'home';
}
/** Pages with a tab bar of their own at the top of the app: the dashboard, with or without a group. */
export const isTabRoot = path => normalise(path) === '/dashboard';
export const titleOf = t => String(t || '').replace(/\s+[—–-]\s+Sensory Intelligence Lab\s*$/i, '').trim() || 'Sensory Intelligence Lab';

/** A tool from its address (for the "jump back in" list). */
export function moduleFor(path) {
  const p = normalise(path);
  return MODULES.concat(MESSAGES).find(m => { const b = normalise(m.href); return p === b || p.startsWith(b + '/'); }) || null;
}
export const inGroup = (g, extra = []) => MODULES.concat(extra).filter(m => m.group === g);

/** Search by title, group, the little description and the extra words. Every word typed has to match. Best matches first. */
export function search(query, list = MODULES) {
  const words = String(query || '').toLowerCase().split(/\s+/).filter(Boolean); if (!words.length) return [];
  const scored = [];
  for (const m of list) {
    const title = m.title.toLowerCase(), hay = `${title} ${GROUPS[m.group].label.toLowerCase()} ${m.blurb.toLowerCase()} ${m.words}`; let score = 0, ok = true;
    for (const w of words) { if (title.startsWith(w)) score += 4; else if (title.split(/\s+/).some(x => x.startsWith(w))) score += 3; else if (m.words.split(' ').some(x => x.startsWith(w))) score += 2; else if (hay.includes(w)) score += 1; else { ok = false; break; } }
    if (ok) scored.push({ m, score });
  }
  return scored.sort((a, b) => b.score - a.score).map(s => s.m);
}
