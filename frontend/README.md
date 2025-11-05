# MessageVault Frontend

React/TypeScript (Vite) UI to interact with the `MessageVault` contract on Sepolia using Account Abstraction (ERC‑4337) with Alchemy Account Kit. Includes message reading via Subgraph, wallet connection with RainbowKit, and Alchemy RPC transport.

See also: [Backend README](../backend/README.md) · [Project README](../README.md)


## Table of Contents
 - [Scope](#scope)
 - [Requirements](#requirements)
 - [Configuration (.env)](#configuration-env)
 - [Contracts & ABIs](#contracts--abis)
 - [Quick Start](#quick-start)
- [Message Reading via Subgraph](#message-reading-via-subgraph)
- [ERC‑4337 (AA) with Alchemy Account Kit](#erc-4337-aa-with-alchemy-account-kit)
 - [UserOperation Simulation](#useroperation-simulation)
- [Network Switching (frontend)](#network-switching-frontend)
- [Common Issues](#common-issues)
- [Security Notes](#security-notes)
 - [Build & Deploy](#build--deploy)

## Scope
- This document covers the frontend only (Vite/React, hooks, and wagmi/RainbowKit config).
- The backend guide (Hardhat, deployments, verification) lives in `backend/README.md`.

## Requirements
- Node.js 18+ and npm.
- Alchemy API key for Sepolia.
- WalletConnect Project ID.
- Deployed `MessageVault` contract address and `EntryPoint` v0.7 address.
- The Graph Studio Subgraph endpoint (optional for indexed message reading).

## Configuration (.env)
Create `frontend/.env` and set exactly these variables:

```dotenv
VITE_WALLETCONNECT_PROJECT_ID=your-walletconnect-project-id
VITE_ALCHEMY_API_KEY=your-alchemy-api-key
VITE_GAS_MANAGER_POLICY_ID=your-gas-manager-policy-id
VITE_ENTRYPOINT_ADDRESS=0x0000000071727De22E5E9d8BAf0edAc6f37da032
VITE_MESSAGE_VAULT_ADDRESS=0xYourDeployedMessageVault
VITE_SUBGRAPH_URL=https://api.studio.thegraph.com/query/<org>/<slug>/<version>
VITE_SUBGRAPH_POLL_MS=10000
VITE_SUBGRAPH_MAX_POLL_MS=60000
VITE_SUBGRAPH_JITTER_PCT=0.3
```

Notes:
 - `VITE_SUBGRAPH_URL` must be reachable; otherwise the UI will show an error.
 - `VITE_SUBGRAPH_POLL_MS`: base polling interval in ms (e.g., `10000` = 10s).
 - `VITE_SUBGRAPH_MAX_POLL_MS`: upper limit for exponential backoff when errors/no new data.
 - `VITE_SUBGRAPH_JITTER_PCT`: jitter percentage between `0` and `1` to add random variation to the current interval and avoid synchronized requests (e.g., `0.3` ≈ ±30%).

## Contracts & ABIs
- ABIs live under `src/config/abis/`:
  - `entrypointabi.json`: canonical EntryPoint v0.7 ABI as a plain JSON array.
  - `messagevaultabi.json`: Hardhat artifact JSON; the ABI is under its `abi` property.
- `src/config/contracts.ts` imports these files and exposes:
  - `entryPointAbi` (from `entrypointabi.json`).
  - `messageVaultAbi` (from `messagevaultabi.json.abi`).
- Update process:
  - When `MessageVault.sol` changes, copy the updated artifact JSON into `src/config/abis/messagevaultabi.json`.
  - If using a different EntryPoint version, replace `entrypointabi.json` with the matching v0.7 JSON.
- Best practices:
  - Do not fetch ABIs at runtime; Vite bundles JSON at build time.
  - Ensure `VITE_MESSAGE_VAULT_ADDRESS` matches the deployed contract that the ABI describes.
  - Keep ABIs minimal and stable; prefer pinning EntryPoint version to avoid runtime mismatches.

## Quick Start
- `cd frontend && npm install`
- Copy `.env` following the examples above.
- `npm run dev` and open `http://localhost:5173/`.
- Connect your wallet and send a message; the list will update from the Subgraph if `VITE_SUBGRAPH_URL` is set.

## Message Reading via Subgraph
- The UI reads `MessageStored` events from the endpoint configured in `VITE_SUBGRAPH_URL`.
- The `useGraphMessages` hook performs polling with exponential backoff and jitter; tune `VITE_SUBGRAPH_*` to your environment.
- If `VITE_SUBGRAPH_URL` is missing, an on-screen error is shown and the list stays empty.
- Polling summary: `POLL_MS` (base), `MAX_POLL_MS` (cap), `JITTER_PCT` (randomization to prevent synchronized bursts).

## ERC‑4337 (AA) with Alchemy Account Kit
- Alchemy transport is configured via `VITE_ALCHEMY_API_KEY` and the Sepolia chain.
- `ENTRYPOINT_ADDRESS` and `MESSAGE_VAULT_ADDRESS` are read from `.env` via `src/config/contracts.ts`.
- The AA flow uses Gas Manager sponsorship inside Alchemy’s SDK; you don’t need to expose `BUNDLER_RPC_URL` in the app.
- Sponsorship policy: set `VITE_GAS_MANAGER_POLICY_ID` if you want paymaster sponsorship; leave it empty to send without sponsorship.

## UserOperation Simulation
 - UserOperation simulation is ENABLED by default for better estimations, pre-validations, and sponsorship compatibility.
 - There is no `.env` variable to disable it by configuration; the flow keeps it ON by default.
 - Dynamic fallback: on a rate limit error (429) during send, the client automatically reconfigures without simulation and applies conservative backoff with jitter before retrying.


## Network Switching (frontend)
- Edit `src/wagmiConfig.ts` to include the new `chain` and its `transport`; for Alchemy, provide the corresponding API key.
- Update addresses in `.env`:
  - `VITE_ENTRYPOINT_ADDRESS` to the network’s canonical (v0.7).
  - `VITE_MESSAGE_VAULT_ADDRESS` to your contract deployment on that network.
- Adjust `VITE_SUBGRAPH_URL` to the subgraph for that network/version.
- Restart `npm run dev` after `.env` changes.

## Common Issues
- “VITE_WALLETCONNECT_PROJECT_ID is missing”: add your WalletConnect Project ID.
- “VITE_ALCHEMY_API_KEY is missing”: add your Alchemy API key.
- “Missing VITE_ENTRYPOINT_ADDRESS / VITE_MESSAGE_VAULT_ADDRESS”: check addresses in `.env`.
- Wrong network: use the chain button (RainbowKit) to switch to Sepolia.
- Empty message list: confirm `VITE_SUBGRAPH_URL` and that the subgraph is “Synced”.
- Gas sponsorship not applied: check the console for Gas Manager responses and that your account meets the policy.

### 429 Too Many Requests
- Increasing your provider plan/quota (e.g., Alchemy) helps avoid 429 under load.
- Separate API keys for RPC and AA to reduce quota collisions and concurrent calls.
- Avoid unnecessary accessory calls (e.g., non‑critical prechecks) to lower compute unit consumption.
- Keep the conservative backoff with jitter; it is already applied after the first 429.

## Security Notes
- Do not expose private keys in the frontend.
- Do not commit `.env` files; manage secrets via environment-specific configuration.

## Build & Deploy
- Development: `npm run dev` and visit `http://localhost:5173/`.
- Production build: `npm run build` outputs to `dist/`.
- Preview locally: `npm run preview` to serve the built app.
- Ensure environment variables are provided in your hosting platform (Vite injects `VITE_*` at build time).
