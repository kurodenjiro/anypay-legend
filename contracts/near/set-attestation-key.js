#!/usr/bin/env node

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required env: ${name}`);
  return value;
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
  const { Account, JsonRpcProvider } = await import("near-api-js");

  const rpcUrl = process.env.RPC_URL?.trim() || "https://test.rpc.fastnear.com";
  const contractId = requireEnv("CONTRACT_ID");
  const ownerId = requireEnv("OWNER_ID");
  const ownerPrivateKey = requireEnv("OWNER_PRIVATE_KEY");
  const backendUrl = process.env.ATTESTATION_BACKEND_URL?.trim() || "http://127.0.0.1:3000/api/attestation";

  let attestationPublicKeyHex = normalizeHexKey(process.env.ATTESTATION_PUBLIC_KEY_HEX?.trim() || "");
  if (!attestationPublicKeyHex) {
    attestationPublicKeyHex = await fetchAttestationPublicKey(backendUrl);
  }
  if (!attestationPublicKeyHex) {
    throw new Error("Could not resolve attestation public key");
  }

  const provider = new JsonRpcProvider({ url: rpcUrl });
  const owner = new Account(ownerId, provider, ownerPrivateKey);
  await owner.getState();

  console.log("Setting attestation public key...");
  await owner.callFunction({
    contractId,
    methodName: "set_attestation_public_key_hex",
    args: {
      public_key_hex: attestationPublicKeyHex,
    },
    gas: 30_000_000_000_000n,
    deposit: 0n,
  });
  console.log("✓ set_attestation_public_key_hex completed");

  const configured = await viewCall(rpcUrl, contractId, "get_attestation_public_key_hex", {});
  console.log("Configured attestation key:", configured || "(empty)");
}

main().catch((error) => {
  console.error("set-attestation-key failed", error);
  process.exit(1);
});
