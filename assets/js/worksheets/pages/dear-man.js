/** /assets/js/worksheets/pages/dear-man.js */
import { bySlug } from '../registry.js';
import { callout, section, field, scale, columns } from '../frame.js';

function render() {
  return [
    callout(`<strong>DEAR MAN</strong> is a DBT script for asking for something, or saying no, clearly. Adapt the words to your own voice. It does not have to sound like a script. Nothing here is shared unless you choose to share it.`),
    section('The situation', [
      field('who', 'Who is this with, and what is the situation?', { ph: 'As much or as little detail as you like. You do not have to name anyone.' }),
      field('goal', 'What do you want to happen? One sentence.', { ph: 'e.g. "I want Sam to text before coming over."' }),
      callout(`Rate how much each of these matters <em>in this situation</em>. They often pull against each other, and knowing which one leads helps you decide how firm to be.`),
      scale('priority_objective', 'Getting what I want (the objective)'),
      scale('priority_relationship', 'Keeping the relationship in good shape'),
      scale('priority_self', 'Keeping my self-respect'),
    ].join(''), true),
    section('The script', [
      field('d', '<strong>D</strong>escribe: the facts only, no judgement yet.'),
      field('e', '<strong>E</strong>xpress: how you feel about it. Use "I" statements.'),
      field('a', '<strong>A</strong>ssert: what you are asking for, or saying no to. Be concrete.'),
      field('r', '<strong>R</strong>einforce: what is in it for them, or for the relationship.'),
      field('m', '<strong>M</strong>indful: what you will keep coming back to if they change the subject or push back.', { ph: 'A line you can repeat calmly, e.g. "I understand, and I still need this."' }),
      field('a2', '<strong>A</strong>ppear confident: how you want to come across, even if you are nervous.'),
      field('n', '<strong>N</strong>egotiate: what you can give, and what you cannot.'),
    ].join('')),
    section('Compare two ways of saying it', [
      callout(`Write the ask twice: once as you would say it today, once as a version you think would land better (softer, firmer, shorter, in writing). Then compare them.`),
      columns([
        { title: 'Version A: how I would say it now', body: field('verA', 'The words', { size: 'md' }) + scale('verA_clear', 'How clear is it? (0–10)') + scale('verA_kind', 'How kind to both of us? (0–10)') },
        { title: 'Version B: a different way', body: field('verB', 'The words', { size: 'md' }) + scale('verB_clear', 'How clear is it? (0–10)') + scale('verB_kind', 'How kind to both of us? (0–10)') },
      ]),
      field('verPick', 'Which one sounds more like you, and why?', { size: 'md' }),
    ].join('')),
    section('Looking back', [
      callout(`Come back to this part after the conversation. You can save the worksheet now and edit it later.`),
      field('after_what', 'What happened?', { size: 'md' }),
      scale('after_objective', 'How well did I get what I wanted? (0–10)'),
      scale('after_relationship', 'How is the relationship now? (0–10)'),
      scale('after_self', 'How do I feel about how I handled it? (0–10)'),
      field('after_next', 'What worked, and what would I change next time?', { size: 'md' }),
    ].join('')),
    section('Music', [
      field('song', 'Is there a song or a sound that helps you feel steady before a hard conversation?'),
    ].join('')),
  ].join('');
}

export default { ...bySlug('dear-man'), savedNoun: 'Saved DEAR MAN worksheets', render };
