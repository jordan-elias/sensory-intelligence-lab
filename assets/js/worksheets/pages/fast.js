/** /assets/js/worksheets/pages/fast.js */
import { bySlug } from '../registry.js';
import { callout, section, field, scale, columns } from '../frame.js';

function render() {
  return [
    callout(`<strong>FAST</strong> is a DBT set of skills for keeping your self-respect while you deal with someone: <strong>F</strong>air, no unnecessary <strong>A</strong>pologies, <strong>S</strong>tick to your values, <strong>T</strong>ruthful. It is about how you hold yourself, not about winning.`),
    section('The situation', [
      field('situation', 'What is the situation, and with whom? Keep it short.', { size: 'md' }),
      field('wanted', 'What am I trying to protect or keep here? (A limit, a value, my energy, my honesty…)'),
    ].join(''), true),
    section('The four skills', [
      field('f', '<strong>F</strong>air: how can I be fair to them and to myself? What would a fair outcome look like?'),
      field('a', '<strong>A</strong>pologies: is there anything I am about to apologise for that I do not need to? (Asking, having an opinion, taking up space…)'),
      field('s', '<strong>S</strong>tick to my values: which value do I want to act from here, and what does that look like in practice?'),
      field('t', '<strong>T</strong>ruthful: what is true, without exaggerating or making excuses?'),
    ].join('')),
    section('Compare: giving in or holding steady', [
      callout(`Weigh both honestly. Think about now, and about a week from now.`),
      columns([
        { title: 'If I give in or go along', body: field('give_now', 'How I would feel right after') + field('give_later', 'How I would feel a week from now') + field('give_say', 'What I would say') },
        { title: 'If I hold steady (FAST)', body: field('hold_now', 'How I would feel right after') + field('hold_later', 'How I would feel a week from now') + field('hold_say', 'What I would say') },
      ]),
      field('compare_notice', 'What do I notice when I put the two side by side?', { size: 'md' }),
    ].join('')),
    section('Self-respect check', [
      scale('respect_before', 'How strong is my self-respect in this situation right now? (0–10)'),
      field('respect_line', 'One sentence I can say to myself before I go in.'),
      scale('respect_after', 'After the conversation: how is my self-respect? (0–10)'),
      field('respect_learn', 'What did I learn?', { size: 'md' }),
    ].join('')),
    section('Music', [
      field('song', 'What song or sound reminds me of who I want to be in this?'),
    ].join('')),
  ].join('');
}

export default { ...bySlug('fast'), savedNoun: 'Saved FAST worksheets', render };
