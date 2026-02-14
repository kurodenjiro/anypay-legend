# AnyPay Legend

End-to-end zero-knowledge payment verification with TLSNotary, plus NEAR-based deposit and intent flows.

## Current Repository Layout

This repo was reorganized: the Next.js app now lives at the repository root.

- `app/`, `components/`, `hooks/`, `lib/`: Next.js frontend (web-next)
- `services/attestation-backend/`: Rust attestation service
- `contracts/near/`: NEAR smart contract + relayer scripts
- `contracts/evm/`: EVM contracts
- `services/tlsn-core/`: TLSNotary core fork
- `services/tlsn-extension/`: TLSN browser extension monorepo

## Quick Start

### 1) Frontend (Next.js, repo root)

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

### 2) Backend (Rust attestation service)

```bash
cd services/attestation-backend
cargo run
```

### 3) NEAR Contracts / Relayer

```bash
cd contracts/near
npm install
npm run test:testnet
```

Optional relayer run:

```bash
npm run relayer:start
```

### 3.1) Relayer as Next API + Vercel Cron

The relayer can run serverlessly via `GET /api/relayer/tick` (one tick per request).

Required env vars (Vercel Project Environment Variables):

- `RPC_URL`
- `CONTRACT_ID`
- `ORACLE_ACCOUNT_ID`
- `ORACLE_PRIVATE_KEY`
- Optional: `INTENTS_API_KEY`, `INTENTS_BASE_URL`, `RELAYER_PAGE_SIZE`, `RELAYER_QUOTE_ROTATION_BUFFER_MS`
- Optional auth: `CRON_SECRET` (or `RELAYER_CRON_SECRET`)

`vercel.json` includes a cron schedule that calls `/api/relayer/tick` every minute.

Manual trigger example:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  http://localhost:3000/api/relayer/tick
```

### 4) TLSN Extension

```bash
cd services/tlsn-extension
npm install
npm run dev
```

## Notes

- Legacy `apps/web` has been removed.
- Legacy `apps/web-next` path is no longer used; frontend files are at the repo root.
- Frontend env: `.env.local`
- Relayer env example: `contracts/near/relayer/.env.example`
