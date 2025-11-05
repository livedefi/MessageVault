import type { Address, Hex, Transport } from "viem";
import { encodeFunctionData, createPublicClient, hexToBytes } from "viem";
import type { WalletClient } from "viem";
import { alchemy, alchemyFeeEstimator, alchemyUserOperationSimulator, sepolia } from "@account-kit/infra";
import { createSmartAccountClient, WalletClientSigner, toSmartContractAccount, getEntryPoint, erc7677Middleware, createBundlerClientFromExisting } from "@aa-sdk/core";
import type { SmartAccountClient, SmartContractAccount } from "@aa-sdk/core";
import type { AccountOp } from "@aa-sdk/core";
import { messageVaultAbi, MESSAGE_VAULT_ADDRESS, ENTRYPOINT_ADDRESS, entryPointAbi } from "../config/contracts";

// AccountOp comes from the SDK and represents a single call

// Minimal SmartAccount adapter for MessageVault (IAccount) that:
// - signs userOpHash with personal_sign
// - encodes callData directly as the account method payload (no execute wrapper)
// Helper to sign EIP-191 (personal_sign) over a 32-byte hash
async function signUserOpHashWithPersonalSign(signer: WalletClientSigner, userOpHash: Hex): Promise<Hex> {
  const bytes = hexToBytes(userOpHash as Hex);
  const sig = await signer.signMessage({ raw: bytes });
  return sig as Hex;
}

export type CreateClientOptions = { disableSimulation?: boolean }

export async function createClient(walletClient: WalletClient, opts?: CreateClientOptions): Promise<MessageVaultAAClient> {
  const apiKey = import.meta.env.VITE_ALCHEMY_API_KEY as string | undefined;
  if (!apiKey) throw new Error("VITE_ALCHEMY_API_KEY not set in frontend/.env");
  const policyId = import.meta.env.VITE_GAS_MANAGER_POLICY_ID as string | undefined;
  // Simulation enabled by default; only disabled via opts (429 fallback)
  const disableSimulation = opts?.disableSimulation ?? false

  // Signer using viem WalletClient (window.ethereum) and personal_sign
  const signer = new WalletClientSigner(walletClient as any, "wallet");

  // Alchemy transport (Account Kit v4)
  const transport = alchemy({ apiKey });
  const publicClient = createPublicClient({ chain: sepolia, transport });

  // EntryPoint v0.7 (chain-known address); we use env for nonce reads
  const entryPoint = getEntryPoint(sepolia, { version: "0.7.0" });

  // SmartContractAccount adapter using official toSmartContractAccount API
  const account = (await toSmartContractAccount({
    source: "MessageVaultAccount",
    transport,
    chain: sepolia,
    entryPoint,
    // Already-deployed account address (SDK v4: use accountAddress)
    accountAddress: MESSAGE_VAULT_ADDRESS as Address,
    // Account does not need initCode (already deployed)
    getAccountInitCode: async () => "0x" as Hex,
    // Message signing (use raw to satisfy WalletClientSigner types)
    signMessage: async (params: any) => {
      if (params?.raw) {
        return signer.signMessage({ raw: params.raw }) as Promise<Hex>;
      }
      if (params?.message) {
        const m = params.message;
        if (typeof m === "string") {
          const raw = new TextEncoder().encode(m);
          return signer.signMessage({ raw }) as Promise<Hex>;
        }
        if (m?.raw) {
          return signer.signMessage({ raw: m.raw }) as Promise<Hex>;
        }
      }
      throw new Error("Invalid signMessage params");
    },
    signTypedData: async (typedData: any) => signer.signTypedData(typedData as any) as Promise<Hex>,
    // Sign userOpHash with personal_sign (EIP-191)
    signUserOperationHash: async (uoHash) => signUserOpHashWithPersonalSign(signer, uoHash),
    // Dummy 65-byte signature for simulations
    getDummySignature: async () => ("0x" + "00".repeat(130)) as Hex,
    // MessageVault expects direct callData from its methods (no execute wrapper).
    // encodeExecute receives an AccountOp in v4.
    encodeExecute: async (tx: AccountOp) => {
      const target = (tx as any).target as Address;
      const data = (tx as any).data as Hex;
      if (!target || !data) throw new Error("MessageVaultAccount.encodeExecute: incomplete tx");
      if (target.toLowerCase() !== (MESSAGE_VAULT_ADDRESS as Address).toLowerCase()) {
        throw new Error("MessageVaultAccount.encodeExecute: must call MessageVault itself");
      }
      return data;
    },
    // EntryPoint v0.7 nonce (key 0) for the account
    getNonce: async () => {
      const n = await publicClient.readContract({
        address: ENTRYPOINT_ADDRESS as Address,
        abi: entryPointAbi as any,
        functionName: "getNonce",
        args: [MESSAGE_VAULT_ADDRESS as Address, 0n],
      });
      return n as bigint;
    },
  })) as SmartContractAccount<"MessageVaultAccount", "0.7.0">;

  const baseClientConfig: any = {
    transport,
    chain: sepolia,
    account,
  // Middleware recommended by Alchemy docs for correct estimation
    feeEstimator: alchemyFeeEstimator(transport),
  // Sponsorship via ERC-7677: follow docs, expand middleware
    ...(policyId ? erc7677Middleware({ context: { policyId } }) : {}),
  }
  const client = createSmartAccountClient(
    disableSimulation
      ? baseClientConfig
      : { ...baseClientConfig, userOperationSimulator: alchemyUserOperationSimulator(transport) }
  );
  // Optional check (disabled by default to reduce RPC calls)
  const checkEntryPoint = (import.meta.env.VITE_CHECK_ENTRYPOINT_SUPPORT as string | undefined)?.toLowerCase() === 'true'
  if (checkEntryPoint) {
    try {
      const bundlerClient = createBundlerClientFromExisting(publicClient) as any
      const supported = await bundlerClient.getSupportedEntryPoints()
      const ep = (ENTRYPOINT_ADDRESS as Address).toLowerCase()
      const ok = supported.some((addr: string) => addr.toLowerCase() === ep)
      if (!ok && import.meta.env.DEV) {
        console.warn('[AA][client] Bundler does not advertise support for EntryPoint', ENTRYPOINT_ADDRESS)
      }
    } catch (_) {
      // Silently ignore if bundler is not available; sending may still work
    }
  }
  return client as MessageVaultAAClient;
}

