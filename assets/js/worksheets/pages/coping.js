/** /assets/js/worksheets/pages/coping.js */
import { bySlug } from '../registry.js';
import { restoreFields } from '../ui.js';

function render() {
  return `
    <div class="ws-callout">
      <strong>About this worksheet</strong>
      Distress tolerance isn't about making problems disappear — it's about getting through a difficult moment without making things worse. These tools are drawn from DBT (Dialectical Behaviour Therapy). Work through them as you need: in a moment of distress, or as preparation.
    </div>

    <div class="ws-callout ws-callout--care" role="note">
      <strong>If you are in immediate danger</strong>
      If you are thinking about ending your life or harming yourself, please contact emergency services (112 in Germany and across the EU) or Telefonseelsorge, free and open 24/7: 0800 111 0 111 or 116 123. Outside Germany, findahelpline.com lists services by country. You don't have to get through this alone.
    </div>

    <div class="ws-section">
      <div class="ws-section-title">Right now</div>
      <div class="ws-field">
        <label class="ws-label">What is happening? (briefly — you don't have to give every detail)</label>
        <textarea class="ws-input md" data-field="situation" placeholder="Just enough to orient yourself to what you're dealing with…"></textarea>
      </div>
      <div class="ws-field">
        <label class="ws-label">What emotion(s) are present? How intense are they?</label>
        <div class="tag-row" id="emotionTags">
          ${['Overwhelmed','Anxious','Angry','Sad','Numb','Ashamed','Scared','Lonely','Frustrated','Confused','Hopeless','Hurt'].map(e =>
            `<button type="button" class="tag-pill">${e}</button>`
          ).join('')}
        </div>
        <div style="margin-top:.6rem;">
          <label class="ws-label">Add your own</label>
          <input type="text" class="ws-input" data-field="emotion_other" placeholder="Other feelings…" style="max-width:300px;">
        </div>
      </div>
      <div class="ws-field">
        <label class="ws-label">Distress level right now <em>(1 = manageable · 10 = crisis level)</em></label>
        <div class="scale-row" data-for="distressLevel"></div>
        <div class="scale-labels"><span>Manageable</span><span>Crisis level</span></div>
        <input type="hidden" data-field="distress_level" id="distressLevel" value="">
        <div class="ws-callout ws-callout--care" id="distressHelp" hidden role="status">
          <strong>That is a very high level of distress</strong>
          Start with one quick tool below, such as cold water on your face or slow breathing with a long exhale. If you feel unsafe, please reach out to someone now: Telefonseelsorge 0800 111 0 111 or 116 123 (free, 24/7), or 112 in an emergency.
        </div>
      </div>
      <div class="ws-field">
        <label class="ws-label">What does your body feel like right now? Where do you notice distress physically?</label>
        <textarea class="ws-input md" data-field="body_now" placeholder="Chest tightness, jaw tension, shallow breathing, heaviness, restlessness…"></textarea>
      </div>
    </div>

    <div class="ws-section" style="border-top:none; margin-top:0;">
      <div class="ws-section-title">TIPP — quick regulation tools</div>
      <div class="ws-callout" style="margin-bottom:1rem; font-size:.8rem;">
        TIPP (Temperature, Intense exercise, Paced breathing, Progressive muscle relaxation) works directly on the body's nervous system. These are not solutions — they're tools to bring distress down enough to think clearly.
      </div>
      <div class="skill-checklist" id="tippList">
        <label class="skill-item"><input type="checkbox"><span class="skill-item-body"><span class="skill-item-name">Temperature — cold water on face / wrists</span><span class="skill-item-desc">Hold cold water on your face or wrists for 30 seconds. This activates the dive reflex, slowing your heart rate and calming the nervous system quickly.</span></span></label>
        <label class="skill-item"><input type="checkbox"><span class="skill-item-body"><span class="skill-item-name">Intense exercise — brief, vigorous movement</span><span class="skill-item-desc">Even 1–2 minutes of jumping, running, or intense movement can discharge adrenaline and shift the emotional state significantly.</span></span></label>
        <label class="skill-item"><input type="checkbox"><span class="skill-item-body"><span class="skill-item-name">Paced breathing — slow exhale</span><span class="skill-item-desc">Inhale for 4 counts, exhale for 6–8. The longer exhale activates the parasympathetic system. Repeat for 2–3 minutes.</span></span></label>
        <label class="skill-item"><input type="checkbox"><span class="skill-item-body"><span class="skill-item-name">Progressive muscle relaxation</span><span class="skill-item-desc">Systematically tense and release muscle groups from feet to face. Helps release physical tension held during distress.</span></span></label>
      </div>
    </div>

    <div class="ws-section" style="border-top:none; margin-top:0;">
      <div class="ws-section-title">ACCEPTS — distraction with purpose</div>
      <div class="ws-callout" style="margin-bottom:1rem; font-size:.8rem;">
        ACCEPTS is a DBT distraction skill. Distraction isn't avoidance — it's a way to survive a moment without acting on it. The goal is to tolerate, not to fix.
      </div>
      <div class="skill-checklist">
        ${renderAcceptsSkills()}
      </div>
    </div>

    <div class="ws-section" style="border-top:none; margin-top:0;">
      <div class="ws-section-title">Radical acceptance</div>
      <div class="ws-callout" style="margin-bottom:1rem; font-size:.8rem;">
        Radical acceptance means acknowledging reality as it is — not approving of it, not giving up on changing it, but stopping the fight against what already is. Pain is inevitable; suffering is often the result of refusing to accept it.
      </div>
      <div class="ws-field">
        <label class="ws-label">What is the reality of this situation that is hardest to accept?</label>
        <textarea class="ws-input md" data-field="hardest_accept" placeholder="Try to name it plainly…"></textarea>
      </div>
      <div class="ws-field">
        <label class="ws-label">What does non-acceptance cost you (in energy, mood, action)?</label>
        <textarea class="ws-input md" data-field="non_acceptance_cost" placeholder=""></textarea>
      </div>
      <div class="ws-field">
        <label class="ws-label">A statement of acceptance (even if partial)</label>
        <textarea class="ws-input sm" data-field="acceptance_statement" placeholder="e.g. &quot;This is painful. It is real. I can get through it.&quot;"></textarea>
      </div>
    </div>

    <div class="ws-section" style="border-top:none; margin-top:0;">
      <div class="ws-section-title">Music as a coping tool</div>
      <div class="ws-field">
        <label class="ws-label">Is there a song or type of music that helps you regulate when distressed? What does it do?</label>
        <textarea class="ws-input md" data-field="music_coping" placeholder="Think about tempo, texture, lyrics, memory associations…"></textarea>
      </div>
      <div class="ws-field">
        <label class="ws-label">Create a brief coping playlist — 3 to 5 songs for a hard moment</label>
        <textarea class="ws-input md" data-field="coping_playlist" placeholder="List them here, with a note on why each one…"></textarea>
      </div>
    </div>

    <div class="ws-section" style="border-top:none; margin-top:0;">
      <div class="ws-section-title">After the moment</div>
      <div class="ws-field">
        <label class="ws-label">What helped most? What would you do differently next time?</label>
        <textarea class="ws-input md" data-field="what_helped" placeholder=""></textarea>
      </div>
      <div class="ws-field">
        <label class="ws-label">What does this moment tell you about what you need more of in your life?</label>
        <textarea class="ws-input md" data-field="what_need" placeholder=""></textarea>
      </div>
    </div>
  `;
}

