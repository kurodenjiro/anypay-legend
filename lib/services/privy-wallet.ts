import { Account, JsonRpcProvider, Signer, PublicKey, actions, KeyType } from "near-api-js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils";
import { providerUrl, helperUrl } from "./near-network";

// near-api-js v7 exports action creators under the 'actions' object
const { functionCall } = actions;
const TESTNET_HELPER_URL = helperUrl;

function readPositiveIntEnv(
    name: string,
    fallback: number,
    bounds?: { min?: number; max?: number },
): number {
    const raw = process.env[name];
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
    const floored = Math.floor(parsed);
    if (bounds?.min && floored < bounds.min) return bounds.min;
    if (bounds?.max && floored > bounds.max) return bounds.max;
    return floored;
}

const WALLET_PROXY_INIT_RETRY_DELAY_MS = readPositiveIntEnv(
    "NEXT_PUBLIC_PRIVY_WALLET_INIT_RETRY_DELAY_MS",
    800,
    { min: 250, max: 15_000 },
);
const WALLET_PROXY_INIT_MAX_WAIT_MS = readPositiveIntEnv(
    "NEXT_PUBLIC_PRIVY_WALLET_INIT_MAX_WAIT_MS",
    240_000,
    { min: 15_000, max: 900_000 },
);
const WALLET_PROXY_SIGN_ATTEMPT_TIMEOUT_MS = readPositiveIntEnv(
    "NEXT_PUBLIC_PRIVY_WALLET_SIGN_ATTEMPT_TIMEOUT_MS",
    20_000,
    { min: 3_000, max: 120_000 },
);
const WALLET_PROXY_PREWARM_MAX_WAIT_MS = readPositiveIntEnv(
    "NEXT_PUBLIC_PRIVY_WALLET_PREWARM_MAX_WAIT_MS",
    45_000,
    { min: 10_000, max: WALLET_PROXY_INIT_MAX_WAIT_MS },
);
const TX_SEND_MAX_RETRIES_ON_WALLET_INIT = 2;
const TX_SEND_RETRY_DELAY_MS = 1500;

/**
 * Custom Signer that uses Privy's signRawHash hook
 */
export class PrivyNearSigner extends Signer {
    private cachedPublicKey: PublicKey | null = null;

    constructor(
        private signRawHash: (params: { address: string; chainType: 'near' | 'ethereum' | 'solana'; hash: string }) => Promise<{ signature: string; encoding?: string }>,
        private accountId: string,
        private provider: JsonRpcProvider,
        publicKeyStr?: string
    ) {
        super();
        if (publicKeyStr) {
            // Handle the '00' prefix if present (indicating Ed25519 in Privy's format)
            const cleanKey = publicKeyStr.replace(/^00/, '');
            this.cachedPublicKey = new PublicKey({
                keyType: KeyType.ED25519,
                data: hexToBytes(cleanKey)
            });
        }
    }

    async getPublicKey(): Promise<PublicKey> {
        if (this.cachedPublicKey) return this.cachedPublicKey;

        // Fallback: try to fetch from chain
        try {
            const account = new Account(this.accountId, this.provider, this as any);
            const accessKeysResult = await account.getAccessKeyList();
            const accessKeys = accessKeysResult.keys;
            if (accessKeys && accessKeys.length > 0) {
                this.cachedPublicKey = PublicKey.from(accessKeys[0].public_key);
                return this.cachedPublicKey;
            }
        } catch (e) {
            console.warn("PrivyNearSigner: Could not fetch access keys from chain", e);
        }

        // Fallback for implicit accounts: If the account ID is 64 chars hex, it IS the public key
        if (this.accountId.length === 64 && /^[0-9a-fA-F]+$/.test(this.accountId)) {
            console.log("PrivyNearSigner: Deriving public key from implicit account ID");
            this.cachedPublicKey = new PublicKey({
                keyType: KeyType.ED25519,
                data: hexToBytes(this.accountId)
            });
            return this.cachedPublicKey;
        }

        throw new Error("No access keys found for account on-chain and could not derive from account ID. Ensure the account exists or provide publicKey.");
    }

    async createKey(accountId: string, networkId?: string): Promise<PublicKey> {
        throw new Error("PrivySigner does not support creating keys");
    }

    async signMessage(message: Uint8Array, accountId?: string, networkId?: string): Promise<{ signature: Uint8Array; publicKey: PublicKey }> {
        const signature = await this.signBytes(message);
        const publicKey = await this.getPublicKey();
        return { signature, publicKey };
    }

    private getErrorMessage(error: unknown): string {
        if (error instanceof Error) return error.message;
        if (typeof error === "string") return error;
        if (error && typeof error === "object" && "message" in error) {
            const maybeMessage = (error as { message?: unknown }).message;
            if (typeof maybeMessage === "string") return maybeMessage;
        }
        return String(error ?? "");
    }

