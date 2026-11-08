// Builds assets/icons/sprite.svg from Lucide (ISC licence) icons.
// Usage: node scripts/build-icon-sprite.mjs /path/to/node_modules/lucide-static/icons
// To add an icon: add its name to ICONS below, run this, commit the new sprite.
import fs from 'fs';
import path from 'path';

const ICONS = [
  'play', 'pause', 'square', 'circle', 'rotate-ccw', 'download', 'upload', 'trash-2', 'save', 'x', 'check',
  'mic', 'volume-2', 'volume-x', 'headphones', 'menu', 'chevron-down', 'chevron-up', 'chevron-left', 'chevron-right',
  'arrow-left', 'plus', 'minus', 'settings', 'info', 'lock', 'send', 'skip-forward', 'skip-back', 'repeat', 'pencil',
  'copy', 'share-2', 'eye', 'eye-off', 'calendar', 'circle-help', 'triangle-alert', 'music', 'wind',
];
const dir = process.argv[2];
if (!dir) { console.error('Pass the path to lucide-static/icons'); process.exit(1); }
const symbols = ICONS.map((name) => {
  const svg = fs.readFileSync(path.join(dir, name + '.svg'), 'utf8');
  const inner = svg.replace(/<!--.*?-->/gs, '').replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '').trim().replace(/\s+/g, ' ');
  return `<symbol id="${name}" viewBox="0 0 24 24">${inner}</symbol>`;
});
const out = `<svg xmlns="http://www.w3.org/2000/svg" style="display:none">\n<!-- Lucide icons (ISC licence, see sprite-LICENSE.txt). Built by scripts/build-icon-sprite.mjs -->\n${symbols.join('\n')}\n</svg>\n`;
fs.writeFileSync('assets/icons/sprite.svg', out);
console.log(`${ICONS.length} icons, ${out.length} bytes`);
