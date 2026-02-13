#!/usr/bin/env node

async function main() {
  const { Account, JsonRpcProvider } = await import("near-api-js");
  const rpcUrl = process.env.RPC_URL || "https://test.rpc.fastnear.com";
  const contractId = process.env.CONTRACT_ID;
  const ownerId = process.env.OWNER_ID;
  const ownerPrivateKey = process.env.OWNER_PRIVATE_KEY?.trim();
  const oracleAccountId = process.env.ORACLE_ACCOUNT_ID || ownerId;
  const storageFee = process.env.V2_STORAGE_FEE_YOCTO || "50000000000000000000000";
  const topupWindowMs = Number(process.env.TOPUP_WINDOW_MS || "10800000");

  if (!contractId || !ownerId || !ownerPrivateKey) {
    throw new Error("CONTRACT_ID, OWNER_ID, and OWNER_PRIVATE_KEY are required");
  }

  const provider = new JsonRpcProvider({ url: rpcUrl });
  const owner = new Account(ownerId, provider, ownerPrivateKey);
  await owner.getState();

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

  console.log("Migration complete");
  console.log({ contractId, oracleAccountId, storageFee, topupWindowMs });
}

main().catch((error) => {
  console.error("migrate-v2 failed", error);
  process.exit(1);
});
