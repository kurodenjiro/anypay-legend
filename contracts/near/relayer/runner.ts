import type { RelayerConfig } from "./config.ts";
import { IntentsClient } from "./intents-client.ts";
import {
  type DepositFundingMetaView,
  NearOracleClient,
} from "./near-client.ts";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toExpandedIntegerFromScientific(value: string): string {
  const normalized = value.trim().toLowerCase();
  const match = normalized.match(/^(\d+)(?:\.(\d+))?e\+?(\d+)$/);
  if (!match) return "0";

  const intPart = match[1];
  const fraction = match[2] || "";
  const exponent = Number(match[3]);

  if (!Number.isFinite(exponent) || exponent < 0) return "0";

  if (fraction.length === 0) {
    return `${intPart}${"0".repeat(exponent)}`;
  }

  if (exponent >= fraction.length) {
    return `${intPart}${fraction}${"0".repeat(exponent - fraction.length)}`;
  }

  return `${intPart}${fraction.slice(0, exponent)}`;
}

function normalizeAmount(value?: string | number | bigint): string {
  if (value === undefined || value === null) return "0";

  if (typeof value === "bigint") {
    return value >= 0n ? value.toString() : "0";
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0) return "0";
    if (Number.isSafeInteger(value)) {
      return value.toString();
    }

    const full = value.toLocaleString("fullwide", {
      useGrouping: false,
      maximumFractionDigits: 0,
    });
    const cleaned = full.replace(/\D/g, "");
    return cleaned.length > 0 ? cleaned : "0";
  }

  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) return trimmed;
  if (/^\d+(?:\.\d+)?e\+?\d+$/i.test(trimmed)) {
    const expanded = toExpandedIntegerFromScientific(trimmed);
    return /^\d+$/.test(expanded) ? expanded : "0";
  }
  return "0";
}

function pickPositiveAmount(values: string[]): string {
  for (const value of values) {
    try {
      if (BigInt(value) > 0n) return value;
    } catch {
      // ignore and continue
    }
  }
  return "0";
}

function normalizeQuoteAmountForAsset(rawAmount: string, assetId: string): {
  amount: string;
  adjusted: boolean;
} {
  const normalizedAsset = assetId.toLowerCase();
  let value: bigint;
  try {
    value = BigInt(rawAmount);
  } catch {
    return { amount: "0", adjusted: false };
  }

  if (value <= BigInt(0)) {
    return { amount: "0", adjusted: false };
  }

  // Legacy compatibility:
  // Early V2 UI sent BTC/ZEC using 24 decimals (NEAR yocto-style) instead of
  // sat/zat 8 decimals. If detected, downscale by 10^(24-8)=10^16.
  if (normalizedAsset.includes("btc") || normalizedAsset.includes("zec")) {
    const legacyScale = BigInt(10) ** BigInt(16);
    if (value >= legacyScale && value % legacyScale === BigInt(0)) {
      return { amount: (value / legacyScale).toString(), adjusted: true };
    }
  }

  return { amount: value.toString(), adjusted: false };
}

function deriveOriginTxHash(status: any): string {
  const fromSwap = status?.swapDetails?.originChainTxHashes?.[0]?.hash;
  if (typeof fromSwap === "string" && fromSwap.length > 0) return fromSwap;

  const correlation = status?.correlationId;
  if (typeof correlation === "string" && correlation.length > 0) {
    return `correlation:${correlation}`;
  }

  return `unknown:${Date.now()}`;
}

