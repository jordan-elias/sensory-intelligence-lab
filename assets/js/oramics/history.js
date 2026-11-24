/**
 * /assets/js/oramics/history.js
 * Undo and redo for the drawing. Each entry is the state of one layer before a change; undoing swaps it with the layer's current
 * state, so redo can swap it back. Per layer, and across all layers (the most recent change anywhere) when asked.
 */
export function createHistory({ max = 30 } = {}) {
  const undo = [], redo = [];   // entries: { layer, img, n }
  let n = 0;
  return {
    /** Call with the layer's state BEFORE a change. Clears redo. */
    record(layer, img) { undo.push({ layer, img, n: ++n }); redo.length = 0; const own = undo.filter(e => e.layer === layer); if (own.length > max) undo.splice(undo.indexOf(own[0]), 1); },
    /** Undo the last change on a layer (or the last change anywhere if layer is null). current(layer) must return the layer's present state. */
    undo(layer, current) {
      let i = -1; for (let k = undo.length - 1; k >= 0; k--) if (layer === null || undo[k].layer === layer) { i = k; break; }
      if (i < 0) return null; const e = undo.splice(i, 1)[0]; redo.push({ layer: e.layer, img: current(e.layer), n: e.n }); return e;
    },
    redo(layer, current) {
      let i = -1; for (let k = redo.length - 1; k >= 0; k--) if (layer === null || redo[k].layer === layer) { i = k; break; }
      if (i < 0) return null; const e = redo.splice(i, 1)[0]; undo.push({ layer: e.layer, img: current(e.layer), n: e.n }); return e;
    },
    clear() { undo.length = 0; redo.length = 0; },
    canUndo: layer => undo.some(e => layer === null || e.layer === layer),
    canRedo: layer => redo.some(e => layer === null || e.layer === layer),
    get sizes() { return { undo: undo.length, redo: redo.length }; },
  };
}