    private isWalletProxyNotInitializedError(error: unknown): boolean {
        const message = this.getErrorMessage(error).toLowerCase();
        return (
            message.includes("wallet proxy not initialized")
            || message.includes("wallet is still initializing")
            || message.includes("wallet proxy is not initialized")
            || message.includes("wallet has not been initialized")
            || message.includes("wallet is initializing")
            || message.includes("wallet proxy initialization")
        );
    }

    private async waitForWalletProxyInitialization(attempt: number) {
        const delay = WALLET_PROXY_INIT_RETRY_DELAY_MS + Math.min((attempt - 1) * 200, 2000);
        await new Promise((resolve) => setTimeout(resolve, delay));
    }

    private async signRawHashWithTimeout(
        hashWithPrefix: string,
        timeoutMs: number,
        context: string,
    ): Promise<string> {
        let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
        try {
            const response = await Promise.race([
                this.signRawHash({
                    address: this.accountId,
                    chainType: "near",
                    hash: hashWithPrefix,
                }),
                new Promise<never>((_, reject) => {
                    timeoutHandle = setTimeout(() => {
                        reject(
                            new Error(
                                `Wallet proxy not initialized (${context} signing timed out after ${Math.ceil(timeoutMs / 1000)}s)`,
                            ),
                        );
                    }, timeoutMs);
                }),
            ]);

            return response.signature;
        } finally {
            if (timeoutHandle) clearTimeout(timeoutHandle);
        }
    }

    private async signHashWithWalletInitRetry(
        hashWithPrefix: string,
        options?: { maxWaitMs?: number; context?: string },
    ): Promise<string> {
        const maxWaitMs = options?.maxWaitMs ?? WALLET_PROXY_INIT_MAX_WAIT_MS;
        const context = options?.context ?? "sign";
        const startedAt = Date.now();
        let attempt = 1;
        let lastError: unknown = null;

        while (Date.now() - startedAt < maxWaitMs) {
            const elapsedMs = Date.now() - startedAt;
            const remainingMs = Math.max(maxWaitMs - elapsedMs, 0);
            const perAttemptTimeoutMs = Math.max(
                1_000,
                Math.min(WALLET_PROXY_SIGN_ATTEMPT_TIMEOUT_MS, remainingMs),
            );

            try {
                const signatureHex = await this.signRawHashWithTimeout(
                    hashWithPrefix,
                    perAttemptTimeoutMs,
                    context,
                );
                return signatureHex;
            } catch (error) {
                lastError = error;

                if (!this.isWalletProxyNotInitializedError(error)) {
                    throw error;
                }

                const waitedSec = Math.floor((Date.now() - startedAt) / 1000);
                const maxWaitSec = Math.floor(maxWaitMs / 1000);
                console.warn(
                    `PrivyNearSigner: Wallet proxy not initialized (${context} attempt ${attempt}, waited ${waitedSec}s/${maxWaitSec}s). Retrying...`,
                );
                await this.waitForWalletProxyInitialization(attempt);
                attempt += 1;
            }
        }

        if (this.isWalletProxyNotInitializedError(lastError)) {
            const waitedSec = Math.floor(maxWaitMs / 1000);
            throw new Error(
                `Wallet initialization is taking longer than expected (waited ${waitedSec}s). ` +
                "Please wait a bit and try again. If this keeps happening, reconnect your wallet."
            );
        }

        throw lastError instanceof Error
            ? lastError
            : new Error("Failed to sign transaction with Privy wallet");
    }

    async warmupWalletProxy(maxWaitMs = WALLET_PROXY_PREWARM_MAX_WAIT_MS): Promise<void> {
        try {
            // Warm-up with a deterministic dummy hash so the first real tx is less likely to fail.
            await this.signHashWithWalletInitRetry(`0x${"0".repeat(64)}`, {
                maxWaitMs,
                context: "warmup",
            });
            console.log("PrivyNearSigner: wallet proxy warmup complete");
        } catch (error) {
            // Warm-up is best-effort and should not block the app.
            console.warn("PrivyNearSigner: wallet proxy warmup not completed", error);
        }
    }

    async signBytes(message: Uint8Array): Promise<Uint8Array> {
        const hashHex = bytesToHex(message);
        console.log("PrivyNearSigner: signing bytes", hashHex);
        const signatureHex = await this.signHashWithWalletInitRetry(`0x${hashHex}`, {
            context: "tx-sign",
        });

        // Privy returns 64 bytes hex signature (r,s)
        return hexToBytes(signatureHex.replace(/^0x/, ""));
    }
}

/**
 * Adapter to make Privy work with our NearService
 */
export class PrivyNearWallet {
    type = 'privy-near';
    chainType = 'near';
    accountId: string;

    private provider: JsonRpcProvider;
    private signer: PrivyNearSigner;
    private account: Account;

