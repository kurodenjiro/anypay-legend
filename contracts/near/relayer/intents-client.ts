export type IntentsStatus =
  | "PENDING_DEPOSIT"
  | "PROCESSING"
  | "SUCCESS"
  | "FAILED"
  | "REFUNDED"
  | "INCOMPLETE_DEPOSIT"
  | string;

export interface QuoteRequest {
  assetId: string;
  amount: string;
  recipient: string;
  refundTo: string;
}

export interface CreatedQuote {
  quoteId: string;
  depositAddress: string;
  depositMemo?: string;
  quoteExpiresAtMs: number;
  amountIn?: string;
}

export interface StatusResponse {
  correlationId?: string;
  status: IntentsStatus;
  updatedAt?: string;
  quoteResponse?: {
    quote?: {
      amountIn?: string;
    };
  };
  swapDetails?: {
    amountIn?: string;
    depositedAmount?: string;
    originChainTxHashes?: Array<{ hash?: string }>;
    refundReason?: string;
  };
}

function toEpochMs(value?: string): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return 0;
  return parsed;
}

export function isTerminalStatus(status: IntentsStatus): boolean {
  return ["SUCCESS", "FAILED", "REFUNDED", "INCOMPLETE_DEPOSIT"].includes(status);
}

export class IntentsClient {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey?: string,
  ) {}

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(init?.headers as Record<string, string> | undefined),
    };

    if (this.apiKey) {
      headers.Authorization = `Bearer ${this.apiKey}`;
    }

    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Intents API ${path} failed (${response.status}): ${text}`);
    }

    return (await response.json()) as T;
  }

  async createFundingQuote(input: QuoteRequest): Promise<CreatedQuote> {
    const body = {
      dry: false,
      swapType: "EXACT_INPUT",
      originAsset: input.assetId,
      destinationAsset: input.assetId,
      amount: input.amount,
      deadline: new Date(Date.now() + 10 * 60_000).toISOString(),
      recipient: input.recipient,
      refundTo: input.refundTo,
      depositType: "ORIGIN_CHAIN",
      recipientType: "INTENTS",
      refundType: "ORIGIN_CHAIN",
      slippageTolerance: 100,
    };

    const result = await this.request<{
      correlationId: string;
      quote: {
        depositAddress: string;
        depositMemo?: string | null;
        deadline?: string;
        timeWhenInactive?: string;
        amountIn?: string;
      };
    }>("/v0/quote", {
      method: "POST",
      body: JSON.stringify(body),
    });

    const quoteExpiresAtMs =
      toEpochMs(result.quote.timeWhenInactive)
      || toEpochMs(result.quote.deadline)
      || Date.now() + 10 * 60_000;

    return {
      quoteId: result.correlationId,
      depositAddress: result.quote.depositAddress,
      depositMemo: result.quote.depositMemo || undefined,
      quoteExpiresAtMs,
      amountIn: result.quote.amountIn,
    };
  }

  async getStatus(input: {
    depositAddress: string;
    depositMemo?: string;
  }): Promise<StatusResponse> {
    const params = new URLSearchParams({ depositAddress: input.depositAddress });
    if (input.depositMemo) params.set("depositMemo", input.depositMemo);

    return this.request<StatusResponse>(`/v0/status?${params.toString()}`);
  }
}
