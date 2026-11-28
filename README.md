# Tok

Tok reimagines how people interact, transact, or collaborate: pay anyone with a link in the chat app they already use. They tap it, confirm with their face or fingerprint, and the USDC is in their own new Solana wallet. No app, no recovery phrase, no SOL.

[![live demo](https://img.shields.io/endpoint?url=https%3A%2F%2Ftok-server.onrender.com%2Fbadge)](https://tok-server.onrender.com/health) [![ci](https://github.com/drexthealpha/tok/actions/workflows/ci.yml/badge.svg)](https://github.com/drexthealpha/tok/actions/workflows/ci.yml) [![OpenSSF Scorecard](https://api.securityscorecards.dev/projects/github.com/drexthealpha/tok/badge)](https://scorecard.dev/viewer/?uri=github.com/drexthealpha/tok)

Solana devnet. Test money only: devnet USDC has no value.

| | |
|---|---|
| Live page | https://drexthealpha.github.io/tok/ |
| Claim program (devnet) | [`2pZCUFv63kde6rkaAaZ3GGhUu4u4jzM8kBcyshZ9qauH`](https://explorer.solana.com/address/2pZCUFv63kde6rkaAaZ3GGhUu4u4jzM8kBcyshZ9qauH?cluster=devnet) |
| Server and fee relayer (Kora) | https://tok-server.onrender.com/health (an uptime check runs every 10 minutes from Supabase's scheduler; the badge above says up or down) |
| Android app for Seeker | [Release v1.0.0](https://github.com/drexthealpha/tok/releases/tag/v1.0.0): `tok-android.apk`, signed with Sigstore |
| Demo video | Added with the final cut on 28 Nov 2026 (recorded on this live devnet build) |

## Try it (two phones, about 2 minutes)

1. Phone A: open the live page, tap **Wallet**, then **Make my wallet**, and confirm with your face or fingerprint.
2. Phone A: copy the wallet address, open https://faucet.circle.com, pick **Solana Devnet**, paste the address, and get 20 devnet USDC.
3. Phone A: tap **Pay**, type an amount, tap **Pay**, confirm, and send the link to phone B in WhatsApp or SMS.
4. Phone B: tap the link. If the chat app's own browser cannot make a passkey, tap **Open in your browser** (or receive by email, below). Tap **Receive**, confirm, and wait for **Received** with the transaction signature.

No install, no seed phrase, no SOL. The makers pay every network fee and rent deposit.

## Eligibility compliance

| Requirement (RULES) | Where to check |
|---|---|
| Open source | Public repo, [MIT licence](LICENSE) |
| Solana program address, devnet | [`2pZCUFv63kde6rkaAaZ3GGhUu4u4jzM8kBcyshZ9qauH`](https://explorer.solana.com/address/2pZCUFv63kde6rkaAaZ3GGhUu4u4jzM8kBcyshZ9qauH?cluster=devnet), source in [programs/tok-claim/src/lib.rs](programs/tok-claim/src/lib.rs) |
| Demo video under 3 minutes, the product in action | Final cut added on 28 Nov 2026 |
| Built before vs. during | [section below](#built-before-vs-during) |
| Project is ours, and we can demo and explain it | [How it works](#how-it-works), every part with its test in [Parts and their tests](#parts-and-their-tests) |

## Product clarity

One button on the first screen: **Pay** ([screen](docs/images/pay.png), [code](web/src/screens/pay.tsx)). The receiver sees the amount and **Receive** ([screen](docs/images/receive.png), [code](web/src/screens/claim.tsx)), then **Received** with the devnet signature ([screen](docs/images/received.png)).

- Sender: type the amount, **Pay**, confirm with the passkey, choose the chat, **Send**: 4 or 5 actions plus the amount. The demo video counts them on screen.
- Receiver: tap the link, **Receive**, confirm: 3 actions, 4 if the chat app's own browser needs **Open in your browser**. No app, bank card, recovery phrase or SOL.

## Real-world impact

- Sending money costs the sender and the receiver nothing on Tok: the makers pay every fee and rent deposit, 3,377,880 lamports per pay link to a new receiver, read from devnet transactions ([docs/LIVE-RUNS.md](docs/LIVE-RUNS.md), [scripts/link-cost.mjs](scripts/link-cost.mjs)).
- The receiver needs only a phone browser that can make a passkey; when a chat app's own browser cannot, the page offers **Open in your browser** or receiving by email into a Pollar wallet ([screens](docs/images/phone-checks)).
- The money lands in the receiver's own wallet (a Swig smart wallet controlled by their passkey), and can move on to any Solana address, for example Solflare, where MoneyGram cash-out runs in 170 countries and territories ([code](web/src/screens/wallet.tsx)).

## Demo quality

The demo video follows one flow on the live devnet build, with an action counter on screen. Section by section, and the speed of any sped-up part, are listed with the final cut on 28 Nov 2026.

## Deployment

| What | Where |
|---|---|
| Claim program, devnet, upgrade key removed | [`2pZCUF…qauH`](https://explorer.solana.com/address/2pZCUFv63kde6rkaAaZ3GGhUu4u4jzM8kBcyshZ9qauH?cluster=devnet); removal [`oeRHvxtC…`](https://explorer.solana.com/tx/oeRHvxtCogxRzVctWjgeTze5oRBLDyEo3LvXpFWuo7rBYFwa3DCThFB8KMTZvEw5LRvLAwTTgvRfswvxYfrLbhZ?cluster=devnet) |
| Live page | https://drexthealpha.github.io/tok/ ([Pages workflow](.github/workflows/pages.yml)) |
| Server and Kora fee relayer | https://tok-server.onrender.com/health ([Dockerfile](Dockerfile), [Kora config](deploy/kora.toml)); up or down badge above, uptime check every 10 minutes from Supabase's scheduler ([SQL](supabase/hosted/uptime.sql)) |
| Android app | [Release v1.0.0](https://github.com/drexthealpha/tok/releases/tag/v1.0.0), signed with Sigstore |
| Core Web Vitals of the live page | p75 of 5 runs in Chromium at phone size, CPU 4x slower, slow 4G: LCP 1.88 s, INP 64 ms, CLS 0 (targets 2.5 s, 200 ms, 0.1) ([script](tests/e2e/cwv.ts)) |

## Repo quality

- CI on every push: lint, types, unit tests, the program build, chain tests in LiteSVM against the real Swig program, chat tests on a local Supabase stack, a devnet test through the live Kora, the Android APK, and a secret scan ([ci.yml](.github/workflows/ci.yml)).
- A pre-push hook runs the fast checks on what changed ([.githooks/pre-push](.githooks/pre-push)).
- Reproducible program build matched to devnet ([verify.yml](.github/workflows/verify.yml)); signed releases ([release.yml](.github/workflows/release.yml)); CodeQL ([codeql.yml](.github/workflows/codeql.yml)); property-based tests ([properties.test.ts](packages/core/test/properties.test.ts)); [security policy](SECURITY.md); pinned actions and images; lockfiles with exact versions.
- Every fact the build needed was read from live docs on day 1 and written down with its link: [docs/CHECKS.md](docs/CHECKS.md).

## Solana/SDK depth

| Capability | In Tok |
|---|---|
| Custom Anchor program | Deposit, claim, cancel, return after 7 days; rent back to the recorded payer ([lib.rs](programs/tok-claim/src/lib.rs)) |
| secp256r1 precompile, passkeys | Swig smart wallets signed in Swig's raw WebAuthn form ([wallet.ts](packages/core/src/wallet.ts), [webauthn.ts](web/src/webauthn.ts)) |
| Fee sponsorship with Kora | Users hold no SOL; the makers pay fees and rent; allow list in Tok's server and in Kora ([relay.ts](server/src/relay.ts), [kora.toml](deploy/kora.toml)) |
| `@solana/kit` | Every transaction on the page and the server ([chain.ts](web/src/chain.ts)) |
| LiteSVM | Program and wallet tests, clock moved 7 days ([tests/](tests)) |
| Solana Actions and Blinks | Tok's deposit as an Action; Actions shown as buttons in the chat only when every program is allowed ([actions.ts](server/src/actions.ts), [action.tsx](web/src/screens/action.tsx)) |
| Solana Pay | Requests with a reference, found by reference, refunds to the debited owner ([solanapay.ts](packages/core/src/solanapay.ts), [shop.tsx](web/src/screens/shop.tsx)) |
| Mobile Wallet Adapter | The Android app signs with the phone's wallet ([mwa.ts](web/src/mwa.ts), [android/](android)) |
| Token program read from the mint | Devnet USDC's owner program is read at run time ([tok.ts](web/src/tok.ts)) |
| Reproducible build | `solana-verify` build hash equals the devnet program ([verify.yml](.github/workflows/verify.yml)) |

## How it works

1. **Pay.** The page makes a new random key pair on the sender's phone: the claim key. The sender's passkey wallet deposits the USDC into a claim account of Tok's program, tied to the claim key's public key. The claim key's secret goes in the link after `#`.
2. **Send.** The phone's share sheet opens with the link. The browser never sends the part after `#` to Tok's web server. The chat service that carries the message does store the whole link, so anyone who can read the message can claim first, unless the sender turned on a pass phrase. The Pay screen says this.
3. **Receive.** The receiver's page reads the claim key from the link, makes a passkey, and sends one transaction: create the receiver's wallet, then claim with the claim key's signature. **Claiming**, then **Received** with the signature, or the reason and **Try again**.
4. **After.** The receiver can **Send back** or **Move to my wallet** (any Solana address, for example Solflare, where MoneyGram cash-out is offered in 170 countries and territories). The sender can **Cancel** before a claim. An unclaimed link goes back to the sender after 7 days: the sender's page sends that call when it opens, and the caller receives nothing.

```
sender phone                    Tok claim program (devnet)              receiver phone
passkey -> Swig wallet --deposit--> claim account [sender, amount,
                                     claim key, expiry 7 d, rent payer]
link: https://.../c#<claim key> ----------- any chat app -----------> opens link
                                <---claim (claim key signs)--------- new passkey -> Swig wallet
fees and rent: the makers' fee payer through Kora; every close returns rent to it
```

## Parts and their tests

Every part below has tests. CI runs them on every push except the checks that need a phone or the live page, which run outside CI and are listed with their results.

| # | Part | Tests | Where |
|---|---|---|---|
| 1 | Claim program (Anchor): deposit, claim, cancel, return after 7 days | deposit records sender, amount, claim key, expiry and rent payer; claim needs the claim key's signature; a second claim fails; only the sender cancels; return fails before day 7 and pays only the sender after (clock moved in LiteSVM); rent goes only to the recorded rent payer | `tests/claim.test.ts`, CI |
| 2 | Passkey wallet (Swig, secp256r1) | wallet made with the makers paying; a WebAuthn-format passkey signature moves USDC; another passkey or no signature fails; a passkey wallet pays a link and another claims it | `tests/wallet.test.ts` (real Swig program in LiteSVM), CI |
| 3 | Fee payer (Kora) and allow list | a user with 0 SOL gets a wallet through the live Kora and the makers pay fee and rent; a program off the allow list is refused; a transfer signed only by the fee payer fails | `server/test/relay.test.ts`, `tests/devnet/kora.test.ts` (live), CI |
| 4 | Web page: pay and claim | the part after `#` is sent to no server; Claiming, Received, Try again; Open in your browser; the warning sentence; the day-7 return call; the two logged times | `web/test/*.test.ts*`, CI; live run `tests/e2e/live.ts` |
| 5 | Pass phrase (4 words, Argon2id) | encrypts and decrypts; a wrong phrase fails; the link alone does not hold the key; live: wrong words refused, right words claimed | `packages/core/test`, CI; live run |
| 6 | Send back and Cancel | send back pays the sender recorded in the claim; cancel before a claim returns the USDC; cancel after a claim fails | CI; live run |
| 7 | Move to my wallet | moves USDC to a typed address; a malformed address is refused before signing | CI; live run |
| 8 | Chat storage and real time (Supabase) | a message from A reaches B in real time; a non-member cannot read or write; nobody sends as someone else | `tests/supabase/chat.test.ts` (local Supabase in CI, and the hosted project) |
| 9 | Payment in the chat | the bubble's payment reaches the contact and shows its signature | live chat run `tests/e2e/chat.ts` |
| 10 | Request in the chat | paying from the bubble sends exactly that amount; shown as Paid; the database refuses a second payment | CI and live chat run |
| 11 | Split in the chat | one request per member; the parts add up exactly to the total | CI and live chat run |
| 12 | Voice messages (ElevenLabs speech to text) | stored and played for the other member; the text appears under it; an ElevenLabs error keeps the message without text | CI; live: a spoken clip came back as "Thanks for lunch. I am sending you $5 now" |
| 13 | Link previews (Firecrawl) | an ordinary page gets a preview; a pay link is never sent; nothing after `#` is ever sent | CI; live |
| 14 | Solana Actions as buttons in the chat | buttons only when every program the Action's transaction calls is on the allow list, plain link otherwise; signed by the user's wallet after a tap | CI; live chat run |
| 15 | Tok as a Solana Action | the endpoint returns a valid deposit, and a deposit made through it is claimable | `tests/pay.test.ts`, CI |
| 16 | Solana Pay and merchant refunds | paid with a reference; found by the reference; refund goes to the owner of the debited account, not the fee payer; a second refund is refused | `tests/pay.test.ts`, CI; live run |
| 17 | Android app for Seeker (Mobile Wallet Adapter) | the APK builds in CI; inside the app the phone's wallet signs pay, claim and chat in place of the passkey | `android/`, `web/test/mwa.test.ts`, CI. On a phone: not run yet |
| 18 | Core Web Vitals | measured on the live page | `tests/e2e/cwv.ts`, outside CI: p75 of 5 runs: LCP 1.88 s, INP 64 ms, CLS 0 (targets 2.5 s, 200 ms, 0.1: all pass). An earlier batch of 7 while this PC was also compiling had p75 LCP 4.46 s, INP 184 ms, CLS 0 |
| + | Email wallet (Pollar) | a receiver without passkeys signs in by email, gets a Pollar Solana wallet, receives the link, and sends with fees paid by Pollar | `web/test/pollar.test.ts`, CI. Live, 28 Nov: a person signed in by email, received a 0.30 USDC link into the Pollar wallet ([5yzejpmH…](https://explorer.solana.com/tx/5yzejpmHVkKZZgiWDr6Mz9xrZb5vmR5cZybk7X7AjqaqyeqvEFRxWSaGgEmo4gAp1qBxYDxGEMG8bK12WwgDJWYY?cluster=devnet)) and sent 0.10 on with the fee paid by Pollar ([4R8tuqkY…](https://explorer.solana.com/tx/4R8tuqkYwqbg7rVEUfQPSXaAxuErU3mQyL7Z4JUjFyH7MRiCK4PzYYBBE71qZkuL9tvbdY7cF4U8XWZy2REdJ8Vp?cluster=devnet)) |

Checks outside CI, with their results:

| Check | Device and date | Result |
|---|---|---|
| Argon2id time per try (64 MiB, 3 passes) | Emulated low-end Android (Chromium, CPU 4x and 6x slower), 28 Nov 2026 | 1.7 s and 1.9 s. On a real slowest phone: not run yet (the Wallet screen has "Measure one pass phrase try") |
| Mobile Wallet Adapter pay and claim on a phone | Android phone with a Solana wallet app | Not run yet: needs a real phone with a wallet app |
| Core Web Vitals on the live page | Chromium, phone size, CPU 4x slower, slow 4G, 27 Nov 2026 | p75 of 5 runs: LCP 1.88 s, INP 64 ms, CLS 0 (targets 2.5 s, 200 ms, 0.1: all pass). An earlier batch of 7 while this PC was also compiling had p75 LCP 4.46 s, INP 184 ms, CLS 0 |
| Chat apps' own browsers and passkeys | Emulated user agents of WhatsApp and Telegram on Android and iPhone, 28 Nov 2026 | All four show "Open in your browser" and the email option; Chrome on Android shows the passkey button ([screenshots](docs/images/phone-checks)). Inside the real apps: not run yet. From the docs read on day 1: Telegram on Android and Instagram use their own WebView, where passkeys fail; Android Custom Tabs work |

## Against the best (measured)

For each judging signal: the best measured result we could read anywhere, and Tok's own measured number.

| Signal | Best in the world we found | Its number | Tok, measured on devnet |
|---|---|---|---|
| Real-world impact: cost to send money | World Bank global average cost of sending $200 (Q3 2025), https://remittanceprices.worldbank.org/ | 6.36% of the amount | 0% to sender and receiver. The makers pay 3,377,880 lamports per pay link (fees plus rent, read from devnet transactions) |
| Product clarity: actions to pay | WeChat red packet, when both people have WeChat | 3 taps plus the amount | Sender: Pay, passkey, choose the chat, Send: 4 or 5 actions plus the amount (counter on screen). Receiver: 3 (tap link, Receive, passkey), 4 with "Open in your browser", and no app, bank card or SOL. When both people already use WeChat, WeChat needs fewer taps |
| Demo quality: time until the money is usable | UK Faster Payments: "within seconds" (HSBC); FedNow design target: under 20 s | seconds | Pay tap to confirmed deposit: median 4.4 s, slowest 11.5 s. Link opened to confirmed claim: median 5.3 s, slowest 14.1 s (10 runs on the live page, 28 Nov 2026; each claim also makes the new wallet) |
| Deployment: Core Web Vitals | Web Almanac 2025: share of mobile sites passing all three | 48% | p75 of 5 runs: LCP 1.88 s, INP 64 ms, CLS 0 (targets 2.5 s, 200 ms, 0.1: all pass). An earlier batch of 7 while this PC was also compiling had p75 LCP 4.46 s, INP 184 ms, CLS 0 |
| Repo quality: OpenSSF Scorecard | kubernetes/kubernetes, 16 Nov 2026 | 7.6 / 10 | 7.2 / 10 on 28 Nov 2026 (4.6 the night before), after branch protection and signed releases were added. Below kubernetes: code review by a second person, the Best Practices badge and a project age over 90 days are still missing |
| Fee to the user | UK Faster Payments | £0 | 0 USDC and 0 SOL on devnet |
| Solana depth | | | 13 capabilities: secp256r1 passkeys (Swig), Anchor program (upgrade key removed, reproducible build matched to devnet), LiteSVM, Kora fee sponsorship, @solana/kit, Actions, Actions in a chat, Solana Pay with reference, Mobile Wallet Adapter, token program read from the mint, Solflare cash-out path, devnet USDC |

Sources: [docs/CHECKS.md](docs/CHECKS.md) for every day-1 fact, and the links in the table.

## Limits, stated plainly

- Anyone who can read the message that carries a link can claim it before your contact does, unless the pass phrase is on. The pass phrase makes each guess slow (Argon2id); it does not make guessing impossible. Send the 4 words another way, for example a phone call.
- If every device that holds a receiver's passkey is lost, that wallet and its USDC cannot be recovered. Phones often sync passkeys to the owner's other devices. Tok offers no recovery; move larger amounts to a wallet you control.
- Some chat apps open links in their own browser, where passkeys do not work (Telegram and Instagram on Android use their own WebView; on iOS, apps' WebViews allow passkeys only for the app's own domains). The page offers **Open in your browser**, or receiving by email with Pollar.
- Chat messages are stored by Supabase. Voice messages are sent to ElevenLabs for their text (the page says so before the first recording). Ordinary web links are sent to Firecrawl for previews; Tok pay links never are.
- Cash-out is done by licensed services outside Tok (Solflare and MoneyGram), with their own identity checks.
- The USDC issuer's terms, app store rules (Android app) and sanctions law also apply. No country count is claimed.
- Tok has no users of its own yet.

## Fees, rent and what the makers' signer can do

- The makers' devnet fee payer `ByWbpvCjdgiUdamJ7t47toUMreqapqgPcBfjyTkEcNX2` pays every network fee and rent deposit through Kora. Claim, cancel and return close the claim account and send its rent back to that account only.
- Tok's server passes to Kora only transactions that name that fee payer and call only these programs: Tok's claim program, Swig, Token, Token-2022, Associated Token, System, Compute Budget, Memo and the secp256r1 precompile. Kora checks the same list and caps the fee payer's outflow at 8,000,000 lamports per transaction.
- The fee payer can pay fees and rent, refuse to sign, and read each transaction. It has no authority over any user wallet, claim account or token account, so it cannot move user funds (tested).
- Cost per pay link to a new receiver, read from devnet: 3,377,880 lamports.
- Nothing is claimed about who pays on mainnet.

## Program upgrade key and verified build

- **Upgrade key removed** on 28 Nov 2026: the claim program can never be changed again, by the makers or anyone. Transaction: [oeRHvxtC…LbhZ](https://explorer.solana.com/tx/oeRHvxtCogxRzVctWjgeTze5oRBLDyEo3LvXpFWuo7rBYFwa3DCThFB8KMTZvEw5LRvLAwTTgvRfswvxYfrLbhZ?cluster=devnet). `solana program show 2pZCUFv63kde6rkaAaZ3GGhUu4u4jzM8kBcyshZ9qauH -u devnet` prints `Authority: none`.
- **Reproducible build:** the program on devnet has executable hash `42734636c2bf9e49971b2edb6e7069ee3374c2eb38b4bacff6113eddb7a39465`. Rebuild it and compare:

  ```
  cargo install solana-verify --version 0.5.2 --locked
  solana-verify build --library-name tok_claim --base-image solanafoundation/solana-verifiable-build:4.3.0
  solana-verify get-executable-hash target/deploy/tok_claim.so
  solana-verify get-program-hash -u devnet 2pZCUFv63kde6rkaAaZ3GGhUu4u4jzM8kBcyshZ9qauH
  ```

  The [verifiable build workflow](.github/workflows/verify.yml) does exactly this in CI and printed "MATCH: devnet program equals this build".
- OtterSec's remote verifier accepts mainnet programs only (solana-verify 0.5.2, 28 Nov 2026), so the devnet program carries the hash check above instead of an explorer badge ([docs/CHECKS.md](docs/CHECKS.md), check 17).

## Partner tracks

| Partner | Its job in Tok | Live test |
|---|---|---|
| Supabase | Stores chat messages and voice files, sends them in real time, row level security per chat | Passed on the hosted project: real time, members-only reads, no spoofing, one payment per request |
| ElevenLabs | Speech to text under each voice message (recording itself needs no ElevenLabs) | Passed: spoken clip to text in 2.3 s through the live server |
| Firecrawl | Title and image for ordinary links in the chat; never sees a pay link or anything after `#` | Passed: preview of solana.com; a pay link refused |
| Solana Mobile | The Android app for Seeker signs with Mobile Wallet Adapter | APK built in CI; phone check not run yet, so this track is not entered yet |
| Pollar | Email sign-in wallet for receivers whose browser cannot make a passkey; sends with fees paid by Pollar (test mode, devnet) | Passed: email sign-in, a link received into the Pollar wallet, and a send with the fee paid by Pollar |

### How Pollar is integrated

1. A receiver opens a Tok link in a browser that cannot make a passkey (for example a chat app's own browser), or chooses "Receive with email instead".
2. Tok's page uses `@pollar/core` (test mode, Solana devnet): `beginEmailLogin`, `sendEmailCode`, `verifyEmailCode`. Pollar makes a managed Solana wallet for that email.
3. Tok claims the link into that wallet: the claim key signs, Tok's fee payer creates the USDC account. Pollar signs nothing for receiving.
4. In the Wallet tab, the person sends USDC from the Pollar wallet with `sendPayment({ chain: 'SOLANA', mint })` after confirming on Tok's screen; Pollar's own account pays the network fee.
5. Code: [web/src/pollar.ts](web/src/pollar.ts), [web/src/screens/pollar-wallet.tsx](web/src/screens/pollar-wallet.tsx), the email form in [web/src/screens/claim.tsx](web/src/screens/claim.tsx), tests in [web/test/pollar.test.ts](web/test/pollar.test.ts).

Pollar's cash ramps reach Solana through a Circle bridge that its docs list for live (mainnet) apps only, so Tok does not claim cash-out through Pollar on devnet.

## Run it yourself

```
pnpm install
pnpm lint && pnpm typecheck
pnpm vitest run packages server web          # unit tests (any OS)
node scripts/fetch-program.mjs swigypWHEksbC64pWKwah1WTeh9JXwx8H1rJHLdbQMB tests/fixtures/swig.so
cargo build-sbf --manifest-path programs/tok-claim/Cargo.toml --sbf-out-dir target/deploy
pnpm vitest run tests                        # chain tests (Linux: LiteSVM)
pnpm dev:web                                 # the page on http://localhost:5173/tok/
```

The server needs `KORA_URL`; `deploy/` holds the Kora config and the Docker image Render runs. Chat needs a Supabase project with `supabase/migrations` applied.

## Built before vs. during

- Before kick-off (27 Nov 2026, 16:00 WAT): the design text and research notes. They hold no code.
- During (from 27 Nov 2026, 16:00 WAT): every line of code in this repo.
- No code from the founder's earlier projects is used.
- Open-source libraries and programs used, with versions: [docs/LIBRARIES.md](docs/LIBRARIES.md).

## Why I built this

I build where money still moves slowly and costs the most. Sending $200 home to Sub-Saharan Africa costs 8.46% on average (World Bank, via African Exponent, 5 Nov 2026). Crypto should have fixed that, but the person receiving still needs an app, a recovery phrase and SOL for fees before a single dollar arrives. Tok removes all three: a link in the chat they already use, their face or fingerprint, and the USDC is in their own wallet.

## Licence

MIT
