import { setupWalletSelector, type WalletSelector, type AccountState } from "@near-wallet-selector/core";
import { setupMyNearWallet } from "@near-wallet-selector/my-near-wallet";
import { setupNightly } from "@near-wallet-selector/nightly";
import { setupModal } from "@near-wallet-selector/modal-ui";
import { keccak256, toBytes, parseUnits, formatUnits } from 'viem';
import { JsonRpcProvider } from 'near-api-js';
import { PrivyNearWallet } from './privy-wallet';
import { NetworkId, providerUrl, HelloNearContract } from "./near-network";
import {
    getMinDepositAmountByAssetId,
    getAssetDecimalsByAssetId,
    DEFAULT_INTENTS_MIN_DEPOSIT_AMOUNT,
} from "./intents-pricing";

// MPC Contract ID (Testnet)
const MPC_CONTRACT_ID = 'v1.signer-prod.testnet';
// Our Contract ID
const CONTRACT_ID = HelloNearContract;
const V2_STORAGE_FEE_YOCTO =
    process.env.NEXT_PUBLIC_NEAR_V2_STORAGE_FEE_YOCTO || "50000000000000000000000"; // 0.05 NEAR
const DEPOSIT_FLOW_MODE = process.env.NEXT_PUBLIC_DEPOSIT_FLOW === "legacy" ? "legacy" : "v2";
const STORAGE_COST_PER_BYTE_YOCTO = 10_000_000_000_000_000_000n;

function normalizeAmountInput(value: string): string {
    return String(value ?? "").trim().replace(",", ".");
}

function toYoctoAmount(value: string, label: string): string {
    return toAtomicAmount(value, label, 24);
}

function toAtomicAmount(value: string, label: string, decimals: number): string {
    const normalized = normalizeAmountInput(value);
    if (!normalized) {
        throw new Error(`${label} is required`);
    }

    if (/e/i.test(normalized)) {
        throw new Error(`${label} must be a plain decimal number (scientific notation is not supported)`);
    }

    try {
        const atomic = parseUnits(normalized, decimals).toString();
        if (!/^\d+$/.test(atomic)) {
            throw new Error("not an integer");
        }
        return atomic;
    } catch (error: any) {
        throw new Error(`${label} is invalid: ${error?.message || String(error)}`);
    }
}

function inferDecimalsFromAssetId(assetId: string): number {
    const normalized = String(assetId || "").toLowerCase();
    if (normalized.includes("btc") || normalized.includes("zec")) return 8;
    if (normalized.includes("eth")) return 18;
    return 24;
}

function parseStorageUsage(accountState: AccountState): bigint {
    const maybeState = accountState as AccountState & { storage_usage?: number | string };
    const raw = maybeState.storage_usage ?? 0;
    try {
        const parsed = BigInt(String(raw));
        return parsed > 0n ? parsed : 0n;
    } catch {
        return 0n;
    }
}

function normalizeErrorMessage(error: unknown): string {
    if (error instanceof Error && error.message) return error.message;
    if (typeof error === "string") return error;
    return String(error ?? "Unknown error");
}

function isInsufficientStateBalanceError(error: unknown): boolean {
    const message = normalizeErrorMessage(error).toLowerCase();
    return (
        message.includes("lackbalanceforstate")
        || message.includes("lacks balance")
        || message.includes("enough balance to cover storage")
        || message.includes("for state")
    );
}

async function resolveAssetDecimals(assetId: string): Promise<number> {
    // 1Click quote amount for these assets is expected in origin-chain atomic units
    // (BTC satoshis, ETH wei, ZEC zats). Prefer deterministic mapping first.
    const inferred = inferDecimalsFromAssetId(assetId);
    if (inferred !== 24) {
        return inferred;
    }

    const fromOneClick = await getAssetDecimalsByAssetId(assetId).catch(() => null);
    if (typeof fromOneClick === "number" && Number.isFinite(fromOneClick) && fromOneClick >= 0) {
        return fromOneClick;
    }
    return inferred;
}

// Simple state management without framework dependency
export interface NearState {
    accountId: string | null;
    isConnected: boolean;
    isLoading: boolean;
}

export interface NearBalance {
    yocto: string;
    near: string;
    totalYocto?: string;
    totalNear?: string;
    storageLockedYocto?: string;
    storageLockedNear?: string;
}

