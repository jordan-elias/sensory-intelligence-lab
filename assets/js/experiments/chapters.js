/**
 * /assets/js/experiments/chapters.js
 * The chapter sittings of the course. Same shape as a catalog experiment, so the player, notebook and seed box treat them alike.
 * DRAFT WORDING: every prompt below is a first draft for Jordan to pilot and rewrite. Chapters 4 to 8 are not written yet.
 * A sitting is: arrive, warm up, core, harvest (keep seeds), notice, carry. Each one ends by keeping at least one seed.
 */
const note = (label, target, placeholder) => ({ type: 'pad', label, target, placeholder });
const sitting = (o) => ({ category: 'chapter', needs: 'none', solo: 'Do it on paper, with a timer on your phone.', ...o });

export const CHAPTERS = [
  { id: 'arrival', number: 1, title: 'Arrival', intro: 'Before you make anything, notice where you are. Nothing here is judged, and nothing has to be good.', sittings: [
    sitting({ id: 'ch1-first-page', title: 'The first page', minutes: 10,
      summary: 'Write what is true right now, in sound and in body, for five minutes.',
      question: 'What is here before I start?',
      parameters: [['Time', '5 minutes'], ['Rule', 'No crossing out']],
      procedure: [
        'Sit. Let your shoulders drop. Listen for the farthest sound you can hear.',
        'Write everything you hear, near and far, for 5 minutes. Do not tidy it.',
        'Circle one sound you would like to hear again. Keep that line as a seed.',
      ],
      stop: 'When the five minutes end.', reflect: 'Which sound did you not notice until you wrote it down?',
      tools: [note('What I heard', 8, 'A truck, a fridge, my own breath…'), { type: 'timer', minutes: 5 }] }),
    sitting({ id: 'ch1-no-judge', title: 'The quiet editor', minutes: 12,
      summary: 'Meet the voice that says it is not good enough, and give it somewhere to go.',
      question: 'What does my inner critic say, and what happens if I write it down instead of obeying it?',
      parameters: [['Time', '6 minutes'], ['Rule', 'Write the critic\'s words exactly']],
      procedure: [
        'Write the sentences your inner critic says about your music, word for word, for 3 minutes.',
        'Under each one, write what you would say to a friend who said it about their own work, for 3 minutes.',
        'Keep one of your replies as a seed. It is yours to reread.',
      ],
      stop: 'After six minutes.', reflect: 'Which sentence has been there the longest?',
      tools: [note('The critic, and my reply', 10, 'The critic says…'), { type: 'timer', minutes: 6 }] }),
    sitting({ id: 'ch1-why-sound', title: 'Why sound', minutes: 15,
      summary: 'Collect the first times sound mattered to you.',
      question: 'Where did my relationship with sound begin?',
      parameters: [['List', 'At least 10'], ['Time', '8 minutes']],
      procedure: [
        'List sounds, songs or rooms you remember from before you were twelve. Aim for ten or more.',
        'Star the three that still pull at you.',
        'Pick one star. Write what you would make if you were allowed to make only that. Keep it as a seed.',
      ],
      stop: 'After eight minutes.', reflect: 'What do the starred ones have in common?',
      tools: [note('My first sounds', 10, 'The hum of my grandmother\'s kitchen…'), { type: 'timer', minutes: 8 }] }),
  ] },
  { id: 'listening', number: 2, title: 'Listening', intro: 'Listening is the first instrument. These sittings train it, and each one leaves you with material.', sittings: [
    sitting({ id: 'ch2-listening-walk', title: 'A listening walk', minutes: 15,
      summary: 'Walk slowly and collect sounds as if they were objects.',
      question: 'What would I notice if I listened as carefully as I look?',
      parameters: [['Time', '10 minutes'], ['Phone', 'Silent, in a pocket']],
      procedure: [
        'Go to a door, a street or a room you know well. Walk slowly for 10 minutes and listen only.',
        'When you stop, write the sounds you remember, in the order they came.',
        'Keep the three most surprising as seeds.',
      ],
      stop: 'After ten minutes of walking.', reflect: 'Which sound was there every day and never heard?',
      tools: [{ type: 'timer', minutes: 10 }, note('Sounds I remember', 8, 'First, a gate…')] }),
    sitting({ id: 'ch2-one-sound', title: 'One sound, closely', minutes: 12,
      summary: 'Stay with a single sound until it changes.',
      question: 'What is inside one ordinary sound?',
      parameters: [['Time', '5 minutes'], ['Sound', 'Any one, steady']],
      procedure: [
        'Choose one steady sound: a fan, a tap, a hum. Listen for 5 minutes.',
        'Describe it with words that are not sound words, such as texture, weather or temperature.',
        'Keep the best description as a seed.',
      ],
      stop: 'After five minutes.', reflect: 'What changed when you stayed?',
      tools: [{ type: 'timer', minutes: 5 }, note('Describing it', 6, 'It feels like…')] }),
    sitting({ id: 'ch2-paint-it', title: 'Paint what you heard', minutes: 20,
      summary: 'Draw a sound as colour in Oramics, then hear it back.',
      question: 'What does my memory of a sound look like, and how does it sound when I draw it?',
      parameters: [['Tool', 'Oramics'], ['Time', '15 minutes']],
      procedure: [
        'Open Oramics from the link. Choose one sound from your walk.',
        'Paint it with one ink for 10 minutes. Thick marks are loud, high marks are high. Press play.',
        'Choose Keep as a seed in Oramics.',
      ],
      stop: 'After fifteen minutes.', reflect: 'What did the painted version have that you did not expect?',
      links: [{ href: '/compositions/oramics.html', label: 'Open Oramics' }],
      tools: [{ type: 'timer', minutes: 10 }, note('What I painted', 4, 'The gate, as a low green line…')] }),
  ] },
  { id: 'state-body', number: 3, title: 'State and body', intro: 'Sound changes how you feel, and how you feel changes what you make. These sittings use that on purpose.', sittings: [
    sitting({ id: 'ch3-check-in', title: 'Where am I, in sound', minutes: 10,
      summary: 'Match a sound to your present state, without trying to change it.',
      question: 'What sound is the same as how I feel now?',
      parameters: [['Time', '5 minutes'], ['Rule', 'Match, do not fix']],
      procedure: [
        'Put a hand on your chest. Name how you feel in one or two words.',
        'Describe the sound that would match it. Speed, size, brightness, space. Write for 5 minutes.',
        'Keep the description as a seed. Do not try to feel different.',
      ],
      stop: 'After five minutes.', reflect: 'Was it easier to name a feeling or a sound?',
      tools: [note('My state as a sound', 6, 'Slow, low, a little dry…'), { type: 'timer', minutes: 5 }] }),
    sitting({ id: 'ch3-shift', title: 'A small shift', minutes: 20,
      summary: 'Move from where you are one step towards where you would like to be, using sound.',
      question: 'What happens if the music starts where I am and moves a little?',
      parameters: [['Steps', 'Three'], ['Time', '12 minutes']],
      procedure: [
        'Write where you are now and where you would like to be, one line each.',
        'Write three sounds in between, from the first towards the second, for 8 minutes.',
        'Open the Regulation Engine if you want to hear a path. Keep your three steps as a seed.',
      ],
      stop: 'After twelve minutes.', reflect: 'Which step felt most real?',
      links: [{ href: '/regulation/', label: 'Open the Regulation Engine' }],
      tools: [note('Where, and three steps', 8, 'Now: … Step 1: … Step 2: … Then: …'), { type: 'timer', minutes: 8 }] }),
    sitting({ id: 'ch3-body-rhythm', title: 'Body first', minutes: 12,
      summary: 'Find a rhythm in your body before you find it on an instrument.',
      question: 'What rhythm is already moving in me?',
      parameters: [['Time', '5 minutes']],
      procedure: [
        'Sit still and find a pulse in your body: breath, heartbeat, a foot, a jaw. Follow it for 3 minutes.',
        'Tap it quietly, then change it a little. Tap that for 2 minutes.',
        'Write the pattern as words or marks. Keep it as a seed.',
      ],
      stop: 'After five minutes.', reflect: 'Where in the body did it live?',
      tools: [{ type: 'timer', minutes: 5 }, note('My pattern', 4, 'long, short, short, long…')] }),
  ] },
];

export const CHAPTER_SITTINGS = CHAPTERS.flatMap(c => c.sittings.map(s => ({ ...s, chapter: c.id })));
export const chapterOf = id => CHAPTERS.find(c => c.sittings.some(s => s.id === id)) || null;