// Helper type to consume the client with typed methods in the hook
export type MessageVaultAAClient = SmartAccountClient<Transport, typeof sepolia, SmartContractAccount<"MessageVaultAccount", "0.7.0">>;

// Typed wrapper to avoid 'unknown' on the client's method
export async function waitForUserOperationReceipt(client: MessageVaultAAClient, args: { hash: Hex }): Promise<any> {
  // Wait for the transaction associated with the UserOperation via SDK client method
  const txHash = await (client as any).waitForUserOperationTransaction({
    hash: args.hash,
    retries: { interval: 1500, maxRetries: 40 },
  })
  // Try to get the UserOperationReceipt via SDK bundler client
  try {
    const apiKey = import.meta.env.VITE_ALCHEMY_API_KEY as string | undefined
    if (!apiKey) throw new Error("VITE_ALCHEMY_API_KEY not set in frontend/.env")
    const transport = alchemy({ apiKey })
    const publicForBundler = createPublicClient({ chain: sepolia, transport })
    const bundler = createBundlerClientFromExisting(publicForBundler) as any
    // Alchemy expects the hash as a string in the first parameter (not an object)
    const uoReceipt = await bundler.getUserOperationReceipt(args.hash as any)
    return uoReceipt ?? txHash
  } catch {
    return txHash
  }
}

export async function buildCallDataSendMessageToWallet(content: string): Promise<Hex> {
  if (!content || content.trim().length === 0) throw new Error("Content must not be empty");
  return encodeFunctionData({ abi: messageVaultAbi as any, functionName: "sendMessageToWallet", args: [content] }) as Hex;
}
