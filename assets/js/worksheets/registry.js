/**
 * /assets/js/worksheets/registry.js
 * One place that maps URL slug -> database `type` value.
 * Keep the `type` values unchanged: they are what existing saved rows use.
 */
export const WORKSHEETS = [
  { slug: 'goals-values',        type: 'goals',              label: 'Goals & Values',
    blurb: "Reflect on what's going well, what to nurture, and set intentions across key life areas." },
  { slug: 'music-autobiography', type: 'music-auto',         label: 'Music Autobiography',
    blurb: 'Map the soundtrack of your life: songs and memories across chapters of your story.' },
  { slug: 'session-reflection',  type: 'session-reflection', label: 'Session Reflection',
    blurb: 'Process and integrate your experience following a music therapy session.' },
  { slug: 'lyric-analysis',      type: 'lyric-analysis',     label: 'Lyric Analysis',
    blurb: 'Choose a song, select meaningful lyrics, and explore what they reveal about you.' },
  { slug: 'coping',              type: 'coping',             label: 'Coping & Distress Tolerance',
    blurb: 'DBT-informed tools for navigating difficult emotions and moments of distress.' },
  { slug: 'interpersonal',       type: 'interpersonal',      label: 'Interpersonal Effectiveness',
    blurb: 'Explore connection, communication, and relationships in a neurodiversity-affirming way.' },
];

export const bySlug = slug => WORKSHEETS.find(w => w.slug === slug);
export const byType = type => WORKSHEETS.find(w => w.type === type);