export type FundingStatusV2 =
    | "AwaitingFunding"
    | "Funded"
    | "TopUpExpired"
    | "Failed"
    | "Cancelled";

export interface DepositFundingMetaV2 {
    asset_id: string;
    refund_to: string;
    quote_id?: string | null;
    deposit_address?: string | null;
    deposit_memo?: string | null;
    quote_expires_at_ms: number;
    quote_generation: number;
    funding_started_at_ms: number;
    topup_deadline_at_ms: number;
    status: FundingStatusV2;
    funded_amount: string;
    origin_tx_hash?: string | null;
    last_intents_status?: string | null;
    failure_reason?: string | null;
    updated_at_ms: number;
}

export interface DepositSummaryV2 {
    deposit_id: number;
    asset_id: string;
    depositor: string;
    delegate?: string | null;
    payment_methods: string[];
    min_intent_amount: string;
    max_intent_amount: string;
    funded_amount: string;
    remaining_deposits: string;
    topup_deadline_at_ms: number;
    quote_expires_at_ms: number;
    status: FundingStatusV2;
    updated_at_ms: number;
}

export interface DepositRecord {
    deposit_id: number;
    depositor: string;
    delegate?: string | null;
    token: string;
    total_deposit: string;
    remaining_deposits: string;
    outstanding_intents: string;
    min_intent_amount: string;
    max_intent_amount: string;
    timestamp: number;
    payment_methods: string[];
}

export type IntentRecordStatus = "Signaled" | "Fulfilled" | "Cancelled" | "Released" | string;

export interface IntentRecord {
    intent_hash: string;
    buyer: string;
    deposit_id: number;
    amount: string;
    timestamp: number;
    payment_method: string;
    currency_code: string;
    status: IntentRecordStatus;
    recipient: string;
    chain: string;
}

export interface IntentTransferDetailsRecord {
    intent_hash: string;
    deposit_id: number;
    amount: string;
    currency_code: string;
    payment_method_raw: string;
    platform: string;
    tagname: string;
    memo: string;
}

let stateListeners: Array<(state: NearState) => void> = [];

export function subscribeToNearState(callback: (state: NearState) => void) {
    stateListeners.push(callback);
    return () => {
        stateListeners = stateListeners.filter(cb => cb !== callback);
    };
}

function notifyStateChange(state: NearState) {
    stateListeners.forEach(cb => cb(state));
}

export class NearService {
    selector: WalletSelector | null = null;
    modal: any | null = null;
    wallet: any | null = null;
    accountId: string | null = null;

    getDepositFlowMode(): "legacy" | "v2" {
        return DEPOSIT_FLOW_MODE;
    }

    isV2FlowEnabled(): boolean {
        return this.getDepositFlowMode() === "v2";
    }

    async init() {
        if (this.selector) return;
        console.log("NEAR Service: Initializing...");

        try {
            this.selector = await setupWalletSelector({
                network: NetworkId,
                modules: [
                    setupMyNearWallet(),
                    setupNightly()
                ],
            });
            console.log("NEAR Service: Selector setup complete");


            this.modal = setupModal(this.selector, {
                contractId: CONTRACT_ID,
            });
            console.log("NEAR Service: Modal setup complete");

            const state = this.selector.store.getState();
            this.updateStore(state.accounts);

        } catch (e) {
            console.error("NEAR Service: Initialization failed", e);
        }

        if (!this.selector) return;

        // Listen for sign-in event
        this.selector.store.observable.subscribe((state) => {
            this.updateStore(state.accounts);
        });
    }

    // Allow injecting a wallet directly (e.g. from Privy)
    async setWallet(wallet: any, accountId: string) {
        // Validation: Check if the wallet supports NEAR transactions
        // We now support standard NEAR wallets AND our custom PrivyNearWallet adapter
        const isValidNearWallet = (wallet && typeof wallet.signAndSendTransaction === 'function') ||
            (wallet instanceof PrivyNearWallet);

        if (!isValidNearWallet) {
            console.warn("NEAR Service: Injected wallet does not appear to be a valid NEAR wallet or Privy adapter.", wallet);
        }

        // Avoid redundant re-assignment
        if (this.accountId === accountId && this.wallet === wallet) {
            return;
        }

        this.wallet = wallet;
        this.accountId = accountId;

        const mode = (wallet instanceof PrivyNearWallet) ? 'privy-native' : 'standard';

        console.log(`NEAR Service: Wallet connected (${mode})`, { accountId });
        notifyStateChange({ accountId, isConnected: true, isLoading: false });
    }

