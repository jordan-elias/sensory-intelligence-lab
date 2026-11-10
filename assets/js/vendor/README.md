# Vendored third-party code

Files here are served from our own origin on purpose: pages that handle private
content must not load executable code from third-party CDNs.

| File | Package | Version | Licence | Source |
| --- | --- | --- | --- | --- |
| hash-wasm-argon2.umd.min.js | hash-wasm (Argon2 build) | 4.12.0 | MIT (hash-wasm-LICENSE.txt) | https://www.npmjs.com/package/hash-wasm |
| sortable.esm.js | sortablejs (modular ES build) | 1.15.7 | MIT (sortable-LICENSE.txt) | https://www.npmjs.com/package/sortablejs |
| supabase-js.js | @supabase/supabase-js (bundled with esbuild: `export { createClient }`, minified, ES2020) | 2.104.0 | MIT (supabase-js-LICENSE.txt) | https://www.npmjs.com/package/@supabase/supabase-js |
| resonance-audio.min.js | resonance-audio | 1.0.0 | Apache-2.0 (resonance-audio-LICENSE.txt) | https://www.npmjs.com/package/resonance-audio |
| compromise.js | compromise | 14.14.0 | MIT (compromise-LICENSE.txt) | https://www.npmjs.com/package/compromise |
| chart.umd.js | chart.js | 4.4.1 | MIT (chart-LICENSE.txt) | https://www.npmjs.com/package/chart.js |

To update: install the new version with npm in a scratch folder, copy the file named above,
update the version above, and re-run `npm test`.
