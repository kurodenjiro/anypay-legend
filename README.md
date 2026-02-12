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