    private async updateStore(accounts: Array<any>) {
        if (accounts.length > 0) {
            this.accountId = accounts[0].accountId;
            this.wallet = await this.selector!.wallet();
            notifyStateChange({ accountId: this.accountId, isConnected: true, isLoading: false });
        } else {
            this.accountId = null;
            this.wallet = null;
            notifyStateChange({ accountId: null, isConnected: false, isLoading: false });
        }
    }

    // ... existing methods ...

    async login() {
        if (!this.modal) await this.init();
        this.modal.show();
    }

    async logout(options?: { silent?: boolean }) {
        const silent = options?.silent ?? true;

        try {
            if (this.wallet && typeof this.wallet.signOut === 'function') {
                await this.wallet.signOut();
            }
        } catch (e) {
            console.warn("NEAR Service: wallet.signOut failed", e);
        }

        this.wallet = null;
        this.accountId = null;
        notifyStateChange({ accountId: null, isConnected: false, isLoading: false });

        if (!silent && typeof window !== 'undefined') {
            window.location.reload();
        }
    }

    // Derive MPC Address for a specific chain and path
    async deriveAddress(chain: 'BTC' | 'ETH', path: string): Promise<string> {
        if (!this.accountId) throw new Error("Not signed in");

        const derivationPath = `${this.accountId},${path}`;

        if (chain === 'ETH') {
            return `0x${keccak256(toBytes(derivationPath)).slice(-40)}`;
        } else {
            return `tb1${keccak256(toBytes(derivationPath)).slice(-30)}`;
        }
    }

    async getNativeBalance(accountId?: string): Promise<NearBalance> {
        const account = accountId || this.accountId;
        if (!account) throw new Error("No account specified");

        const provider = new JsonRpcProvider({ url: providerUrl });
        const accountState = await provider.viewAccount({ accountId: account });
        const totalYocto = BigInt(String(accountState.amount || "0"));
        const storageUsage = parseStorageUsage(accountState);
        const storageLockedYocto = storageUsage * STORAGE_COST_PER_BYTE_YOCTO;
        const spendableYocto =
            totalYocto > storageLockedYocto
                ? totalYocto - storageLockedYocto
                : 0n;

        return {
            yocto: spendableYocto.toString(),
            near: formatUnits(spendableYocto, 24),
            totalYocto: totalYocto.toString(),
            totalNear: formatUnits(totalYocto, 24),
            storageLockedYocto: storageLockedYocto.toString(),
            storageLockedNear: formatUnits(storageLockedYocto, 24),
        };
    }

    /**
     * Centralized method to handle transaction signing and sending
     * Supports both standard NEAR wallets and Privy (Ethereum) wallets via raw signing
     */
    private async _signAndSendTransaction(receiverId: string, actions: any[]) {
        if (!this.wallet || !this.accountId) throw new Error("Not signed in");

        // 1. Standard NEAR Wallet OR Privy Adapter (both have signAndSendTransaction)
        if (typeof this.wallet.signAndSendTransaction === 'function') {
            return await this.wallet.signAndSendTransaction({
                signerId: this.accountId,
                receiverId,
                actions
            });
        }

        // If we reach here, the wallet is invalid
        throw new Error(`Wallet type '${this.wallet.type}' not supported for NEAR transactions.`);
    }

    // === ESCROW FUNCTIONS ===

