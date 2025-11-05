// Centralized contract addresses and ABIs for MessageVault and EntryPoint
// Env overrides are supported via Vite variables; defaults use Sepolia deployment.

const env = import.meta.env

function getAddress(
  key: 'VITE_ENTRYPOINT_ADDRESS' | 'VITE_MESSAGE_VAULT_ADDRESS',
): `0x${string}` {
  const v = env[key] as string | undefined
  if (!v) throw new Error(`Missing ${key} in .env`)
  return v as `0x${string}`
}

export const ENTRYPOINT_ADDRESS = getAddress('VITE_ENTRYPOINT_ADDRESS')
export const MESSAGE_VAULT_ADDRESS = getAddress('VITE_MESSAGE_VAULT_ADDRESS')

// Import JSON ABIs (per user preference)
import entryPointAbiJson from './abis/entrypointabi.json'
import messageVaultArtifact from './abis/messagevaultabi.json'
import type { Abi } from 'viem'

// EntryPoint ABI is provided as a plain JSON array
export const entryPointAbi = entryPointAbiJson as unknown as Abi
// MessageVault ABI comes as a Hardhat artifact: use its `abi` property
export const messageVaultAbi = (messageVaultArtifact as { abi: Abi }).abi

// BUNDLER_RPC_URL is no longer exposed; use the bundler via Alchemy SDK.