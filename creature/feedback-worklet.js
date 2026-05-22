/**
 * neural-synthesis/feedback-worklet.js
 *
 * AudioWorkletProcessor — recurrent feedback only.
 *
 * This processor does one thing: it computes the recurrent feedback
 * signal for each node at sample rate.
 *
 * Signal flow:
 *   Inputs:  up to MAX_N channels, one per node output (from the Web Audio graph)
 *   Outputs: up to MAX_N channels, one feedback injection per node
 *
 * For each output channel j:
 *   feedback_j(t) = instabilityScale * sum_i( W_rec[i][j] * x_i(t-1) )
 *
 * where W_rec contains only the weights of edges that form feedback
 * loops (identified by the main thread and sent via postMessage).
 * Feedforward edges are handled as native Web Audio GainNodes and
 * do not pass through here.
 *
 * Communication:
 *   Main thread → worklet via postMessage:
 *     { type: 'setWeights',     weights: Float32Array(MAX_N * MAX_N) }
 *     { type: 'setInstability', value: number 0..1 }
 *     { type: 'setNodeCount',   count: number }
 *     { type: 'setRecurrence',  value: number 0..1 }
 *
 * No SharedArrayBuffer required. Weight updates happen at Hebbian
 * timescale (seconds), so postMessage latency is irrelevant.
 *
 * Instability scaling:
 *   instabilityScale = 0.3 + instability * 2.2
 *   At instability=0:   scale=0.3  — heavy damping, network settles
 *   At instability=0.4: scale=1.18 — natural operating range
 *   At instability=1:   scale=2.5  — strong feedback, chaotic bursts
 *
 * Recurrence scaling:
 *   recurrenceScale = 0.2 + recurrence * 1.6
 *   Controls depth of feedback — how strongly past state influences
 *   future state, independent of the instability operating point.
 */

const MAX_N = 12;

class FeedbackProcessor extends AudioWorkletProcessor {

  constructor() {
    super();

    /* Weight matrix — recurrent edges only, row-major [from][to] */
    this._W           = new Float32Array(MAX_N * MAX_N);

    /* Previous node outputs — x(t-1) */
    this._xPrev       = new Float32Array(MAX_N);

    /* Parameters */
    this._instability = 0.4;
    this._recurrence  = 0.5;
    this._nodeCount   = 3;

    /* Derived scales (recomputed on param change) */
    this._instScale   = this._computeInstScale(0.4);
    this._recScale    = this._computeRecScale(0.5);

    /* Synaptic depression state per edge */
    this._depression  = new Float32Array(MAX_N * MAX_N).fill(1.0);

    this.port.onmessage = e => this._handleMessage(e.data);
  }

  /* ── Parameter helpers ────────────────────────────────────────── */

  _computeInstScale(instability) {
    return 0.3 + Math.max(0, Math.min(1, instability)) * 2.2;
  }

  _computeRecScale(recurrence) {
    return 0.2 + Math.max(0, Math.min(1, recurrence)) * 1.6;
  }

  /* ── Message handler ──────────────────────────────────────────── */

  _handleMessage(msg) {
    if (!msg || !msg.type) return;

    switch (msg.type) {

      case 'setWeights': {
        /* Receive recurrent weight submatrix as plain Array or Float32Array */
        const src = msg.weights;
        if (!src) break;
        const len = Math.min(src.length, MAX_N * MAX_N);
        for (let i = 0; i < len; i++) this._W[i] = src[i];
        break;
      }

      case 'setInstability': {
        this._instability = Math.max(0, Math.min(1, msg.value));
        this._instScale   = this._computeInstScale(this._instability);
        break;
      }

      case 'setRecurrence': {
        this._recurrence = Math.max(0, Math.min(1, msg.value));
        this._recScale   = this._computeRecScale(this._recurrence);
        break;
      }

      case 'setNodeCount': {
        this._nodeCount = Math.max(1, Math.min(MAX_N, Math.round(msg.count)));
        break;
      }

      default:
        break;
    }
  }

  /* ── Process ──────────────────────────────────────────────────── */

  process(inputs, outputs) {
    const N         = this._nodeCount;
    const W         = this._W;
    const xPrev     = this._xPrev;
    const dep       = this._depression;
    const instScale = this._instScale;
    const recScale  = this._recScale;

    /* inputs[i][0] = Float32Array of samples for node i's current output.
       We treat the first sample of each input channel as the current
       node output. For sample-accurate feedback we hold x(t-1) and
       update it once per block — this introduces one block of latency
       (~3ms at 128 samples / 44100Hz) which is perceptually inaudible. */

    /* Read current node outputs into xPrev (update each block) */
    for (let i = 0; i < N; i++) {
      const inputChannel = inputs[i] && inputs[i][0];
      if (inputChannel && inputChannel.length > 0) {
        /* Use block RMS as the representative value for this node */
        let rms = 0;
        for (let s = 0; s < inputChannel.length; s++) {
          rms += inputChannel[s] * inputChannel[s];
        }
        xPrev[i] = Math.sqrt(rms / inputChannel.length);
      } else {
        xPrev[i] *= 0.998;   /* slow decay when no input */
      }
    }

    /* Compute feedback for each node and write to output channels */
    for (let j = 0; j < N; j++) {
      const outputChannel = outputs[j] && outputs[j][0];
      if (!outputChannel) continue;

      /* Feedback sum: W_rec[i→j] * x_i(t-1) * depression[i,j] */
      let feedbackSum = 0;
      for (let i = 0; i < N; i++) {
        if (i === j) continue;
        const w = W[i * MAX_N + j];
        if (w === 0) continue;

        const depIdx  = i * MAX_N + j;
        const depVal  = dep[depIdx];
        const contrib = w * xPrev[i] * depVal;
        feedbackSum  += contrib;

        /* Synaptic depression update
           Active: depress by small amount per block
           Inactive: recover toward 1.0 */
        const absContrib = Math.abs(contrib);
        if (absContrib > 0.02) {
          dep[depIdx] = Math.max(0.15, depVal - 0.001 * (1 + this._instability));
        } else {
          dep[depIdx] = Math.min(1.0, depVal + 0.0004);
        }
      }

      /* Apply instability and recurrence scaling */
      const scaledFeedback = feedbackSum * instScale * recScale;

      /* Soft-clip to prevent runaway — tanh approximation */
      const clipped = scaledFeedback > 4   ?  1
                    : scaledFeedback < -4  ? -1
                    : scaledFeedback * (27 + scaledFeedback * scaledFeedback)
                      / (27 + 9 * scaledFeedback * scaledFeedback);

      /* Fill the output block with this constant feedback value.
         The native Web Audio summing junction will add this to the
         feedforward signals arriving at node j's input GainNode. */
      outputChannel.fill(clipped);
    }

    return true;
  }
}

registerProcessor('feedback-processor', FeedbackProcessor);