    /**
     * Create a new deposit
     */
    async createDeposit(
        token: string,
        amount: string,
        minIntentAmount: string,
        maxIntentAmount: string,
        paymentMethods: string[],
        delegate?: string
    ) {
        const amountYocto = toYoctoAmount(amount, "Amount");
        const minIntentAmountYocto = toYoctoAmount(minIntentAmount, "Min intent amount");
        const maxIntentAmountYocto = toYoctoAmount(maxIntentAmount, "Max intent amount");

        // If using standard wallet, pass action object.
        // If using Privy manual sign, we need 'Action' instances.
        // The _signAndSendTransaction method currently handles standard wallet actions.
        // But for Privy, we need to convert them.
        // For now, keeping the object format as standard wallets expect it.
        // _signAndSendTransaction will need to map it if we implement manual signing fully.

        return await this._signAndSendTransaction(CONTRACT_ID, [{
            type: "FunctionCall",
            params: {
                methodName: "create_deposit",
                args: {
                    token,
                    amount: amountYocto,
                    min_intent_amount: minIntentAmountYocto,
                    max_intent_amount: maxIntentAmountYocto,
                    payment_methods: paymentMethods,
                    delegate: delegate || null
                },
                gas: "30000000000000",
                deposit: "1000000000000000000000000" // 1 NEAR for storage
            }
        }]);
    }

    /**
     * Register a V2 seller funding intent. This does NOT fund liquidity immediately.
     */
    async registerDepositIntentV2(
        assetId: string,
        expectedAmount: string,
        minIntentAmount: string,
        maxIntentAmount: string,
        paymentMethods: string[],
        refundTo: string,
        delegate?: string,
    ) {
        if (!assetId) throw new Error("assetId is required");
        if (!refundTo) throw new Error("refundTo is required");
        const assetDecimals = await resolveAssetDecimals(assetId);
        const expectedAmountAtomic = toAtomicAmount(expectedAmount, "Expected amount", assetDecimals);
        const minIntentAmountAtomic = toAtomicAmount(minIntentAmount, "Min intent amount", assetDecimals);
        const maxIntentAmountAtomic = toAtomicAmount(maxIntentAmount, "Max intent amount", assetDecimals);
        const minimumAmountDisplay = await getMinDepositAmountByAssetId(
            assetId,
            undefined,
        ).catch(
            () => DEFAULT_INTENTS_MIN_DEPOSIT_AMOUNT,
        );
        let minimumAmountAtomic: bigint;
        try {
            minimumAmountAtomic = parseUnits(String(minimumAmountDisplay), assetDecimals);
        } catch {
            minimumAmountAtomic = parseUnits(DEFAULT_INTENTS_MIN_DEPOSIT_AMOUNT, assetDecimals);
        }
        if (BigInt(expectedAmountAtomic) < minimumAmountAtomic) {
            throw new Error(`Expected amount must be at least ${minimumAmountDisplay}`);
        }

        try {
            return await this._signAndSendTransaction(CONTRACT_ID, [{
                type: "FunctionCall",
                params: {
                    methodName: "register_deposit_intent_v2",
                    args: {
                        asset_id: assetId,
                        expected_amount: expectedAmountAtomic,
                        min_intent_amount: minIntentAmountAtomic,
                        max_intent_amount: maxIntentAmountAtomic,
                        payment_methods: paymentMethods,
                        delegate: delegate || null,
                        refund_to: refundTo,
                    },
                    gas: "60000000000000",
                    deposit: V2_STORAGE_FEE_YOCTO,
                }
            }]);
        } catch (error: unknown) {
            if (isInsufficientStateBalanceError(error)) {
                const feeNear = formatUnits(BigInt(V2_STORAGE_FEE_YOCTO), 24);
                throw new Error(
                    `Insufficient spendable NEAR to create a funding intent. `
                    + `You need at least ${feeNear} NEAR for storage fee plus gas.`,
                );
            }

            const message = normalizeErrorMessage(error);
            if (message.includes("Attached deposit is below V2 storage fee")) {
                const feeNear = formatUnits(BigInt(V2_STORAGE_FEE_YOCTO), 24);
                throw new Error(
                    `Funding storage fee mismatch. Contract requires at least ${feeNear} NEAR attached.`,
                );
            }

            throw error instanceof Error ? error : new Error(message);
        }
    }

    /**
     * Cancel V2 funding intent while it's still AwaitingFunding.
     */
    async cancelDepositIntentV2(depositId: number) {
        return await this._signAndSendTransaction(CONTRACT_ID, [{
            type: "FunctionCall",
            params: {
                methodName: "cancel_deposit_intent_v2",
                args: { deposit_id: depositId },
                gas: "30000000000000",
                deposit: "0",
            }
        }]);
    }

