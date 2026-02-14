# AnyPay Legend

Anypay Legend is a NEAR-based P2P crypto settlement app with TLSNotary-backed payment verification.

Sellers create funded listings (deposits), buyers signal intents, and fulfillment can be completed with signed attestation data generated from TLSN verification.

## Architecture

- `app/`, `components/`, `hooks/`, `lib/`: Next.js 16 web app + API routes
- `contracts/near/`: Rust NEAR smart contract + Node relayer/deploy scripts
- `services/attestation-backend/`: optional standalone Rust attestation backend (Axum)
- `services/tlsn-extension/`: TLSN extension + verifier packages
- `contracts/evm/`: EVM contracts (separate module)

## Tech Stack

- Frontend: Next.js 16, React 19, TypeScript, Tailwind CSS v4
- Wallet/Auth: Privy + NEAR Wallet Selector
- Blockchain client: `near-api-js` v7, `viem`
- Smart contract: Rust + `near-sdk` 5.1
- Relayer/orchestration: Node.js TypeScript runner + Intents 1Click API
- Attestation signing: Node `crypto` (in Next API) or Rust `ed25519-dalek` backend
- TLS proof flow: TLSNotary extension/verifier integration
- E2E tests: Playwright

## Core Functions

- Seller deposit flow:
  `create_deposit` + `register_deposit_intent_v2` starts funding for a listing.
- Relayer quote/funding automation:
  polls awaiting deposits, creates/rotates Intents quotes, confirms funding, marks failed/expired.
- Buyer intent flow:
  `signal_intent` creates buyer intent against funded deposits.
- Proof-based settlement:
  `fulfill_intent_with_attestation` validates signed attestation payload and settles intent.
- Dashboard/history:
  loads account deposits/intents, funding metadata, and status transitions.
- TLSN demo flow:
  runs Wise plugin through TLSN extension and waits for attestation record before submission.

## NEAR Intents Integration

This project integrates NEAR Intents 1Click API for quote generation and funding status tracking in the V2 deposit flow.

- Default base URL: `https://1click.chaindefuser.com`
- Endpoints used in this repo:
  - `GET /v0/tokens` for supported assets/decimals and min-amount probing
  - `POST /v0/quote` for funding quote creation (deposit address + memo + expiry)
  - `GET /v0/status` for polling quote/deposit lifecycle
- Statuses handled: `PENDING_DEPOSIT`, `PROCESSING`, `SUCCESS`, `FAILED`, `REFUNDED`, `INCOMPLETE_DEPOSIT`

Practical flow implemented here:

1. Seller opens deposit intent on NEAR (`register_deposit_intent_v2`).
2. Relayer creates a 1Click quote (`POST /v0/quote`) and stores quote/deposit metadata on-chain via `oracle_set_quote_v2`.
3. Seller sends top-up to Intents deposit address/memo.
4. Relayer polls `GET /v0/status`.
5. On terminal result:
   - `SUCCESS` -> relayer confirms funding (`oracle_confirm_funding_v2`)
   - `FAILED` / `REFUNDED` -> relayer marks failed (`oracle_mark_failed_v2`)
   - Expired/incomplete -> relayer rotates quote or marks top-up expired

Relevant env vars:

- Backend/relayer:
  - `INTENTS_BASE_URL` (optional)
  - `INTENTS_API_KEY` (optional)
  - `RELAYER_QUOTE_ROTATION_BUFFER_MS`
  - `RELAYER_PAGE_SIZE`
- Frontend:
  - `NEXT_PUBLIC_INTENTS_ASSET_ID_BTC`
  - `NEXT_PUBLIC_INTENTS_ASSET_ID_ETH`
  - `NEXT_PUBLIC_INTENTS_ASSET_ID_ZEC`
  - `NEXT_PUBLIC_INTENTS_QUOTE_PROBE_RECIPIENT` (optional)
  - `NEXT_PUBLIC_MIN_DEPOSIT_INTENT_AMOUNT` (optional)

## API Routes (Next.js)

- `GET|POST /api/relayer/tick`: single relayer tick (cron friendly)
- `GET /api/attestation/health`: attestation API health
- `GET /api/attestation/attestation/public-key`: active attestation signing key
- `GET /api/attestation/attestations/session/:sessionId`: attestation by session
- `GET /api/attestation/attestations/intent/:intentId`: attestation by intent
- `POST /api/attestation/webhook/tlsn-verifier`: verifier webhook ingestion
- `GET /api/tlsn-demo/proof-source`: demo helper endpoint

## Local Setup

### Prerequisites

- Node.js 20+
- npm
- Rust toolchain (for contract/backend/verifier)
- `wasm32-unknown-unknown` target for NEAR contract builds

```bash
rustup target add wasm32-unknown-unknown
```

### 1) Install web dependencies

```bash
npm install
```

### 2) Configure env (`.env.local`)

Minimum typical local vars:

