/**
 * /assets/js/neural/draw.js
 * Draws the network on a canvas: neurons as circles (brighter when more active), connections as lines
 * (thicker when stronger; one colour for positive weights, another for negative), and the loss as a small trace.
 */
const hist = [];
export function layout(sizes, w, h, pad = 28) {
  const cols = sizes.length, pos = [];
  for (let l = 0; l < cols; l++) {
    const x = pad + (w - 2 * pad) * (l / (cols - 1)), n = sizes[l];
    pos.push(Array.from({ length: n }, (_, i) => ({ x, y: pad + (h - 2 * pad - 24) * ((i + 0.5) / n) })));
  }
  return pos;
}
export function draw(canvas, net, acts, loss) {
  const dpr = window.devicePixelRatio || 1, w = canvas.clientWidth, h = canvas.clientHeight;
  if (!w || !h) return;
  if (canvas.width !== Math.round(w * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
  const g = canvas.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
  const pos = layout(net.sizes, w, h);
  for (let l = 0; l < net.W.length; l++) net.W[l].forEach((row, j) => row.forEach((wt, i) => {
    if (!net.M[l][j][i]) return;
    const a = pos[l][i], b = pos[l + 1][j], flow = Math.abs((acts[l]?.[i] || 0) * wt);
    g.strokeStyle = wt > 0 ? `rgba(42,92,69,${Math.min(0.9, 0.06 + Math.abs(wt) * 0.5 + flow * 0.5)})` : `rgba(190,90,40,${Math.min(0.9, 0.06 + Math.abs(wt) * 0.5 + flow * 0.5)})`;
    g.lineWidth = 0.4 + Math.min(2.2, Math.abs(wt) * 1.6); g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
  }));
  pos.forEach((col, l) => col.forEach((p, i) => {
    const v = Math.min(1, Math.abs(acts[l]?.[i] || 0)), r = 5 + 4 * v;
    g.beginPath(); g.arc(p.x, p.y, r, 0, 6.283); g.fillStyle = `rgba(42,92,69,${0.12 + 0.88 * v})`; g.fill(); g.strokeStyle = '#2a5c45'; g.lineWidth = 1; g.stroke();
  }));
  hist.push(loss); if (hist.length > 240) hist.shift();
  const gx = 28, gy = h - 18, gw = w - 56, max = Math.max(0.3, ...hist);
  g.strokeStyle = '#b8b8b0'; g.lineWidth = 1; g.beginPath(); g.moveTo(gx, gy); g.lineTo(gx + gw, gy); g.stroke();
  g.strokeStyle = '#2a5c45'; g.beginPath(); hist.forEach((v, k) => { const x = gx + gw * (k / 239), y = gy - 16 * Math.min(1, v / max); k ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke();
  g.fillStyle = '#6b6b6b'; g.font = '10px sans-serif'; g.fillText('loss', gx, gy - 18);
}