    constructor(
        accountId: string,
        signRawHash: any,
        publicKey?: string
    ) {
        this.accountId = accountId;
        this.provider = new JsonRpcProvider({ url: providerUrl });
        this.signer = new PrivyNearSigner(signRawHash, accountId, this.provider, publicKey);

        // Correctly instantiate Account with (accountId, provider, signer)
        this.account = new Account(accountId, this.provider, this.signer);
    }

    get address() {
        return this.accountId;
    }

    async warmupWalletProxy(): Promise<void> {
        await this.signer.warmupWalletProxy();
    }

    private getErrorMessage(error: unknown): string {
        if (error instanceof Error) return error.message;
        if (typeof error === "string") return error;
        if (error && typeof error === "object" && "message" in error) {
            const maybeMessage = (error as { message?: unknown }).message;
            if (typeof maybeMessage === "string") return maybeMessage;
        }
        return String(error ?? "");
    }

    private isWalletProxyInitializationError(error: unknown): boolean {
        const message = this.getErrorMessage(error).toLowerCase();
        return (
            message.includes("wallet proxy not initialized")
            || message.includes("wallet is still initializing")
            || message.includes("wallet initialization is taking longer")
        );
    }

    private async waitBeforeTxRetry(attempt: number) {
        const delay = TX_SEND_RETRY_DELAY_MS * attempt;
        await new Promise((resolve) => setTimeout(resolve, delay));
    }

    /**
     * Standard NEAR wallet interface method
     */
    async signAndSendTransaction({ receiverId, actions: txActions }: { receiverId: string, actions: any[] }) {
        console.log("PrivyNearWallet: Signing transaction", { receiverId, actions: txActions });

        // Check if account exists on chain
        try {
            await this.account.getState();
        } catch (e: any) {
            if (e.message?.includes('does not exist') || e.code === 'UNKNOWN_ACCOUNT') {
                console.log(`PrivyNearWallet: Account ${this.accountId} not found on-chain. Attempting auto-initialization on Testnet...`);

                try {
                    const publicKey = await this.signer.getPublicKey();
                    const response = await fetch(TESTNET_HELPER_URL, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            newAccountId: this.accountId,
                            newPublicKey: publicKey.toString()
                        })
                    });

                    if (response.ok) {
                        console.log("PrivyNearWallet: Successfully requested account creation via Testnet helper. Waiting a few seconds...");
                        await new Promise(resolve => setTimeout(resolve, 5000));
                    } else {
                        const errorText = await response.text();
                        console.warn("PrivyNearWallet: Testnet helper failed to create account", errorText);
                    }
                } catch (initErr) {
                    console.error("PrivyNearWallet: Failed to auto-initialize account", initErr);
                }

                try {
                    // Helper-created accounts can take a few seconds to become queryable.
                    let initialized = false;
                    for (let i = 0; i < 6; i++) {
                        try {
                            await this.account.getState();
                            initialized = true;
                            break;
                        } catch {
                            await new Promise((resolve) => setTimeout(resolve, 2000));
                        }
                    }

                    if (!initialized) {
                        throw new Error("Account not initialized yet");
                    }
                } catch {
                    throw new Error(
                        `NEAR Account ${this.accountId} is not yet initialized on-chain. ` +
                        `I tried to auto-initialize it via the Testnet helper, but it might have failed or is still processing. ` +
                        `Please visit https://faucet.testnet.near.org/ to fund this address: ${this.accountId}`
                    );
                }
            } else {
                throw e;
            }
        }

        const transformAction = (action: any) => {
            if (action.params && action.params.methodName) {
                return functionCall(
                    action.params.methodName,
                    action.params.args,
                    BigInt(action.params.gas),
                    BigInt(action.params.deposit)
                );
            }
            return action;
        };

        const nearActions = txActions.map(transformAction);

        let lastError: unknown = null;

        for (let attempt = 1; attempt <= TX_SEND_MAX_RETRIES_ON_WALLET_INIT; attempt++) {
            try {
                return await this.account.signAndSendTransaction({
                    receiverId,
                    actions: nearActions
                });
            } catch (error) {
                lastError = error;

                if (!this.isWalletProxyInitializationError(error) || attempt === TX_SEND_MAX_RETRIES_ON_WALLET_INIT) {
                    break;
                }

                console.warn(
                    `PrivyNearWallet: Wallet still initializing during tx sign (attempt ${attempt}/${TX_SEND_MAX_RETRIES_ON_WALLET_INIT}). Retrying...`,
                );
                await this.waitBeforeTxRetry(attempt);
            }
        }

        throw lastError instanceof Error
            ? lastError
            : new Error("Failed to sign and send transaction with Privy wallet");
    }

    async signAndSendTransactions(params: any[]) {
        throw new Error("Batch transactions not implemented for PrivyNearWallet");
    }
}
