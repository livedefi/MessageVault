import { artifacts, network } from "hardhat";
import { readFile } from "node:fs/promises";
import path from "node:path";

type EtherscanResponse = { status: string; message: string; result: string };

async function submitVerification(baseUrl: string, params: URLSearchParams) {
  const resp = await fetch(baseUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  const json = (await resp.json()) as EtherscanResponse;
  return json;
}

async function checkStatus(baseUrl: string, apikey: string, guid: string) {
  const params = new URLSearchParams({
    apikey,
    module: "contract",
    action: "checkverifystatus",
    guid,
  });
  const resp = await fetch(baseUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  const json = (await resp.json()) as EtherscanResponse;
  return json;
}

async function main() {
  const fqName = "contracts/MessageVault.sol:MessageVault";
  const { ethers } = await network.connect();
  const chainId = await ethers.provider.getNetwork().then((n) => Number(n.chainId));
  const baseUrl = `https://api.etherscan.io/v2/api?chainid=${chainId}`;

  const apiKey = process.env.ETHERSCAN_API_KEY;
  if (!apiKey) throw new Error("ETHERSCAN_API_KEY missing in env");

  const address = (process.env.VITE_MESSAGE_VAULT_ADDRESS || process.argv[2] || "").trim();
  if (!address || !ethers.isAddress(address)) throw new Error("Provide MessageVault address via env VITE_MESSAGE_VAULT_ADDRESS or CLI arg");

  // Read Standard JSON Input from build-info
  const buildInfoId = await artifacts.getBuildInfoId(fqName);
  if (!buildInfoId) throw new Error("Build info ID not found for MessageVault");
  const buildInfoPath = path.join("artifacts", "build-info", `${buildInfoId}.json`);
  const raw = await readFile(buildInfoPath, "utf-8");
  const bi = JSON.parse(raw);
  const standardJsonInput = bi.input;
  if (!standardJsonInput) throw new Error("Standard JSON input missing");
  let solcVersion: string = bi.solcLongVersion ?? bi.solcVersion;
  if (!solcVersion.startsWith("v")) solcVersion = `v${solcVersion}`;

  // Determine fully-qualified contract name using sources in the Standard JSON input
  const sourceKeys: string[] = Object.keys(standardJsonInput.sources || {});
  const mvSourceKey = sourceKeys.find((k) => k.endsWith("/MessageVault.sol") || k.endsWith("\\MessageVault.sol") || k === "MessageVault.sol")
    || sourceKeys[0];
  const fqContractName = `${mvSourceKey}:MessageVault`;

  // Get constructor argument: owner()
  const artifact = await artifacts.readArtifact(fqName);
  const contract = new ethers.Contract(address, artifact.abi, ethers.provider);
  const owner: string = await contract.owner();

  // ABI-encode constructor arguments (single address)
  const encodedArgs = ethers.AbiCoder.defaultAbiCoder().encode(["address"], [owner]).replace(/^0x/, "");

  // Prepare parameters for Etherscan V2
  const params = new URLSearchParams({
    apikey: apiKey,
    module: "contract",
    action: "verifysourcecode",
    contractaddress: address,
    sourceCode: JSON.stringify(standardJsonInput),
    codeformat: "solidity-standard-json-input",
    contractname: fqContractName,
    compilerversion: solcVersion,
    constructorArguments: encodedArgs,
  });

  console.log("Submitting verification to Etherscan V2...");
  const submit = await submitVerification(baseUrl, params);
  console.log("Submit response:", submit);
  if (submit.status !== "1") {
    throw new Error(`Verification submit failed: ${submit.message} | ${submit.result}`);
  }

  const guid = submit.result;
  console.log("GUID:", guid);

  // Poll for status
  for (let i = 0; i < 12; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const status = await checkStatus(baseUrl, apiKey, guid);
    console.log("Status:", status);
    if (status.status === "1") {
      console.log("Verification successful:", status.result);
      return;
    }
    if (status.result && /already verified/i.test(status.result)) {
      console.log("Contract is already verified.");
      return;
    }
  }
  throw new Error("Verification status polling timed out");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});