function renderAcceptsSkills() {
  const items = [
    ['Activities', 'Engage in an absorbing activity — something that demands enough attention to pull you away from the distress.'],
    ['Contributing', 'Do something for someone else, however small. Shifting focus outward can shift emotion.'],
    ['Comparisons', 'Compare this moment to a harder time you survived, or to others who are struggling. Not to minimise — to gain perspective.'],
    ['Emotions (opposite)', 'Do something that evokes a different emotion — watch something funny, listen to something uplifting, look at something beautiful.'],
    ['Pushing away (temporarily)', 'Mentally set the situation aside for a defined period. Tell yourself you\'ll return to it — and then do something else.'],
    ['Thoughts', 'Occupy your mind — count, read, do a puzzle, recite something. Crowd out the spiralling thoughts with different ones.'],
    ['Sensations', 'Use strong (but safe) sensory input — a scent, a texture, a flavour — to anchor yourself in the present moment.'],
  ];
  return items.map(([name, desc]) =>
    `<label class="skill-item"><input type="checkbox"><span class="skill-item-body"><span class="skill-item-name">${name}</span><span class="skill-item-desc">${desc}</span></span></label>`
  ).join('');
}

function updateDistressHelp(root) {
  const level = Number(root.querySelector('#distressLevel')?.value || 0);
  const box = root.querySelector('#distressHelp');
  if (box) box.hidden = level < 9;
}

export default {
  ...bySlug('coping'),
  savedNoun: 'Saved coping worksheets',
  render,
  init({ root }) {
    root.addEventListener('click', e => { if (e.target.closest('.scale-btn')) queueMicrotask(() => updateDistressHelp(root)); });
    this._root = root;
  },
  restore(payload) {
    restoreFields(this._root, payload.data || {});
    updateDistressHelp(this._root);
  },
};
