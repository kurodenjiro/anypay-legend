import { connect, keyStores, KeyPair, providers } from "near-api-js";

export type FundingStatus =
  | "AwaitingFunding"
  | "Funded"
  | "TopUpExpired"
  | "Failed"
  | "Cancelled";

export interface DepositFundingMetaView {
  asset_id: string;
  refund_to: string;
  quote_id?: string | null;
  deposit_address?: string | null;
  deposit_memo?: string | null;
  quote_expires_at_ms: number;
  quote_generation: number;
  funding_started_at_ms: number;
  topup_deadline_at_ms: number;
  status: FundingStatus;
  funded_amount: string;
  origin_tx_hash?: string | null;
  last_intents_status?: string | null;
  failure_reason?: string | null;
  updated_at_ms: number;
}

export interface DepositView {
  deposit_id: number;
  depositor: string;
  delegate?: string | null;
  token: string;
  total_deposit: string;
  remaining_deposits: string;
  outstanding_intents: string;
  min_intent_amount: string;
  max_intent_amount: string;
  payment_methods: string[];
}

interface NearOracleClientConfig {
  networkId: string;
  rpcUrl: string;
  contractId: string;
  oracleAccountId: string;
  oraclePrivateKey: string;
}

const CHANGE_GAS = "120000000000000";

export class NearOracleClient {
  private constructor(
    private readonly provider: providers.JsonRpcProvider,
    private readonly account: any,
    private readonly contractId: string,
  ) {}

  static async init(config: NearOracleClientConfig): Promise<NearOracleClient> {
    const keyStore = new keyStores.InMemoryKeyStore();
    await keyStore.setKey(
      config.networkId,
      config.oracleAccountId,
      KeyPair.fromString(config.oraclePrivateKey as `ed25519:${string}`),
    );

    const near = await connect({
      networkId: config.networkId,
      nodeUrl: config.rpcUrl,
      keyStore,
      walletUrl: `https://wallet.${config.networkId}.near.org`,
      helperUrl: `https://helper.${config.networkId}.near.org`,
    });

    const account = await near.account(config.oracleAccountId);
    const provider = new providers.JsonRpcProvider({ url: config.rpcUrl });
    return new NearOracleClient(provider, account, config.contractId);
  }

  private async view<T>(methodName: string, args: unknown = {}): Promise<T> {
    const result: any = await this.provider.query({
      request_type: "call_function",
      account_id: this.contractId,
      method_name: methodName,
      args_base64: Buffer.from(JSON.stringify(args)).toString("base64"),
      finality: "final",
    });

    return JSON.parse(Buffer.from(result.result).toString()) as T;
  }

  private async call(methodName: string, args: unknown): Promise<void> {
    await this.account.functionCall({
      contractId: this.contractId,
      methodName,
      args,
      gas: CHANGE_GAS,
      attachedDeposit: "0",
    });
  }

  async getAwaitingDepositIds(pageSize: number): Promise<number[]> {
    const output: number[] = [];
    let offset = 0;

    while (true) {
      const page = await this.view<number[]>("get_deposits_by_funding_status_v2", {
        status: "AwaitingFunding",
        from_index: offset,
        limit: pageSize,
      });

      if (!Array.isArray(page) || page.length === 0) break;
      output.push(...page.map((value) => Number(value)).filter(Number.isFinite));

      if (page.length < pageSize) break;
      offset += page.length;
    }

    return output;
  }

  async getDepositFunding(depositId: number): Promise<DepositFundingMetaView | null> {
    return this.view<DepositFundingMetaView | null>("get_deposit_funding_v2", {
      deposit_id: depositId,
    });
  }

  async getDeposit(depositId: number): Promise<DepositView | null> {
    return this.view<DepositView | null>("get_deposit", { deposit_id: depositId });
  }

  async oracleSetQuote(input: {
    depositId: number;
    quoteId: string;
    depositAddress: string;
    depositMemo?: string;
    quoteExpiresAtMs: number;
  }): Promise<void> {
    await this.call("oracle_set_quote_v2", {
      deposit_id: input.depositId,
      quote_id: input.quoteId,
      deposit_address: input.depositAddress,
      deposit_memo: input.depositMemo || null,
      quote_expires_at_ms: input.quoteExpiresAtMs,
    });
  }

  async oracleMarkQuoteExpired(input: {
    depositId: number;
    quoteId: string;
  }): Promise<void> {
    await this.call("oracle_mark_quote_expired_v2", {
      deposit_id: input.depositId,
      quote_id: input.quoteId,
    });
  }

  async oracleConfirmFunding(input: {
    depositId: number;
    quoteId: string;
    fundedAmount: string;
    originTxHash: string;
    intentsStatus: string;
  }): Promise<void> {
    await this.call("oracle_confirm_funding_v2", {
      deposit_id: input.depositId,
      quote_id: input.quoteId,
      funded_amount: input.fundedAmount,
      origin_tx_hash: input.originTxHash,
      intents_status: input.intentsStatus,
    });
  }

  async oracleMarkFailed(input: {
    depositId: number;
    quoteId: string;
    intentsStatus: string;
    reason: string;
  }): Promise<void> {
    await this.call("oracle_mark_failed_v2", {
      deposit_id: input.depositId,
      quote_id: input.quoteId,
      intents_status: input.intentsStatus,
      reason: input.reason,
    });
  }

  async oracleMarkTopupExpired(input: {
    depositId: number;
    quoteId: string;
    reason: string;
  }): Promise<void> {
    await this.call("oracle_mark_topup_expired_v2", {
      deposit_id: input.depositId,
      quote_id: input.quoteId,
      reason: input.reason,
    });
  }
}
