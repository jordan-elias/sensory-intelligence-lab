/** /assets/js/worksheets/pages/session-reflection.js */
import { bySlug } from '../registry.js';

function render() {
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  return `
    <div class="ws-section">
      <div class="ws-section-title">About this session</div>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:.75rem;">
        <div class="ws-field">
          <label class="ws-label">Date</label>
          <input type="text" class="ws-input" data-field="session_date" value="${dateStr}">
        </div>
        <div class="ws-field">
          <label class="ws-label">Session number / type</label>
          <input type="text" class="ws-input" data-field="session_type" placeholder="e.g. Session 4, Individual, Group…">
        </div>
      </div>
      <div class="ws-field">
        <label class="ws-label">Music or activities in this session</label>
        <textarea class="ws-input sm" data-field="session_music" placeholder="Songs listened to, improvised, created, sung…"></textarea>
      </div>
    </div>

    <div class="ws-section" style="border-top:none; margin-top:0;">
      <div class="ws-section-title">During the session</div>
      <div class="ws-field">
        <label class="ws-label">How were you feeling when you arrived?</label>
        <textarea class="ws-input sm" data-field="before_feeling" placeholder="Emotionally, physically, mentally…"></textarea>
      </div>
      <div class="ws-field">
        <label class="ws-label">What moment stood out most to you — and what do you think made it significant?</label>
        <textarea class="ws-input md" data-field="standout_moment" placeholder="It might be something that moved you, surprised you, made you uncomfortable, or felt important…"></textarea>
      </div>
      <div class="ws-field">
        <label class="ws-label">Where did you notice sensation or emotion in your body during the session?</label>
        <textarea class="ws-input md" data-field="body_sensation" placeholder="Tension, release, warmth, contraction, energy — wherever and however you noticed it…"></textarea>
      </div>
      <div class="ws-field">
        <label class="ws-label">Was there anything that felt difficult, uncomfortable, or that you wanted to avoid?</label>
        <textarea class="ws-input md" data-field="difficult" placeholder="No judgment — this is useful information too…"></textarea>
      </div>
    </div>

    <div class="ws-section" style="border-top:none; margin-top:0;">
      <div class="ws-section-title">After the session</div>
      <div class="ws-field">
        <label class="ws-label">How are you feeling now, compared to when you arrived?</label>
        <textarea class="ws-input sm" data-field="after_feeling" placeholder="Notice shifts, even subtle ones…"></textarea>
      </div>
      <div class="ws-field">
        <label class="ws-label">What is one thing you are taking with you from this session — an insight, a feeling, a question?</label>
        <textarea class="ws-input md" data-field="takeaway" placeholder=""></textarea>
      </div>
      <div class="ws-field">
        <label class="ws-label">Is there something you want to remember, explore further, or bring to the next session?</label>
        <textarea class="ws-input md" data-field="bring_next" placeholder=""></textarea>
      </div>
    </div>

    <div class="ws-section" style="border-top:none; margin-top:0;">
      <div class="ws-section-title">Rate this session</div>
      <div class="ws-field">
        <label class="ws-label">Overall, how did this session feel? <em>(1 = very difficult / not useful · 10 = exactly what I needed)</em></label>
        <div class="scale-row" data-for="sessionRating"></div>
        <div class="scale-labels"><span>Very difficult</span><span>Exactly right</span></div>
        <input type="hidden" data-field="session_rating" id="sessionRating" value="">
      </div>
      <div class="ws-field">
        <label class="ws-label">Anything you'd like to share with your therapist about this session?</label>
        <textarea class="ws-input md" data-field="for_therapist" placeholder="Optional — this is your space first…"></textarea>
      </div>
    </div>
  `;
}

export default {
  ...bySlug('session-reflection'),
  savedNoun: 'Saved session reflections',
  render,
};
