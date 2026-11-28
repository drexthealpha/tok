# Security policy

Tok runs on Solana devnet with test money only.

## Reporting a vulnerability

Report it privately through GitHub's private vulnerability reporting: https://github.com/drexthealpha/tok/security/advisories/new. Please do not open a public issue.

Include what is affected, how to reproduce it, and what an attacker could do. You will get an answer within 3 days. A fix or a plan follows within 14 days, and the report is credited in the advisory unless you ask otherwise.

## In scope

- The claim program in `programs/tok-claim` (devnet `2pZCUFv63kde6rkaAaZ3GGhUu4u4jzM8kBcyshZ9qauH`)
- Tok's server in `server/` and the Kora settings in `deploy/`
- The web page in `web/` and the shared code in `packages/core`

## Out of scope

Third-party programs and services Tok uses (Swig, Kora, Supabase, ElevenLabs, Firecrawl, Pollar): report those to their makers.
