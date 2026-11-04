/** /assets/js/worksheets/pages/interpersonal.js */
import { bySlug } from '../registry.js';

function render() {
  return `
    <div class="ws-callout">
      <strong>A note on this worksheet</strong>
      Interpersonal effectiveness skills are often taught as scripts or formulas. This worksheet takes a different approach: it invites you to understand your own patterns, values, and needs first — and to recognise that connection looks different for different people. There is no single "right" way to relate.
    </div>

    <div class="ws-section">
      <div class="ws-section-title">How you relate — your baseline</div>
      <div class="ws-field">
        <label class="ws-label">In general, how do you prefer to connect with people? What conditions help you feel safe in relationships?</label>
        <textarea class="ws-input md" data-field="connection_style" placeholder="e.g. one-on-one vs group, slow-paced conversations, shared interests, less eye contact, text rather than phone — there's no wrong answer…"></textarea>
      </div>
      <div class="ws-field">
        <label class="ws-label">What tends to drain you in social situations, even with people you care about?</label>
        <textarea class="ws-input md" data-field="social_drain" placeholder="e.g. small talk, unpredictability, noise, being expected to perform enjoyment, large groups…"></textarea>
      </div>
      <div class="ws-field">
        <label class="ws-label">What helps you recover after demanding social interactions?</label>
        <textarea class="ws-input md" data-field="social_recovery" placeholder=""></textarea>
      </div>
      <div class="ws-field">
        <label class="ws-label">Are there ways you mask or adapt your communication style in certain contexts? What does that cost you?</label>
        <textarea class="ws-input md" data-field="masking" placeholder="No judgement — noticing is the first step…"></textarea>
      </div>
    </div>

    <div class="ws-section" style="border-top:none; margin-top:0;">
      <div class="ws-section-title">A current relationship or situation</div>
      <div class="ws-callout" style="font-size:.8rem; margin-bottom:1rem;">
        Choose one relationship or interpersonal situation that's on your mind — with a friend, partner, family member, colleague, or someone you find difficult. You don't have to name them.
      </div>
      <div class="ws-field">
        <label class="ws-label">Who is this with / what is the situation? (as much or as little detail as you want)</label>
        <textarea class="ws-input sm" data-field="situation_who" placeholder=""></textarea>
      </div>
      <div class="ws-field">
        <label class="ws-label">What do you want from this situation? <em>Be honest — there may be more than one thing.</em></label>
        <textarea class="ws-input md" data-field="what_want" placeholder="e.g. to be understood, to feel less alone, to change something, to repair something, to end something, to not lose the relationship…"></textarea>
      </div>
      <div class="ws-field">
        <label class="ws-label">What is getting in the way of that?</label>
        <textarea class="ws-input md" data-field="obstacle" placeholder="Including internal obstacles — fear, uncertainty, overwhelm, not knowing how to start…"></textarea>
      </div>
    </div>

    <div class="ws-section" style="border-top:none; margin-top:0;">
      <div class="ws-section-title">DEAR MAN — asking for what you need</div>
      <div class="ws-callout" style="font-size:.8rem; margin-bottom:1rem;">
        DEAR MAN is a DBT framework for communicating a need or request effectively. Adapt it to your style — it doesn't have to be word-for-word or formulaic. What matters is that it's honest and clear.
      </div>
      <div class="ws-field">
        <label class="ws-label"><strong>D</strong>escribe — what is the situation you want to address? (facts only, no interpretation yet)</label>
        <textarea class="ws-input sm" data-field="dear_describe" placeholder="e.g. &quot;In our last few conversations, I've noticed I end up not saying what I actually mean…&quot;"></textarea>
      </div>
      <div class="ws-field">
        <label class="ws-label"><strong>E</strong>xpress — what are your feelings about it? <em>Use "I" statements rather than "you" statements.</em></label>
        <textarea class="ws-input sm" data-field="dear_express" placeholder="e.g. &quot;I feel unheard&quot; rather than &quot;you never listen&quot;…"></textarea>
      </div>
      <div class="ws-field">
        <label class="ws-label"><strong>A</strong>ssert — what specifically are you asking for? <em>Be concrete. Vague requests are harder to meet.</em></label>
        <textarea class="ws-input sm" data-field="dear_assert" placeholder="What exactly do you want them to do, stop doing, or understand?"></textarea>
      </div>
      <div class="ws-field">
        <label class="ws-label"><strong>R</strong>einforce — why might this benefit them / the relationship too?</label>
        <textarea class="ws-input sm" data-field="dear_reinforce" placeholder="What does meeting this need make possible for both of you?"></textarea>
      </div>
      <div class="ws-field">
        <label class="ws-label"><strong>M</strong>indful — what might you watch out for? (distractions, defensiveness, getting derailed)</label>
        <textarea class="ws-input sm" data-field="dear_mindful" placeholder=""></textarea>
      </div>
      <div class="ws-field">
        <label class="ws-label"><strong>A</strong>ppear confident — how do you want to come across, even if you're nervous?</label>
        <textarea class="ws-input sm" data-field="dear_appear" placeholder="What posture, tone, or approach do you want to bring?"></textarea>
      </div>
      <div class="ws-field">
        <label class="ws-label"><strong>N</strong>egotiate — what are you flexible on? What is non-negotiable?</label>
        <textarea class="ws-input sm" data-field="dear_negotiate" placeholder="Knowing your limits in advance helps you stay clear during the conversation…"></textarea>
      </div>
    </div>

    <div class="ws-section" style="border-top:none; margin-top:0;">
      <div class="ws-section-title">GIVE — maintaining the relationship</div>
      <div class="ws-callout" style="font-size:.8rem; margin-bottom:1rem;">
        GIVE focuses on how to hold the relationship with care, even in difficult conversations. These aren't about appeasing — they're about approaching with the relationship in mind.
      </div>
      <div class="ws-field">
        <label class="ws-label"><strong>G</strong>entle — how can you be direct without being harsh? What tone do you want to bring?</label>
        <textarea class="ws-input sm" data-field="give_gentle" placeholder=""></textarea>
      </div>
      <div class="ws-field">
        <label class="ws-label"><strong>I</strong>nterested — what might this look like from their perspective?</label>
        <textarea class="ws-input md" data-field="give_interested" placeholder="Try to genuinely imagine their experience — what pressures, fears, or needs might they be carrying?"></textarea>
      </div>
      <div class="ws-field">
        <label class="ws-label"><strong>V</strong>alidate — what is real or understandable about their perspective, even if you disagree?</label>
        <textarea class="ws-input sm" data-field="give_validate" placeholder="Validation doesn't mean agreement — it means acknowledging their reality…"></textarea>
      </div>
      <div class="ws-field">
        <label class="ws-label"><strong>E</strong>asy manner — how do you hold lightness, even in difficulty?</label>
        <textarea class="ws-input sm" data-field="give_easy" placeholder="What helps you stay out of rigidity or defensiveness?"></textarea>
      </div>
    </div>

    <div class="ws-section" style="border-top:none; margin-top:0;">
      <div class="ws-section-title">Boundaries and self-respect</div>
      <div class="ws-callout" style="font-size:.8rem; margin-bottom:1rem;">
        Boundaries aren't walls — they're information about what you need to remain present and safe in a relationship. They protect the connection as much as they protect you.
      </div>
      <div class="ws-field">
        <label class="ws-label">In this situation (or in general), where do you feel your limits are? What behaviour is not okay with you?</label>
        <textarea class="ws-input md" data-field="boundaries" placeholder="Try to be specific — vague limits are hard to hold…"></textarea>
      </div>
      <div class="ws-field">
        <label class="ws-label">What makes it hard to hold those limits? (fear of conflict, fear of rejection, guilt, uncertainty about whether your limits are "valid")</label>
        <textarea class="ws-input md" data-field="boundary_hard" placeholder=""></textarea>
      </div>
      <div class="ws-field">
        <label class="ws-label">What would holding this limit say about how you value yourself?</label>
        <textarea class="ws-input md" data-field="boundary_self_value" placeholder=""></textarea>
      </div>
    </div>

    <div class="ws-section" style="border-top:none; margin-top:0;">
      <div class="ws-section-title">Connection and music</div>
      <div class="ws-field">
        <label class="ws-label">Is there a song that captures something about this relationship or situation — or about how you experience connection in general?</label>
        <textarea class="ws-input md" data-field="connection_song" placeholder="It might be something that says what you can't, or that describes the dynamic you're in…"></textarea>
      </div>
      <div class="ws-field">
        <label class="ws-label">What does music teach you about connection that your daily life doesn't?</label>
        <textarea class="ws-input md" data-field="music_connection" placeholder=""></textarea>
      </div>
    </div>
  `;
}

export default {
  ...bySlug('interpersonal'),
  savedNoun: 'Saved interpersonal worksheets',
  render,
};