function parseHttpStatusFromError(error: unknown): number | null {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const match = message.match(/failed \((\d{3})\)/);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

function isPermanentQuoteFailure(error: unknown): boolean {
  const status = parseHttpStatusFromError(error);
  if (status === null) return false;
  return [400, 401, 403, 404, 422].includes(status);
}

function summarizeError(error: unknown, maxLen = 180): string {
  const message = error instanceof Error ? error.message : String(error ?? "Unknown error");
  return message.length <= maxLen ? message : `${message.slice(0, maxLen - 3)}...`;
}

function isPositiveIntegerString(value: string): boolean {
  try {
    return BigInt(value) > BigInt(0);
  } catch {
    return false;
  }
}

function isLargeAmountMismatch(expected: string, actual: string): boolean {
  try {
    const expectedValue = BigInt(expected);
    const actualValue = BigInt(actual);
    if (expectedValue <= BigInt(0) || actualValue <= BigInt(0)) return false;

    // Consider as mismatch only for major scale drift to avoid noisy re-quotes.
    return actualValue > expectedValue * BigInt(5) || actualValue * BigInt(5) < expectedValue;
  } catch {
    return false;
  }
}

export class RelayerRunner {
  private running = false;
  private shutdownRequested = false;
  private readonly config: RelayerConfig;
  private readonly intentsClient: IntentsClient;
  private readonly nearClient: NearOracleClient;

  private constructor(
    config: RelayerConfig,
    intentsClient: IntentsClient,
    nearClient: NearOracleClient,
  ) {
    this.config = config;
    this.intentsClient = intentsClient;
    this.nearClient = nearClient;
  }

  static async init(config: RelayerConfig): Promise<RelayerRunner> {
    const intentsClient = new IntentsClient(config.intentsBaseUrl, config.intentsApiKey);
    const nearClient = await NearOracleClient.init({
      networkId: config.networkId,
      rpcUrl: config.rpcUrl,
      contractId: config.contractId,
      oracleAccountId: config.oracleAccountId,
      oraclePrivateKey: config.oraclePrivateKey,
    });

    return new RelayerRunner(config, intentsClient, nearClient);
  }

  requestShutdown(): void {
    this.shutdownRequested = true;
  }

  async runForever(): Promise<void> {
    if (this.running) return;
    this.running = true;

    while (!this.shutdownRequested) {
      const startedAt = Date.now();

      try {
        await this.tick();
      } catch (error) {
        console.error("[relayer] tick failed", error);
      }

      const elapsed = Date.now() - startedAt;
      const waitMs = Math.max(250, this.config.pollIntervalMs - elapsed);
      await sleep(waitMs);
    }

    this.running = false;
  }

  private async tick(): Promise<void> {
    const awaiting = await this.nearClient.getAwaitingDepositIds(this.config.pageSize);
    if (awaiting.length === 0) {
      return;
    }

    for (const depositId of awaiting) {
      try {
        await this.processDeposit(depositId);
      } catch (error) {
        console.error(`[relayer] deposit ${depositId} processing failed`, error);
      }
    }
  }

  private async processDeposit(depositId: number): Promise<void> {
    const funding = await this.nearClient.getDepositFunding(depositId);
    if (!funding || funding.status !== "AwaitingFunding") {
      return;
    }

    const now = Date.now();
    const topupDeadline = Number(funding.topup_deadline_at_ms || 0);

    if (topupDeadline > 0 && now >= topupDeadline) {
      await this.nearClient.oracleMarkTopupExpired({
        depositId,
        quoteId: funding.quote_id || `expired:${depositId}`,
        reason: "Top-up deadline reached",
      });
      return;
    }

    if (!funding.quote_id || !funding.deposit_address) {
      await this.createOrRotateQuote(depositId, funding);
      return;
    }

    const status = await this.intentsClient.getStatus({
      depositAddress: funding.deposit_address,
      depositMemo: funding.deposit_memo || undefined,
    });

    const quoteNearExpiry =
      funding.quote_expires_at_ms > 0
      && now + this.config.quoteRotationBufferMs >= funding.quote_expires_at_ms;

    // If a pending quote exists with no detected deposit yet, ensure it still
    // matches the expected amount scale for this asset. This self-heals legacy
    // quotes created before amount-unit fixes.
    if (status.status === "PENDING_DEPOSIT") {
      const detectedDeposit = normalizeAmount(status.swapDetails?.depositedAmount);
      const quoteAmount = pickPositiveAmount([
        normalizeAmount(status.quoteResponse?.quote?.amountIn),
        normalizeAmount(status.swapDetails?.amountIn),
      ]);

      if (!isPositiveIntegerString(detectedDeposit) && quoteAmount !== "0") {
        const deposit = await this.nearClient.getDeposit(depositId);
        const expectedRaw = normalizeAmount(deposit?.total_deposit);
        const expectedNormalized = normalizeQuoteAmountForAsset(expectedRaw, funding.asset_id).amount;
        if (
          expectedNormalized !== "0"
          && isLargeAmountMismatch(expectedNormalized, quoteAmount)
        ) {
          console.warn(
            `[relayer] deposit ${depositId} quote amount mismatch (${quoteAmount} vs ${expectedNormalized}), rotating quote`,
          );
          await this.nearClient.oracleMarkQuoteExpired({
            depositId,
            quoteId: funding.quote_id,
          });
          await this.createOrRotateQuote(depositId, funding);
          return;
        }
      }
    }

    switch (status.status) {
      case "SUCCESS": {
        const deposit = await this.nearClient.getDeposit(depositId);
        const fallbackAmount = normalizeAmount(deposit?.total_deposit);
        const fundedAmount = pickPositiveAmount([
          normalizeAmount(status.swapDetails?.depositedAmount),
          normalizeAmount(status.swapDetails?.amountIn),
          normalizeAmount(status.quoteResponse?.quote?.amountIn),
          fallbackAmount,
        ]);

        if (fundedAmount === "0") {
          console.warn(`[relayer] deposit ${depositId} SUCCESS status without positive amount`);
          return;
        }

        await this.nearClient.oracleConfirmFunding({
          depositId,
          quoteId: funding.quote_id,
          fundedAmount,
          originTxHash: deriveOriginTxHash(status),
          intentsStatus: status.status,
        });
        return;
      }

      case "FAILED":
      case "REFUNDED": {
        await this.nearClient.oracleMarkFailed({
          depositId,
          quoteId: funding.quote_id,
          intentsStatus: status.status,
          reason: status.swapDetails?.refundReason || `Intents status: ${status.status}`,
        });
        return;
      }

      case "INCOMPLETE_DEPOSIT": {
        if (topupDeadline > 0 && now >= topupDeadline) {
          await this.nearClient.oracleMarkTopupExpired({
            depositId,
            quoteId: funding.quote_id,
            reason: "Incomplete deposit until deadline",
          });
          return;
        }

        if (quoteNearExpiry) {
          await this.nearClient.oracleMarkQuoteExpired({
            depositId,
            quoteId: funding.quote_id,
          });
          await this.createOrRotateQuote(depositId, funding);
        }
        return;
      }

      case "PROCESSING":
        // Deposit detected and being processed by Intents.
        // Keep current quote and wait for terminal status so we don't lose tracking.
        return;

      default: {
        // Usually PENDING_DEPOSIT or provider-specific intermediate state.
        if (quoteNearExpiry) {
          await this.nearClient.oracleMarkQuoteExpired({
            depositId,
            quoteId: funding.quote_id,
          });
          await this.createOrRotateQuote(depositId, funding);
        }
        return;
      }
    }
  }

  private async createOrRotateQuote(
    depositId: number,
    funding: DepositFundingMetaView,
  ): Promise<void> {
    const deposit = await this.nearClient.getDeposit(depositId);
    if (!deposit) return;

    const rawAmount = normalizeAmount(deposit.total_deposit);
    const normalized = normalizeQuoteAmountForAsset(rawAmount, funding.asset_id);
    const amount = normalized.amount;
    if (amount === "0") {
      console.warn(`[relayer] deposit ${depositId} has zero expected amount`);
      return;
    }
    if (normalized.adjusted) {
      console.warn(
        `[relayer] deposit ${depositId} amount adjusted for ${funding.asset_id}: `
        + `${rawAmount} -> ${amount}`,
      );
    }

    try {
      const quote = await this.intentsClient.createFundingQuote({
        assetId: funding.asset_id,
        amount,
        recipient: deposit.depositor,
        refundTo: funding.refund_to,
      });

      await this.nearClient.oracleSetQuote({
        depositId,
        quoteId: quote.quoteId,
        depositAddress: quote.depositAddress,
        depositMemo: quote.depositMemo,
        quoteExpiresAtMs: quote.quoteExpiresAtMs,
      });
    } catch (error) {
      if (isPermanentQuoteFailure(error)) {
        await this.nearClient.oracleMarkFailed({
          depositId,
          quoteId: funding.quote_id || `quote-create:${depositId}`,
          intentsStatus: "QUOTE_CREATE_FAILED",
          reason: summarizeError(error),
        });
        return;
      }

      throw error;
    }
  }
}
