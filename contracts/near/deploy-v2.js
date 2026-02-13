#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const DEFAULT_WASM_PATH = path.join(
  __dirname,
  "target/wasm32-unknown-unknown/release/anypay_legend_near.wasm",
);

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required env: ${name}`);
  return value;
}

function parseBool(value, fallback = false) {
  if (value == null) return fallback;
  const normalized = String(value).trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

async function viewCall(rpcUrl, contractId, methodName, args = {}) {
  const { JsonRpcProvider } = await import("near-api-js");
  const provider = new JsonRpcProvider({ url: rpcUrl });
  const result = await provider.query({
    request_type: "call_function",
    account_id: contractId,
    method_name: methodName,
    args_base64: Buffer.from(JSON.stringify(args)).toString("base64"),
    finality: "final",
  });

  return JSON.parse(Buffer.from(result.result).toString());
}

async function main() {
  const { Account, JsonRpcProvider, actions } = await import("near-api-js");
  const networkId = process.env.NETWORK_ID?.trim() || "testnet";
  const rpcUrl = process.env.RPC_URL?.trim() || "https://test.rpc.fastnear.com";
  const contractId = requireEnv("CONTRACT_ID");
  const ownerId = requireEnv("OWNER_ID");
  const ownerPrivateKey = process.env.OWNER_PRIVATE_KEY?.trim();
  const deployerId = process.env.DEPLOYER_ID?.trim() || ownerId;
  const deployerPrivateKey = process.env.DEPLOYER_PRIVATE_KEY?.trim() || ownerPrivateKey;
  const oracleAccountId = process.env.ORACLE_ACCOUNT_ID?.trim() || ownerId;
  const storageFee = process.env.V2_STORAGE_FEE_YOCTO?.trim() || "50000000000000000000000";
  const topupWindowMs = Number(process.env.TOPUP_WINDOW_MS || "10800000");
  const runMigration = parseBool(process.env.RUN_MIGRATION, true);
  const runDeploy = parseBool(process.env.RUN_DEPLOY, true);
  const wasmPath = process.env.WASM_PATH?.trim() || DEFAULT_WASM_PATH;

  if (!Number.isFinite(topupWindowMs) || topupWindowMs <= 0) {
    throw new Error(`Invalid TOPUP_WINDOW_MS: ${process.env.TOPUP_WINDOW_MS}`);
  }

  if (!fs.existsSync(wasmPath)) {
    throw new Error(`WASM file not found: ${wasmPath}`);
  }

  if (runDeploy && !deployerPrivateKey) {
    throw new Error("DEPLOYER_PRIVATE_KEY or OWNER_PRIVATE_KEY is required for deploy");
  }
  if (runMigration && !ownerPrivateKey) {
    throw new Error("OWNER_PRIVATE_KEY is required for migration");
  }

  const provider = new JsonRpcProvider({ url: rpcUrl });
  const owner = ownerPrivateKey ? new Account(ownerId, provider, ownerPrivateKey) : null;
  const deployer = deployerPrivateKey ? new Account(deployerId, provider, deployerPrivateKey) : null;

  if (owner) {
    await owner.getState();
  }
  if (deployer) {
    await deployer.getState();
  }

  const wasm = fs.readFileSync(wasmPath);

  if (runDeploy) {
    console.log("Deploying upgraded wasm...");
    await deployer.signAndSendTransaction({
      receiverId: contractId,
      actions: [actions.deployContract(wasm)],
    });
    console.log("✓ wasm deployed", { contractId, wasmPath, deployerId });
  } else {
    console.log("Skipping deploy (RUN_DEPLOY=false)");
  }

  if (runMigration) {
    console.log("Running migrate_v2...");
    await owner.callFunction({
      contractId,
      methodName: "migrate_v2",
      args: {
        oracle_account_id: oracleAccountId,
        storage_fee_yocto: storageFee,
        topup_window_ms: topupWindowMs,
      },
      gas: 150_000_000_000_000n,
      deposit: 0n,
    });
    console.log("✓ migrate_v2 completed");
  } else {
    console.log("Skipping migration (RUN_MIGRATION=false)");
  }

  const v2Config = await viewCall(rpcUrl, contractId, "get_v2_config", {});
  console.log("✓ v2 config", v2Config);
}

main().catch((error) => {
  console.error("deploy-v2 failed", error);
  process.exit(1);
});
