/**
 * /assets/js/neural/node-types.js
 * Reference text for the kinds of units in the network on this page, the activation functions, and the kinds of units
 * used in larger networks. Plain data, used by the page and tested for completeness.
 */
export const NODE_TYPES = [
  { id: 'input', name: 'Input neuron', where: 'Layer 1 (6 of them)', what: 'Holds one number from the outside world. It does no computing: it just passes its value on. Here the six inputs are a point that moves slowly along paths that never repeat, so the network always has something new to respond to.', sound: 'Not heard directly. Everything downstream is a response to these.' },
  { id: 'hidden', name: 'Hidden neuron', where: 'Layers 2 and 3', what: 'Takes a weighted sum of every neuron in the layer before, adds its bias, and passes the result through an activation function. "Hidden" only means it is neither an input nor an answer. What a hidden neuron represents is not decided by anyone: learning shapes it, and it often becomes a detector for some combination of inputs that helps reduce the error.', sound: 'Hidden layer 1 sets the loudness of the drone harmonics. Hidden layer 2 sets the shimmering upper partials.' },
  { id: 'note', name: 'Output neuron (note)', where: 'First seven neurons of the last layer', what: 'An output neuron is judged directly by the loss: it is the network\'s answer. These seven each stand for a note of the scale. The target for them is +0.9 for notes in the current chord and -0.9 for the rest, so the network is being taught to name the chord.', sound: 'Their values become probabilities, and one note is drawn each time the network plays.' },
  { id: 'gate', name: 'Output neuron (gate)', where: 'Last neuron of the last layer', what: 'A different kind of answer: not which note, but whether. It is trained toward a target level that drifts slowly, and it is the network\'s sense of "now" versus "wait".', sound: 'Decides whether a note sounds at all.' },
  { id: 'bias', name: 'Bias', where: 'One per neuron except inputs', what: 'A number added before the activation function, independent of any input. It shifts the point at which the neuron starts to respond. Without it a neuron with all-zero inputs would always output the same thing; with it, a neuron can have a baseline lean.', sound: 'Raising a bias raises a neuron\'s activation across the board.' },
  { id: 'weight', name: 'Connection (weight)', where: 'Between every pair of neurons in neighbouring layers', what: 'A number that scales how much one neuron\'s output counts toward another\'s sum. Positive weights excite, negative weights inhibit, and near-zero weights are practically cut. The weights are where everything the network "knows" is stored, and they are what learning changes.', sound: 'The strongest weight-times-activation products play as soft blips.' },
];

export const ACTIVATION_INFO = [
  { id: 'tanh', name: 'tanh', formula: 'f(z) = (e^z - e^-z) / (e^z + e^-z)', note: 'Output between -1 and +1, centred on zero. Smooth everywhere. For large positive or negative z the curve flattens, so the slope is near zero and learning through that neuron slows: this is called saturation.' },
  { id: 'softsign', name: 'softsign', formula: 'f(z) = z / (1 + |z|)', note: 'Shaped like tanh but it approaches ±1 polynomially instead of exponentially, so it saturates more gently and keeps a usable slope further out.' },
  { id: 'relu', name: 'leaky ReLU', formula: 'f(z) = z if z > 0, otherwise 0.05 z', note: 'Linear for positive inputs and nearly flat for negative ones. It never saturates on the positive side, which is a large part of why it made very deep networks trainable. The small leak keeps a neuron from going permanently dead.' },
  { id: 'sine', name: 'sine', formula: 'f(z) = sin(z)', note: 'Periodic: as z grows the output rises, falls and rises again. Networks built on it are used for representing signals such as audio and images. Here it makes a neuron respond in bands.' },
];

export const LARGER_UNITS = [
  { name: 'Convolutional filter', what: 'A small grid of shared weights that slides across an image (or a sound spectrogram), detecting the same pattern anywhere it occurs. Reusing the same weights everywhere is what makes image networks practical.' },
  { name: 'Recurrent unit (RNN, LSTM, GRU)', what: 'A neuron whose output is fed back into itself at the next time step, giving the network memory. LSTM and GRU cells add learned gates that decide what to keep, write and forget, which lets them hold information over long sequences.' },
  { name: 'Attention head', what: 'A unit that, for each position in a sequence, computes how much to look at every other position, then takes a weighted average of what it finds. Stacks of these are the core of the transformer, the architecture behind current language models.' },
  { name: 'Embedding unit', what: 'A table of learned vectors, one per word, token or item. Instead of computing a function it looks up a position in a space where similar things end up close together.' },
  { name: 'Normalisation unit', what: 'Rescales the numbers in a layer to a steady mean and spread, so that training stays well-behaved when networks are very deep.' },
  { name: 'Dropout', what: 'During training, randomly silences a share of neurons each step so that the network cannot rely on any single one. It is a way of discouraging memorisation. You can try something similar here by muting a neuron.' },
  { name: 'Softmax unit', what: 'Turns a list of numbers into probabilities that add to one. This page uses one to turn the seven note outputs into a choice of note.' },
  { name: 'Residual connection', what: 'A shortcut that adds a layer\'s input directly to its output, so information and learning signals can bypass layers. It is a key ingredient in networks with hundreds of layers.' },
];
