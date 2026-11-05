# Vault (key system v2)

`vault-crypto.js` implements keys that only the user can unlock. Nothing here is wired into a page yet
(Phase 1, step 1). See the SIL platform plan, "Encryption architecture".

- Passphrase -> Argon2id (64 MiB, 3 passes) -> key that wraps the content key.
- A 160-bit recovery key is a second way to unwrap the same content key.
- Identity keys (ECDH P-256 for sealing, ECDSA P-256 for signing) are encrypted with the content key.
- The server stores only the bundle. All blobs are bound (AES-GCM additional data) to the user id and purpose.
- A session never trusts server-supplied public keys or fingerprints: it checks them against its own private keys.

Run the tests with `npm test`.

Known limits: passphrases live in JS strings and cannot be wiped from memory; Argon2 runs on the main thread
(move to a Worker with the setup UI); no forward secrecy for sealed messages.
