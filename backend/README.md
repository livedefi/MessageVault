# MessageVault Backend

Backend supporting an ERC‑4337 smart wallet that receives, stores, and auto‑replies to messages. Custom paymaster removed in favor of managed sponsorship.

## Table of Contents
 - [Overview](#overview)
 - [Requirements](#requirements)
 - [Project Layout](#project-layout)
 - [Configuration (.env)](#configuration-env)
 - [Ignition Parameters](#ignition-parameters)
- [Quick Start](#quick-start)
- [Deploy](#deploy)
- [Post‑Deployment Verification](#post-deployment-verification)
- [Operations (Stake/Deposit Management)](#operations-stake-deposit-management)
- [Reference Addresses (Sepolia example)](#reference-addresses-sepolia-example)
- [Troubleshooting](#troubleshooting)
- [Security Notes](#security-notes)
- [Validation Mutability (why not view)](#validation-mutability-why-not-view)
- [Notes](#notes)

## Overview
- Hardhat v3 with `ethers v6` and Solidity tests.
- Hardhat Ignition for reproducible deployments.
- ERC‑4337 EntryPoint v0.7 (Sepolia canonical `0x0000000071727De22E5E9d8BAf0edAc6f37da032`).

Scope: This document covers only the backend (Hardhat/contracts/Ignition). See also: [Frontend README](../frontend/README.md) and [Project README](../README.md).
 

## Requirements
- Node.js 18+ and npm.
- A Sepolia RPC endpoint (Alchemy/Infura/QuickNode, etc.).
- A funded Sepolia EOA for deployment and initial stake/deposit.

## Project Layout
- `contracts/MessageVault.sol`: Smart account that emits `MessageStored` events (no on-chain message storage) and points to EntryPoint.
 
- `ignition/modules/*`: Deployment modules for AA setup and the wallet.
- `params/*.json`: Ignition parameter files (BigInt values with trailing `n`).
- `test/`: Unit tests.

## Configuration (.env)
Create `backend/.env` with:
```dotenv
SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/your-key
SEPOLIA_OWNER_PRIVATE_KEY=0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
ETHERSCAN_API_KEY=your-etherscan-key
# Optional: if set here, the verification script picks it up automatically
VITE_MESSAGE_VAULT_ADDRESS=0xYourDeployedMessageVault
# Optional: used by withdraw script if VITE_MESSAGE_VAULT_ADDRESS is not set
MESSAGE_VAULT_ADDRESS=0xYourDeployedMessageVault
```
Notes:
- `SEPOLIA_OWNER_PRIVATE_KEY` is the deployer/owner (account(0)). It pays constructor, stake, deposit, and config transactions.
 - `ETHERSCAN_API_KEY` is used by the "Etherscan Verification" section.
 - `VITE_MESSAGE_VAULT_ADDRESS` is optional; if omitted, pass the address via CLI to the verification script.
 - `MESSAGE_VAULT_ADDRESS` is used by `withdraw-all.ts` when `VITE_MESSAGE_VAULT_ADDRESS` is not present.
 - `VITE_ALCHEMY_API_KEY` belongs in `frontend/.env` (not backend) and is required by the Alchemy SDK on the frontend.

 

## Ignition Parameters
Parameters live under `backend/params/*.json`. BigInts must be strings ending with `n`.

Example `params/erc4337-setup.sepolia.json` (wallet only):
```json
{
  "ERC4337Setup": {
    "ENTRYPOINT_ADDRESS": "0x0000000071727De22E5E9d8BAf0edAc6f37da032",
    "MV_DEPOSIT_ETH": "0n"
  }
}
```
Parameter meanings:
- `ENTRYPOINT_ADDRESS`: Canonical EntryPoint v0.7 on Sepolia.
- `MV_DEPOSIT_ETH`: Optional deposit for MessageVault (keep `"0n"` if Paymaster sponsors gas).

## Quick Start
1) Configure environment:
   - Set `SEPOLIA_RPC_URL` and `SEPOLIA_OWNER_PRIVATE_KEY` in `.env`.
2) Install, compile, and test:
   ```sh
   npm install
   npx hardhat compile
   npm run test
   ```
3) Deploy wallet setup on Sepolia: see the Deploy section for the command.
4) See Post‑Deployment Verification to check links and balances.
5) Record `MESSAGE_VAULT_ADDRESS` in backend configuration.

## Deploy
Install dependencies:
```sh
npm install
```
Sepolia (wallet setup):
```sh
npx hardhat ignition deploy ignition/modules/ERC4337Setup.ts \
  --network sepolia \
  --parameters params/erc4337-setup.sepolia.json
```

## Etherscan Verification
Verify the `MessageVault` contract source on Etherscan V2:
1) Ensure `backend/.env` contains:
```dotenv
ETHERSCAN_API_KEY=your-etherscan-key
# Optional: set the deployed contract address so the script picks it up
VITE_MESSAGE_VAULT_ADDRESS=0xYourDeployedMessageVault
```
2) Run verification on Sepolia:
```sh
npm run verify
```
If you prefer passing the address explicitly:
```sh
npx hardhat run scripts/verify-etherscan-v2.ts --network sepolia 0xYourDeployedMessageVault
```

## Post‑Deployment Verification
Use the scripted checks below to verify links and balances.

### EntryPoint Deposit Verification
- Etherscan shows the contract’s native balance (ETH), which can be `0` even after a deposit: ETH is transferred to `EntryPoint` and accounted to the `MessageVault` (not as the contract’s ETH balance).
- Verify directly:
  ```sh
  npm run check:deposit
  ```
  Expected output (example):
  - `EntryPoint set on vault: 0x0000000071727De22E5E9d8BAf0edAc6f37da032`
  - `EntryPoint balance via vault: 100000000000000`
  - `EntryPoint balance direct: 100000000000000`


## Reference Addresses (Sepolia example)
Recent deployment addresses — use as reference:
 - `MessageVault`: `0xDB069580321E87f30eA171bf20a45BB18A3E5B09`

Save for your backend configuration (do not commit private keys):
```dotenv
MESSAGE_VAULT_ADDRESS=0xDB069580321E87f30eA171bf20a45BB18A3E5B09
```

## Troubleshooting
- Insufficient funds for gas + value:
  - Your EOA must cover both `value` (stake/deposit) and transaction gas.
- Parameter type mismatch (expected bigint):
  - Use BigInt strings with trailing `n` in parameter JSON (e.g., `"5000000000000000n"`).
- Nonce mismatch (Ignition `HHE10404`):
  - A tx landed outside Ignition’s plan. Either clean the deployment journal or continue from the latest state using the same EOA.
- Validation rejects (`BadNonce`, `BadSignature`):
  - Ensure the wallet `nonce` matches `EntryPoint.getNonce(address(this), 0)`.
  - Confirm signature uses EIP‑191 prefix (`signMessage`) and matches the owner.

## Alchemy Paymaster — ETH Requirements
- With Gas Manager (managed Paymaster by Alchemy), frontend `UserOperations` can be sponsored, so end users may not need ETH for gas.
- The backend still needs ETH for:
  - Deploying `MessageVault` (deployment gas).
  - Optionally depositing into `EntryPoint` if `MV_DEPOSIT_ETH > 0n` in `params/*.json`.
  - Any transaction that sends `value` to the contract or to `EntryPoint` (e.g., stake/deposit).
- Recommended minimums on Sepolia:
  - Deployer EOA: ≥ 0.01 ETH to cover compile/deploy and basic checks.
  - `MV_DEPOSIT_ETH`: keep `"0n"` if Paymaster sponsors gas; increase only if you want your own balance in `EntryPoint`.
- Note: specific Paymaster configuration for the frontend will be documented in `frontend/README.md`.

## Network Switching
- Backend:
  - Use `--network <name>` with Hardhat commands (e.g., `sepolia`, `mainnet`, `polygon`).
  - Create/adjust `params/erc4337-setup.<chain>.json` with the canonical `ENTRYPOINT_ADDRESS` for that network and desired `MV_DEPOSIT_ETH`.
  - In `.env`, change `SEPOLIA_RPC_URL` to the appropriate RPC for the chosen network (e.g., `MAINNET_RPC_URL`) and set the deployer’s private key.
  - Etherscan V2 verification uses `chainId` automatically; keep `ETHERSCAN_API_KEY` and run the same script with `--network <chain>`.
- Note: frontend network switching steps will be covered in `frontend/README.md`.

## Security Notes
- Use the canonical EntryPoint address for your network.
 - Protect deployment keys and monitor EntryPoint deposit events related to your wallet.
 - Do not commit `.env` files; manage secrets via environment-specific configuration.

## Operations (Stake/Deposit Management)
- `npm run check:aa`: Prints AA readiness (EntryPoint, deposit, nonce, balances).
- `npm run check:deposit`: Reads EntryPoint deposit for the vault.
- `npm run withdraw:all:v7`: Drains all available deposit from EntryPoint v0.7 to your EOA.

## Validation Mutability (why not `view`)
ERC‑4337 specifies validation functions as non‑`view` by design. Even if a particular implementation performs read‑only checks, the signatures must match the interfaces:
- `MessageVault.validateUserOp(UserOperation, bytes32, uint256) external returns (uint256)`
Reasons they are not marked `view`:
- Spec compliance: Interfaces in `IAccount` and `BasePaymaster` declare these functions without `view`. Overriding with `view` would fail compilation and break EntryPoint expectations.
- Potential state changes: Implementations may legitimately update internal accounting, emit events, or transfer ETH to EntryPoint (e.g., paying `missingAccountFunds`). `view` would forbid such side effects.
- Runtime context: EntryPoint calls validation during `handleOps` (non‑static) and simulations via `eth_call` (static). Keeping functions non‑`view` ensures compatibility with both execution contexts.

In this codebase, validation is deterministic (no writes) but remains non‑`view` to adhere to the ERC‑4337 interfaces and to allow future extensions (e.g., paying prefund or lightweight accounting) without changing function signatures.

## Notes
- Events expose message metadata for off‑chain indexing.
- Contracts implement AA‑friendly validation and a robust EntryPoint deposit read using interface fallbacks (balanceOf/getDepositInfo) to accommodate canonical EntryPoint v0.7 variants on Sepolia.