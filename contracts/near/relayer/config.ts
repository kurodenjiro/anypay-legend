export interface RelayerConfig {
  networkId: string;
  rpcUrl: string;
  contractId: string;
  oracleAccountId: string;
  oraclePrivateKey: string;
  intentsApiKey?: string;
  intentsBaseUrl: string;
  pollIntervalMs: number;
  pageSize: number;
  quoteRotationBufferMs: number;
}

function getRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

function getNumberEnv(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid numeric env ${name}: ${raw}`);
  }

  return Math.floor(parsed);
}

export function loadConfig(): RelayerConfig {
  return {
    networkId: process.env.NETWORK_ID?.trim() || "testnet",
    rpcUrl: getRequiredEnv("RPC_URL"),
    contractId: getRequiredEnv("CONTRACT_ID"),
    oracleAccountId: getRequiredEnv("ORACLE_ACCOUNT_ID"),
    oraclePrivateKey: getRequiredEnv("ORACLE_PRIVATE_KEY"),
    intentsApiKey: process.env.INTENTS_API_KEY?.trim() || undefined,
    intentsBaseUrl:
      process.env.INTENTS_BASE_URL?.trim() || "https://1click.chaindefuser.com",
    pollIntervalMs: getNumberEnv("RELAYER_POLL_INTERVAL_MS", 5_000),
    pageSize: getNumberEnv("RELAYER_PAGE_SIZE", 100),
    quoteRotationBufferMs: getNumberEnv("RELAYER_QUOTE_ROTATION_BUFFER_MS", 10_000),
  };
}
