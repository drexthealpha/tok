# Open-source libraries and programs used

All of Tok's own code was written during the hackathon (from 27 Nov 2026, 16:00 WAT). These are the open-source parts it builds on. Exact versions are pinned in `pnpm-lock.yaml` and `Cargo.lock`.

## On chain

| Name | Version | What Tok uses it for | Link |
|---|---|---|---|
| Anchor (`anchor-lang`, `anchor-spl`) | 0.31.1 | Writing the claim program | https://github.com/solana-foundation/anchor |
| Swig smart wallet program | devnet `swigypWHEksbC64pWKwah1WTeh9JXwx8H1rJHLdbQMB`, repo tag v1.3.1 | Passkey wallets (secp256r1). Audited by Accretion (2025) and Halborn (Aug 2026) | https://github.com/anagrambuild/swig-wallet |
| SPL Token and Associated Token Account programs | deployed on devnet | USDC transfers and accounts | https://github.com/solana-program |
| Kora | 3.0.0 (`ghcr.io/solana-foundation/kora:v3.0.0`) | The makers' fee relayer: pays every fee and rent | https://github.com/solana-foundation/kora |

## TypeScript

| Name | Version | What Tok uses it for |
|---|---|---|
| `@solana/kit` | 8.6.0 | Building and sending transactions |
| `@solana-program/token`, `@solana-program/system` | 0.18.0, 0.16.0 | Token and system instructions in tests |
| `@swig-wallet/kit`, `@swig-wallet/lib` | 3.0.0 | Creating Swig wallets and signing with a passkey (WebAuthn) |
| `litesvm` | 1.6.2 | Program tests in a local Solana VM |
| `@solana-mobile/wallet-standard-mobile` | 0.7.1 | Mobile Wallet Adapter in the Android app |
| `@wallet-standard/app` | 1.1.1 | Wallet Standard types |
| `@supabase/supabase-js` | 2.119.2 | Chat storage, real time and sign-in |
| `@pollar/core` | 0.12.0 | Email sign-in wallet (Pollar) |
| `hono`, `@hono/node-server` | 4.13.23, 2.1.11 | Tok's server |
| `preact` | 11.2.0 | The web page |
| `hash-wasm` | 4.13.0 | Argon2id for the pass phrase |
| `@scure/bip39` | 2.4.0 | The BIP39 English word list (2,048 words, MIT) for pass phrases |
| `@noble/curves`, `@noble/hashes` | 2.4.0 | P-256 passkey keys and SHA-256 |
| `uqr` | 0.1.3 | QR codes for Solana Pay requests |
| `vite`, `@preact/preset-vite` | 8.4.0, 2.10.6 | Building the page |
| `vitest`, `happy-dom`, `playwright`, `web-vitals` | 5.1.2, 21.0.4, 1.65.1, 6.2.3 | Tests and measurements |
| `typescript`, `eslint`, `typescript-eslint` | 5.9.3, 10.16.0, 8.74.0 | Types and lint |
| `supabase` (CLI) | 3.4.0 | Local Supabase stack in CI |

## Android

| Name | Version | What Tok uses it for |
|---|---|---|
| Android Browser Helper (Trusted Web Activity) | 2.5.0 | The Android app shell for Seeker |
| Android Gradle Plugin | 8.7.3 | Building the APK |

## Services (free plans)

Supabase (chat), ElevenLabs speech to text (voice message text), Firecrawl (link previews), Pollar (email wallet, test mode), Render (Tok's server and Kora), GitHub Pages (the web page), Circle's faucet (devnet USDC).
