/**
 * /assets/js/neural/draw.js
 * Draws the network on a canvas: neurons as circles (brighter when more active), connections as lines
 * (thicker when stronger; one colour for positive weights, another for negative), and the loss as a small trace.
 */
const hist = [];
export function layout(sizes, w, h, pad = 44) {
  const cols = sizes.length, pos = [];
  for (let l = 0; l < cols; l++) {
    const x = pad + (w - 2 * pad) * (l / (cols - 1)), n = sizes[l];
    pos.push(Array.from({ length: n }, (_, i) => ({ x, y: pad + (h - 2 * pad - 24) * ((i + 0.5) / n) })));
  }
  return pos;
}
const LABELS = ['input', 'hidden 1 · drone', 'hidden 2 · shimmer', 'output · notes and gate'];
/** What is under a point on the canvas: a neuron, a connection, or nothing. */
export function hitTest(canvas, net, x, y) {
  const w = canvas.clientWidth, h = canvas.clientHeight, pos = layout(net.sizes, w, h);
  let best = null;
  pos.forEach((col, l) => col.forEach((p, i) => { const d = Math.hypot(p.x - x, p.y - y); if (d <= 13 && (!best || d < best.d)) best = { kind: 'node', layer: l, i, d }; }));
  if (best) return best;
  for (let l = 0; l < net.W.length; l++) net.W[l].forEach((row, j) => row.forEach((wt, i) => {
    if (!net.M[l][j][i]) return;
    const a = pos[l][i], b = pos[l + 1][j], dx = b.x - a.x, dy = b.y - a.y, t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy))), d = Math.hypot(a.x + t * dx - x, a.y + t * dy - y);
    if (d <= 5 && (!best || d < best.d)) best = { kind: 'edge', layer: l, j, i, d };
  }));
  return best;
}
export function draw(canvas, net, acts, loss, sel = null, opts = {}) {
  const dpr = window.devicePixelRatio || 1, w = canvas.clientWidth, h = canvas.clientHeight;
  if (!w || !h) return;
  if (canvas.width !== Math.round(w * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
  const g = canvas.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
  const pos = layout(net.sizes, w, h);
  for (let l = 0; l < net.W.length; l++) net.W[l].forEach((row, j) => row.forEach((wt, i) => {
    if (!net.M[l][j][i]) return;
    const a = pos[l][i], b = pos[l + 1][j], flow = Math.abs((acts[l]?.[i] || 0) * wt);
    g.strokeStyle = wt > 0 ? `rgba(42,92,69,${Math.min(0.9, 0.06 + Math.abs(wt) * 0.5 + flow * 0.5)})` : `rgba(190,90,40,${Math.min(0.9, 0.06 + Math.abs(wt) * 0.5 + flow * 0.5)})`;
    g.lineWidth = 0.4 + Math.min(2.2, Math.abs(wt) * 1.6);
    if (sel && sel.kind === 'edge' && sel.layer === l && sel.j === j && sel.i === i) { g.strokeStyle = '#111'; g.lineWidth = 3.2; }
    else if (sel && sel.kind === 'node' && ((sel.layer === l && sel.i === i) || (sel.layer === l + 1 && sel.i === j))) { g.lineWidth += 1.2; }
    g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
  }));
  pos.forEach((col, l) => col.forEach((p, i) => {
    const v = Math.min(1, Math.abs(acts[l]?.[i] || 0)), r = 5 + 4 * v;
    const muted = net.mute[l][i], chosen = sel && sel.kind === 'node' && sel.layer === l && sel.i === i;
    g.beginPath(); g.arc(p.x, p.y, r, 0, 6.283); g.fillStyle = muted ? 'rgba(150,150,150,.25)' : `rgba(42,92,69,${0.12 + 0.88 * v})`; g.fill();
    g.strokeStyle = chosen ? '#111' : muted ? '#999' : '#2a5c45'; g.lineWidth = chosen ? 3 : 1; if (muted) g.setLineDash([3, 2]); g.stroke(); g.setLineDash([]);
    if (net.frozen[l][i]) { g.fillStyle = '#2a5c45'; g.fillRect(p.x - 2, p.y - r - 5, 4, 3); }
  }));
  g.fillStyle = '#6b6b6b'; g.font = '10px sans-serif'; g.textAlign = 'center';
  const names = opts.layers || LABELS; pos.forEach((col, l) => g.fillText(names[l] || '', col[0].x, 12)); g.textAlign = 'left';
  if (opts.inputs) { g.textAlign = 'right'; g.fillStyle = '#444'; pos[0].forEach((p, i) => g.fillText(opts.inputs[i] || '', p.x - 11, p.y + 3)); }
  if (opts.outputs) { g.textAlign = 'left'; g.fillStyle = '#444'; pos[pos.length - 1].forEach((p, i) => g.fillText(opts.outputs[i] || '', p.x + 11, p.y + 3)); }
  g.textAlign = 'left';
  hist.push(loss); if (hist.length > 240) hist.shift();
  const gx = 28, gy = h - 18, gw = w - 56, max = Math.max(0.3, ...hist);
  g.strokeStyle = '#b8b8b0'; g.lineWidth = 1; g.beginPath(); g.moveTo(gx, gy); g.lineTo(gx + gw, gy); g.stroke();
  g.strokeStyle = '#2a5c45'; g.beginPath(); hist.forEach((v, k) => { const x = gx + gw * (k / 239), y = gy - 16 * Math.min(1, v / max); k ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke();
  g.fillStyle = '#6b6b6b'; g.font = '10px sans-serif'; g.fillText('loss', gx, gy - 18);
}
