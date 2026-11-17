/** /assets/js/worksheets/pages/grow.js */
import { bySlug } from '../registry.js';
import { callout, section, field, scale, columns } from '../frame.js';

const option = n => ({
  title: `Option ${n}`,
  body: field(`opt${n}_name`, 'What is it?')
      + field(`opt${n}_pro`, 'What speaks for it?')
      + field(`opt${n}_con`, 'What speaks against it?')
      + scale(`opt${n}_effort`, 'Effort needed (0–10)')
      + scale(`opt${n}_fit`, 'Fit with my values (0–10)'),
});

function render() {
  return [
    callout(`<strong>GROW</strong> is a coaching frame for getting from "I want this to change" to one small step you will actually take: <strong>G</strong>oal, <strong>R</strong>eality, <strong>O</strong>ptions, <strong>W</strong>ill. Take it at your own pace. You can save halfway and come back.`),
    section('Goal: where do I want to get to?', [
      field('goal', 'What do I want? Say it in a way you would recognise when it happens.', { size: 'md' }),
      field('goal_why', 'Why does it matter to me?'),
      field('goal_when', 'By when, roughly? A season is fine.'),
    ].join(''), true),
    section('Reality: where am I now?', [
      field('real_now', 'What is true right now? Facts first, feelings second.', { size: 'md' }),
      field('real_tried', 'What have I already tried, and what happened?'),
      field('real_help', 'What is already working, or helping, even a little?'),
      scale('real_score', 'On a scale of 0 to 10, how close am I to the goal today?'),
    ].join('')),
    section('Options: compare three ways forward', [
      callout(`Put down three real options, including one that feels small and one you would normally dismiss. Rate effort and fit, then look across the columns.`),
      columns([option(1), option(2), option(3)]),
      field('opt_notice', 'Looking across the three: what do I notice?', { size: 'md' }),
    ].join('')),
    section('Will: what will I do?', [
      field('will_choice', 'Which option, or which mix, will I go with?'),
      field('will_step', 'The first small step, written so that I could do it this week.'),
      field('will_when', 'When and where will I do it?'),
      field('will_block', 'What might get in the way, and what will I do if it does?'),
      field('will_support', 'Who or what could support me? (A person, a playlist, a routine…)'),
      scale('will_confidence', 'How confident am I that I will do it? (0–10)'),
      callout(`If the number is under 7, make the step smaller until it is not.`),
    ].join('')),
    section('Review', [
      callout(`Return here after you have tried the step.`),
      field('rev_what', 'What happened?', { size: 'md' }),
      scale('rev_score', 'How close am I to the goal now? (0–10)'),
      field('rev_next', 'What is the next step, or what do I want to change in the plan?'),
    ].join('')),
  ].join('');
}

export default { ...bySlug('grow'), savedNoun: 'Saved GROW worksheets', render };