```bash
NEXT_PUBLIC_PRIVY_APP_ID=
NEXT_PUBLIC_NEAR_NETWORK_ID=testnet
NEXT_PUBLIC_NEAR_RPC_URL=https://test.rpc.fastnear.com
NEXT_PUBLIC_NEAR_CONTRACT_ID=<your-contract>.testnet
NEXT_PUBLIC_DEPOSIT_FLOW=v2
NEXT_PUBLIC_NEAR_V2_STORAGE_FEE_YOCTO=50000000000000000000000
NEXT_PUBLIC_INTENTS_ASSET_ID_BTC=nep141:btc.omft.near
NEXT_PUBLIC_INTENTS_ASSET_ID_ETH=nep141:eth.omft.near
NEXT_PUBLIC_INTENTS_ASSET_ID_ZEC=nep141:zec.omft.near
NEXT_PUBLIC_ATTESTATION_BACKEND_URL=/api/attestation

RPC_URL=https://test.rpc.fastnear.com
CONTRACT_ID=<your-contract>.testnet
ORACLE_ACCOUNT_ID=<oracle-account>.testnet
ORACLE_PRIVATE_KEY=ed25519:...

CRON_SECRET=<random-strong-secret>
RELAYER_CRON_SECRET=<same-or-other-secret>
```

Optional relayer tuning vars:
- `INTENTS_API_KEY`
- `INTENTS_BASE_URL` (default `https://1click.chaindefuser.com`)
- `RELAYER_PAGE_SIZE` (default `100`)
- `RELAYER_QUOTE_ROTATION_BUFFER_MS` (default `10000`)

Optional attestation vars:
- `ATTESTATION_SIGNING_SECRET_HEX` (32-byte hex)
- `ATTESTATION_WEBHOOK_SECRET`
- `ATTESTATION_TTL_MS`

### 3) Run web app

```bash
npm run dev
```

Open `http://localhost:3000`.

### 4) Optional local services

Standalone relayer loop:

```bash
npm run relayer:start
```

Standalone Rust attestation backend:

```bash
npm run attestation:backend
```

TLSN verifier service:

```bash
npm run tlsn:verifier
```

## Deployment

### A) Deploy web app + API routes on Vercel

1. Import this repo in Vercel.
2. Keep standard Next.js build (`npm run build`) and output defaults.
3. Add required project env vars:
   `NEXT_PUBLIC_*` app vars, plus `RPC_URL`, `CONTRACT_ID`, `ORACLE_ACCOUNT_ID`, `ORACLE_PRIVATE_KEY`.
4. Set `CRON_SECRET` (or `RELAYER_CRON_SECRET`) to protect `/api/relayer/tick`.
5. Deploy.

`vercel.json` already schedules:
- `*/5 * * * *` -> `/api/relayer/tick`

Manual post-deploy relayer trigger:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  https://<your-domain>/api/relayer/tick
```

### B) Deploy NEAR contract (upgrade/migrate v2/v3 flow)

Build contract first:

```bash
cd contracts/near
cargo build --target wasm32-unknown-unknown --release
cd ../..
```

Run deploy script from repo root:

```bash
NETWORK_ID=testnet \
RPC_URL=https://test.rpc.fastnear.com \
CONTRACT_ID=<your-contract>.testnet \
OWNER_ID=<owner-account>.testnet \
OWNER_PRIVATE_KEY=ed25519:... \
ORACLE_ACCOUNT_ID=<oracle-account>.testnet \
npm run contract:deploy:v2
```

Useful flags supported by `contracts/near/deploy-v2.js`:
- `RUN_DEPLOY=false` (skip wasm deploy)
- `RUN_MIGRATION=false` (skip migration)
- `RUN_SET_ATTESTATION_KEY=false`
- `ATTESTATION_PUBLIC_KEY_HEX=<64-hex>`
- `ATTESTATION_BACKEND_URL=<url>` (for auto key fetch)

### C) Set/update attestation key on contract

```bash
RPC_URL=https://test.rpc.fastnear.com \
CONTRACT_ID=<your-contract>.testnet \
OWNER_ID=<owner-account>.testnet \
OWNER_PRIVATE_KEY=ed25519:... \
ATTESTATION_BACKEND_URL=https://<your-domain>/api/attestation \
npm run contract:set:attestation-key
```

### D) Relayer deployment options

- Serverless mode (recommended with Vercel):
  use `/api/relayer/tick` + cron.
- Worker mode:
  run `contracts/near/relayer/index.ts` continuously with env from
  `contracts/near/relayer/.env.example`.

### E) Optional standalone Rust attestation backend

Run:

```bash
cd services/attestation-backend
cargo +nightly run --release
```

Default bind: `127.0.0.1:3101`

If using this service, point frontend to it:
- `NEXT_PUBLIC_ATTESTATION_BACKEND_URL=http://<host>:3101`

## Testing

- Frontend e2e: `npm run test:e2e`
- Contract integration checks: `cd contracts/near && npm run test:testnet`
- Contract write checks (with signer creds): `cd contracts/near && npm run test:testnet:write`