    /**
     * Withdraw from a specific deposit
     */
    async withdrawDeposit(depositId: number) {
        if (!this.wallet || !this.accountId) throw new Error("Not signed in");

        if (typeof this.wallet.signAndSendTransaction !== 'function') {
            throw new Error(`Wallet type not supported for NEAR transactions.`);
        }

        return await this.wallet.signAndSendTransaction({
            signerId: this.accountId,
            receiverId: CONTRACT_ID,
            actions: [{
                type: "FunctionCall",
                params: {
                    methodName: "withdraw_deposit",
                    args: { deposit_id: depositId },
                    gas: "30000000000000",
                    deposit: "0"
                }
            }]
        });
    }

    /**
     * Set delegate for deposit management
     */
    async setDelegate(depositId: number, delegate: string) {
        if (!this.wallet || !this.accountId) throw new Error("Not signed in");

        if (typeof this.wallet.signAndSendTransaction !== 'function') {
            throw new Error(`Wallet type not supported for NEAR transactions.`);
        }

        return await this.wallet.signAndSendTransaction({
            signerId: this.accountId,
            receiverId: CONTRACT_ID,
            actions: [{
                type: "FunctionCall",
                params: {
                    methodName: "set_delegate",
                    args: { deposit_id: depositId, delegate },
                    gas: "30000000000000",
                    deposit: "0"
                }
            }]
        });
    }

    // === ORCHESTRATOR FUNCTIONS ===

    /**
     * Signal intent to purchase liquidity
     */
    async signalIntent(
        deposit_id: number,
        amount: string,
        paymentMethod: string,
        currencyCode: string,
        recipient: string,
        chain: string
    ) {
        if (!this.wallet || !this.accountId) throw new Error("Not signed in");
        const deposit = await this.getDeposit(deposit_id).catch(() => null);
        const amountAtomic = deposit?.token
            ? toAtomicAmount(
                amount,
                "Intent amount",
                await resolveAssetDecimals(deposit.token),
            )
            : toYoctoAmount(amount, "Intent amount");

        if (typeof this.wallet.signAndSendTransaction !== 'function') {
            throw new Error(`Wallet type not supported for NEAR transactions.`);
        }

        return await this.wallet.signAndSendTransaction({
            signerId: this.accountId,
            receiverId: CONTRACT_ID,
            actions: [{
                type: "FunctionCall",
                params: {
                    methodName: "signal_intent",
                    args: {
                        deposit_id,
                        amount: amountAtomic,
                        payment_method: paymentMethod,
                        currency_code: currencyCode,
                        recipient,
                        chain
                    },
                    gas: "30000000000000",
                    deposit: "10000000000000000000000" // 0.01 NEAR
                }
            }]
        });
    }

    /**
     * Cancel an intent
     */
    async cancelIntent(intentHash: string) {
        if (!this.wallet || !this.accountId) throw new Error("Not signed in");

        if (typeof this.wallet.signAndSendTransaction !== 'function') {
            throw new Error(`Wallet type not supported for NEAR transactions.`);
        }

        return await this.wallet.signAndSendTransaction({
            signerId: this.accountId,
            receiverId: CONTRACT_ID,
            actions: [{
                type: "FunctionCall",
                params: {
                    methodName: "cancel_intent",
                    args: { intent_hash: intentHash },
                    gas: "30000000000000",
                    deposit: "0"
                }
            }]
        });
    }

    /**
     * Fulfill intent (relayer with zkTLS proof)
     */
    async fulfillIntent(intentHash: string) {
        if (!this.wallet || !this.accountId) throw new Error("Not signed in");

        if (typeof this.wallet.signAndSendTransaction !== 'function') {
            throw new Error(`Wallet type not supported for NEAR transactions.`);
        }

        return await this.wallet.signAndSendTransaction({
            signerId: this.accountId,
            receiverId: CONTRACT_ID,
            actions: [{
                type: "FunctionCall",
                params: {
                    methodName: "fulfill_intent",
                    args: { intent_hash: intentHash },
                    gas: "30000000000000",
                    deposit: "0"
                }
            }]
        });
    }

