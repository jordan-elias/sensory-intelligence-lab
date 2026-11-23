/**
 * /assets/js/dashboard/today.js
 * The "Today" path on the dashboard: a short, ordered list of what to do now, chosen from two answers (what you want from today,
 * how long you have) and what you opened recently. Everything here is on the device: the answers and the recent list live in
 * localStorage and are never sent anywhere. Pure functions; the page does the drawing.
 * Descriptions say what a tool is, not what it will do to you.
 */
export const INTENTS = [
  { id: 'calm', label: 'Settle and slow down' },
  { id: 'focus', label: 'Listen closely' },
  { id: 'create', label: 'Make something' },
  { id: 'notice', label: 'Notice my patterns' },
];
export const MINUTES = [5, 15, 30];
export const DEFAULT_ANSWERS = { intent: 'calm', minutes: 5 };

export const TOOLS = {
  checkin: { title: 'Check in', href: '/check-in/', min: 1, why: 'A minute to put words to where you are.' },
  breathing: { title: 'Breathing', href: '/breathing/', min: 5, why: 'A slow breathing pattern to follow, with sound.' },
  regulation: { title: 'Regulation Engine', href: '/regulation/', min: 5, why: 'Sound that moves from how you feel now to where you want to be.' },
  ear: { title: 'Ear training', href: '/ear-training/', min: 10, why: 'Short listening exercises, one at a time.' },
  cocktail: { title: 'Cocktail Party Problem', href: '/cocktail-party-problem/', min: 10, why: 'Pick one voice out of several.' },
  spatial: { title: 'Spatial listening game', href: '/spatial-game/', min: 10, why: 'Find where a sound is coming from.' },
  soundscape: { title: 'Soundscape Machine', href: '/soundscape-machine/', min: 15, why: 'Build a soundscape and let it run.' },
  ambience: { title: 'Ambience', href: '/ambience/', min: 10, why: 'Switch sounds on and off and let a calm mix play.' },
  sequencer: { title: 'Sequencer', href: '/sequencer/', min: 15, why: 'Make a beat, step by step.' },
  experiments: { title: 'Experiments in Creativity', href: '/experiments/', min: 15, why: 'One small experiment with a limit.' },
  journal: { title: 'Timed journal', href: '/journal/', min: 10, why: 'Write for a set time without stopping.' },
  worksheets: { title: 'Worksheets', href: '/worksheets/', min: 15, why: 'A reflective exercise about music and memory.' },
};
export const BY_INTENT = {
  calm: ['breathing', 'regulation', 'soundscape'],
  focus: ['ear', 'cocktail', 'spatial', 'soundscape'],
  create: ['experiments', 'sequencer', 'soundscape', 'journal'],
  notice: ['journal', 'worksheets', 'regulation'],
};

const DAY = 86400000;
export const startOfDay = (now = Date.now()) => { const d = new Date(now); d.setHours(0, 0, 0, 0); return d.getTime(); };

/** Newest first, one entry per link, at most 12. */
export function recordRecent(list, href, now = Date.now()) {
  return [{ href, at: now }, ...(Array.isArray(list) ? list : []).filter(r => r && r.href !== href)].slice(0, 12);
}
const lastUsed = (recent, href) => (recent.find(r => r.href === href)?.at ?? 0);
/** For ordering only uses from before today count, so using a tool today does not reshuffle today's path. */
const lastBefore = (recent, href, today) => (recent.find(r => r.href === href && r.at < today)?.at ?? 0);

/**
 * The steps for today.
 *   answers: { intent, minutes }; checkedIn: boolean; includeCheckin: show the check-in as step 1;
 *   recent: [{ href, at }]; experiment: { title, href, label } to point "Experiments" at the course's next step.
 * Tools used longest ago come first, so the path changes from day to day. A step is `done` if its link was opened today.
 */
export function todayPath({ answers, checkedIn = false, includeCheckin = true, recent = [], experiment = null, now = Date.now() } = {}) {
  answers = answers || DEFAULT_ANSWERS; recent = Array.isArray(recent) ? recent : [];
  const intent = BY_INTENT[answers.intent] ? answers.intent : DEFAULT_ANSWERS.intent;
  const minutes = MINUTES.includes(answers.minutes) ? answers.minutes : DEFAULT_ANSWERS.minutes;
  const today = startOfDay(now);
  const steps = [];
  if (includeCheckin) steps.push({ id: 'checkin', ...TOOLS.checkin, done: checkedIn });
  let budget = minutes;                      // the minute for the check-in is on top, so "15 minutes" means about 15 of tool time
  const order = BY_INTENT[intent].map((id, i) => ({ id, i })).sort((a, b) => lastBefore(recent, TOOLS[a.id].href, today) - lastBefore(recent, TOOLS[b.id].href, today) || a.i - b.i).map(x => x.id);
  const fits = order.filter(id => TOOLS[id].min <= Math.max(budget, 5));
  const chosen = [];
  for (const id of (fits.length ? fits : order)) {
    if (chosen.length && TOOLS[id].min > budget) continue;
    chosen.push(id); budget -= TOOLS[id].min;
    if (chosen.length === 2 || budget < 5) break;
  }
  for (const id of chosen) {
    const t = { id, ...TOOLS[id] };
    if (id === 'experiments' && experiment) { t.title = experiment.title; t.href = experiment.href; t.why = experiment.label; }
    t.done = lastUsed(recent, TOOLS[id].href) >= today || (id === 'experiments' && experiment ? lastUsed(recent, experiment.href) >= today : false);
    steps.push(t);
  }
  return { intent, minutes, steps, minutesTotal: steps.reduce((a, s) => a + s.min, 0), allDone: steps.length > 0 && steps.every(s => s.done) };
}

/** Saved answers: null when never asked; { skipped: true } when the person skipped (the default path is used). */
export function readAnswers(raw) {
  try {
    const a = JSON.parse(raw); if (!a || typeof a !== 'object') return null;
    if (a.skipped) return { skipped: true };
    return BY_INTENT[a.intent] && MINUTES.includes(a.minutes) ? { intent: a.intent, minutes: a.minutes } : null;
  } catch { return null; }
}
