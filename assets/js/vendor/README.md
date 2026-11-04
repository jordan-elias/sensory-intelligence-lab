# Vendored third-party code

Files here are served from our own origin on purpose: pages that handle private
content must not load executable code from third-party CDNs.

| File | Package | Version | Licence | Source |
| --- | --- | --- | --- | --- |
| hash-wasm-argon2.umd.min.js | hash-wasm (Argon2 build) | 4.12.0 | MIT (hash-wasm-LICENSE.txt) | https://www.npmjs.com/package/hash-wasm |
| sortable.esm.js | sortablejs (modular ES build) | 1.15.7 | MIT (sortable-LICENSE.txt) | https://www.npmjs.com/package/sortablejs |

To update: install the new version with npm in a scratch folder, copy the file named above,
update the version above, and re-run `npm test`.
