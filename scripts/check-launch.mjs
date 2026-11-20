// Lists anything that must be filled in before launch: every [[CAPITALISED PLACEHOLDER]] left in an HTML page.
// Run: npm run check:launch   (exits 1 while something is left, so it can guard a release)
import fs from 'fs'; import path from 'path';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const left = [];
(function walk(d) {
  for (const f of fs.readdirSync(d, { withFileTypes: true })) {
    if (['node_modules', '.git', 'tests', 'android-app', 'docs'].includes(f.name)) continue;
    const p = path.join(d, f.name);
    if (f.isDirectory()) walk(p);
    else if (/\.html$/.test(f.name)) fs.readFileSync(p, 'utf8').split('\n').forEach((l, i) => { const m = l.match(/\[\[[A-Z]{3,}[^\]]*\]\]/g); if (m) m.forEach(x => left.push(`${path.relative(root, p)}:${i + 1}  ${x.slice(0, 90)}`)); });
  }
})(root);
if (left.length) { console.log(`${left.length} blank(s) to fill in before launch:\n` + left.join('\n')); process.exit(1); }
console.log('Nothing left to fill in.');
