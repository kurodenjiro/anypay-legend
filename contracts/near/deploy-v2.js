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

function normalizeHexKey(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return "";
  if (!/^[0-9a-f]{64}$/.test(normalized)) {
    throw new Error("Attestation public key must be 32-byte hex (64 chars)");
  }
  return normalized;
}

async function fetchAttestationPublicKey(backendUrl) {
  const endpoint = new URL("/attestation/public-key", backendUrl).toString();
  const response = await fetch(endpoint, { method: "GET" });
  if (!response.ok) {
    throw new Error(`Failed to fetch attestation public key (${response.status})`);
  }

  const payload = await response.json();
  return normalizeHexKey(payload?.public_key_hex);
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
  const runSetAttestationKey = parseBool(process.env.RUN_SET_ATTESTATION_KEY, true);
  const migrationMethod = process.env.MIGRATION_METHOD?.trim() || "migrate_v3";
  const wasmPath = process.env.WASM_PATH?.trim() || DEFAULT_WASM_PATH;
  const attestationBackendUrl =
    process.env.ATTESTATION_BACKEND_URL?.trim() || "http://127.0.0.1:3000/api/attestation";
  const envAttestationKey = normalizeHexKey(process.env.ATTESTATION_PUBLIC_KEY_HEX?.trim() || "");
  const autoFetchAttestationKey = parseBool(process.env.AUTO_FETCH_ATTESTATION_KEY, true);

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

  let attestationPublicKeyHex = envAttestationKey;
  if (!attestationPublicKeyHex && autoFetchAttestationKey) {
    try {
      attestationPublicKeyHex = await fetchAttestationPublicKey(attestationBackendUrl);
      if (attestationPublicKeyHex) {
        console.log("✓ fetched attestation public key from backend", { attestationBackendUrl });
      }
    } catch (error) {
      console.warn("Could not fetch attestation public key from backend:", error.message);
      console.warn("Set ATTESTATION_PUBLIC_KEY_HEX manually or start attestation backend.");
    }
  }

  if (runMigration) {
    console.log(`Running ${migrationMethod}...`);
    if (migrationMethod === "migrate_v3") {
      await owner.callFunction({
        contractId,
        methodName: "migrate_v3",
        args: {
          oracle_account_id: oracleAccountId,
          storage_fee_yocto: storageFee,
          topup_window_ms: topupWindowMs,
          attestation_public_key_hex: attestationPublicKeyHex || null,
        },
        gas: 180_000_000_000_000n,
        deposit: 0n,
      });
      console.log("✓ migrate_v3 completed");
    } else {
      await owner.callFunction({
        contractId,
        methodName: migrationMethod,
        args: {
          oracle_account_id: oracleAccountId,
          storage_fee_yocto: storageFee,
          topup_window_ms: topupWindowMs,
        },
        gas: 150_000_000_000_000n,
        deposit: 0n,
      });
      console.log(`✓ ${migrationMethod} completed`);
    }
  } else {
    console.log("Skipping migration (RUN_MIGRATION=false)");
  }

  if (runSetAttestationKey && attestationPublicKeyHex) {
    if (!owner) {
      throw new Error("OWNER_PRIVATE_KEY is required to set attestation public key");
    }
    console.log("Setting attestation public key on contract...");
    await owner.callFunction({
      contractId,
      methodName: "set_attestation_public_key_hex",
      args: {
        public_key_hex: attestationPublicKeyHex,
      },
      gas: 30_000_000_000_000n,
      deposit: 0n,
    });
    console.log("✓ attestation public key set");
  } else if (runSetAttestationKey) {
    console.warn("Skipping attestation key setup: no key resolved.");
    console.warn("Provide ATTESTATION_PUBLIC_KEY_HEX or start attestation backend.");
  } else {
    console.log("Skipping attestation key setup (RUN_SET_ATTESTATION_KEY=false)");
  }

  const v2Config = await viewCall(rpcUrl, contractId, "get_v2_config", {});
  console.log("✓ v2 config", v2Config);
  try {
    const configuredAttestationKey = await viewCall(
      rpcUrl,
      contractId,
      "get_attestation_public_key_hex",
      {},
    );
    console.log("✓ attestation key configured", configuredAttestationKey || "(empty)");
  } catch (error) {
    console.warn("Could not read attestation key from contract:", error.message);
  }
}

main().catch((error) => {
  console.error("deploy-v2 failed", error);
  process.exit(1);
});