    /**
     * Fulfill intent and submit a proof payload in the same on-chain call.
     * Proof is stored in transaction arguments and contract logs for auditability.
     */
    async fulfillIntentWithProof(intentHash: string, proof: unknown) {
        if (!this.wallet || !this.accountId) throw new Error("Not signed in");
        if (typeof this.wallet.signAndSendTransaction !== 'function') {
            throw new Error(`Wallet type not supported for NEAR transactions.`);
        }

        const serializedProof = JSON.stringify(proof ?? {});
        if (!serializedProof || serializedProof === "{}") {
            throw new Error("Proof payload is empty");
        }

        return await this.wallet.signAndSendTransaction({
            signerId: this.accountId,
            receiverId: CONTRACT_ID,
            actions: [{
                type: "FunctionCall",
                params: {
                    methodName: "fulfill_intent_with_proof",
                    args: {
                        intent_hash: intentHash,
                        proof: serializedProof,
                    },
                    gas: "50000000000000",
                    deposit: "0"
                }
            }]
        });
    }

    /**
     * Fulfill intent using a signed TLSN attestation payload.
     */
    async fulfillIntentWithAttestation(intentHash: string, attestation: unknown) {
        if (!this.wallet || !this.accountId) throw new Error("Not signed in");
        if (typeof this.wallet.signAndSendTransaction !== 'function') {
            throw new Error(`Wallet type not supported for NEAR transactions.`);
        }

        const serializedAttestation = JSON.stringify(attestation ?? {});
        if (!serializedAttestation || serializedAttestation === "{}") {
            throw new Error("Attestation payload is empty");
        }

        return await this.wallet.signAndSendTransaction({
            signerId: this.accountId,
            receiverId: CONTRACT_ID,
            actions: [{
                type: "FunctionCall",
                params: {
                    methodName: "fulfill_intent_with_attestation",
                    args: {
                        intent_hash: intentHash,
                        attestation: serializedAttestation,
                    },
                    gas: "70000000000000",
                    deposit: "0"
                }
            }]
        });
    }

    /**
     * Release intent (depositor manually releases funds)
     */
    async releaseIntent(intentHash: string) {
        if (!this.wallet || !this.accountId) throw new Error("Not signed in");

        if (typeof this.wallet.signAndSendTransaction !== 'function') {
            throw new Error(`Wallet type not supported for NEAR transactions.`);
        }

        return await this.wallet.signAndSendTransaction({
            signerId: this.accountId,
            receiverId: CONTRACT_ID,
            actions: [{
                type: "FunctionCall",
                params: {
                    methodName: "release_intent",
                    args: { intent_hash: intentHash },
                    gas: "30000000000000",
                    deposit: "0"
                }
            }]
        });
    }

    // === PAYMENT METHOD REGISTRY ===

    async addPaymentMethod(name: string, verifier: string, currencies: string[]) {
        if (!this.wallet || !this.accountId) throw new Error("Not signed in");

        if (typeof this.wallet.signAndSendTransaction !== 'function') {
            throw new Error(`Wallet type not supported for NEAR transactions.`);
        }

        return await this.wallet.signAndSendTransaction({
            signerId: this.accountId,
            receiverId: CONTRACT_ID,
            actions: [{
                type: "FunctionCall",
                params: {
                    methodName: "add_payment_method",
                    args: { name, verifier, currencies },
                    gas: "30000000000000",
                    deposit: "0"
                }
            }]
        });
    }

    async removePaymentMethod(name: string) {
        if (!this.wallet || !this.accountId) throw new Error("Not signed in");

        if (typeof this.wallet.signAndSendTransaction !== 'function') {
            throw new Error(`Wallet type not supported for NEAR transactions.`);
        }

        return await this.wallet.signAndSendTransaction({
            signerId: this.accountId,
            receiverId: CONTRACT_ID,
            actions: [{
                type: "FunctionCall",
                params: {
                    methodName: "remove_payment_method",
                    args: { name },
                    gas: "30000000000000",
                    deposit: "0"
                }
            }]
        });
    }

    async setAttestationPublicKeyHex(publicKeyHex: string) {
        if (!this.wallet || !this.accountId) throw new Error("Not signed in");
        if (typeof this.wallet.signAndSendTransaction !== "function") {
            throw new Error("Wallet type not supported for NEAR transactions.");
        }

        return await this.wallet.signAndSendTransaction({
            signerId: this.accountId,
            receiverId: CONTRACT_ID,
            actions: [{
                type: "FunctionCall",
                params: {
                    methodName: "set_attestation_public_key_hex",
                    args: { public_key_hex: String(publicKeyHex || "").trim() },
                    gas: "30000000000000",
                    deposit: "0",
                },
            }],
        });
    }

