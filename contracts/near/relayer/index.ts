import { loadConfig } from "./config";
import { RelayerRunner } from "./runner";

async function main() {
  const config = loadConfig();
  console.log("[relayer] starting", {
    networkId: config.networkId,
    rpcUrl: config.rpcUrl,
    contractId: config.contractId,
    oracleAccountId: config.oracleAccountId,
    pollIntervalMs: config.pollIntervalMs,
    intentsBaseUrl: config.intentsBaseUrl,
  });

  const runner = await RelayerRunner.init(config);

  const shutdown = () => {
    console.log("[relayer] shutdown requested");
    runner.requestShutdown();
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  await runner.runForever();
}

main().catch((error) => {
  console.error("[relayer] fatal error", error);
  process.exit(1);
});
