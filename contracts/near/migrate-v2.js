#!/usr/bin/env node

const os = require("os");
const path = require("path");
const { connect, keyStores, KeyPair } = require("near-api-js");

async function main() {
  const networkId = process.env.NETWORK_ID || "testnet";
  const rpcUrl = process.env.RPC_URL || "https://test.rpc.fastnear.com";
  const contractId = process.env.CONTRACT_ID;
  const ownerId = process.env.OWNER_ID;
  const ownerPrivateKey = process.env.OWNER_PRIVATE_KEY;
  const oracleAccountId = process.env.ORACLE_ACCOUNT_ID || ownerId;
  const storageFee = process.env.V2_STORAGE_FEE_YOCTO || "50000000000000000000000";
  const topupWindowMs = Number(process.env.TOPUP_WINDOW_MS || "3600000");

  if (!contractId || !ownerId) {
    throw new Error("CONTRACT_ID and OWNER_ID are required");
  }

  const keyStore = ownerPrivateKey
    ? new keyStores.InMemoryKeyStore()
    : new keyStores.UnencryptedFileSystemKeyStore(path.join(os.homedir(), ".near-credentials"));

  if (ownerPrivateKey) {
    await keyStore.setKey(networkId, ownerId, KeyPair.fromString(ownerPrivateKey));
  }

  const near = await connect({
    networkId,
    keyStore,
    nodeUrl: rpcUrl,
    walletUrl: `https://wallet.${networkId}.near.org`,
    helperUrl: `https://helper.${networkId}.near.org`,
  });

  const owner = await near.account(ownerId);

  console.log("Running migrate_v2...");
  await owner.functionCall({
    contractId,
    methodName: "migrate_v2",
    args: {
      oracle_account_id: oracleAccountId,
      storage_fee_yocto: storageFee,
      topup_window_ms: topupWindowMs,
    },
    gas: "150000000000000",
    attachedDeposit: "0",
  });

  console.log("Migration complete");
  console.log({ contractId, oracleAccountId, storageFee, topupWindowMs });
}

main().catch((error) => {
  console.error("migrate-v2 failed", error);
  process.exit(1);
});