    // === VIEW FUNCTIONS ===

    /**
     * Helper for view calls
     */
    private async view<T = unknown>(methodName: string, args: any = {}): Promise<T> {
        const provider = new JsonRpcProvider({ url: providerUrl });
        const result = await provider.query({
            request_type: 'call_function',
            account_id: CONTRACT_ID,
            method_name: methodName,
            args_base64: Buffer.from(JSON.stringify(args)).toString('base64'),
            finality: 'final'
        });

        // @ts-ignore
        return JSON.parse(Buffer.from(result.result).toString()) as T;
    }

    async getDeposit(depositId: number): Promise<DepositRecord | null> {
        return await this.view<DepositRecord | null>('get_deposit', { deposit_id: depositId });
    }

    async getDepositFundingV2(depositId: number): Promise<DepositFundingMetaV2 | null> {
        return await this.view<DepositFundingMetaV2 | null>('get_deposit_funding_v2', { deposit_id: depositId });
    }

    async getOpenDepositsByAssetV2(
        assetId: string,
        fromIndex = 0,
        limit = 20,
    ): Promise<DepositSummaryV2[]> {
        return await this.view<DepositSummaryV2[]>('get_open_deposits_by_asset_v2', {
            asset_id: assetId,
            from_index: fromIndex,
            limit,
        });
    }

    async getDepositsByFundingStatusV2(
        status: FundingStatusV2,
        fromIndex = 0,
        limit = 50,
    ): Promise<number[]> {
        return await this.view<number[]>('get_deposits_by_funding_status_v2', {
            status,
            from_index: fromIndex,
            limit,
        });
    }

    async getV2Config() {
        return await this.view('get_v2_config');
    }

    async getAttestationPublicKeyHex(): Promise<string> {
        return await this.view<string>('get_attestation_public_key_hex');
    }

    async getIntentAttestation(intentHash: string): Promise<string | null> {
        return await this.view<string | null>('get_intent_attestation', { intent_hash: intentHash });
    }

    async getAccountDeposits(accountId?: string): Promise<DepositRecord[]> {
        const account = accountId || this.accountId;
        if (!account) throw new Error("No account specified");

        // Contract returns Vec<u64> (Deposit IDs)
        const depositIds: number[] = await this.view<number[]>('get_account_deposits', { account_id: account });

        // Fetch full deposit details for each ID
        const deposits = await Promise.all(
            depositIds.map(id => this.getDeposit(id))
        );

        return deposits.filter((d): d is DepositRecord => d !== null);
    }

    async getIntent(intentHash: string): Promise<IntentRecord | null> {
        return await this.view<IntentRecord | null>('get_intent', { intent_hash: intentHash });
    }

    async getIntentTransferDetails(intentHash: string): Promise<IntentTransferDetailsRecord | null> {
        return await this.view<IntentTransferDetailsRecord | null>(
            'get_intent_transfer_details',
            { intent_hash: intentHash },
        );
    }

    async getAccountIntents(accountId?: string): Promise<IntentRecord[]> {
        const account = accountId || this.accountId;
        if (!account) throw new Error("No account specified");

        // Contract returns Vec<String> (Intent Hashes)
        const intentHashes: string[] = await this.view<string[]>('get_account_intents', { account_id: account });

        // Fetch full intent details for each hash
        const intents = await Promise.all(
            intentHashes.map(hash => this.getIntent(hash))
        );

        return intents.filter((i): i is IntentRecord => i !== null);
    }

    async getDepositIntents(depositId: number): Promise<IntentRecord[]> {
        // Contract returns Vec<String> (Intent Hashes)
        const intentHashes: string[] = await this.view<string[]>('get_deposit_intents', { deposit_id: depositId });

        const intents = await Promise.all(
            intentHashes.map(hash => this.getIntent(hash))
        );

        return intents.filter((i): i is IntentRecord => i !== null);
    }

    async getPaymentMethod(name: string) {
        return await this.view('get_payment_method', { name });
    }
}

export const nearService = new NearService();
