import { setupWalletSelector, type WalletSelector, type AccountState } from "@near-wallet-selector/core";
import { setupMyNearWallet } from "@near-wallet-selector/my-near-wallet";
import { setupModal } from "@near-wallet-selector/modal-ui";
import { keccak256, toBytes, parseUnits } from 'viem';
import { JsonRpcProvider } from 'near-api-js';
import { writable } from 'svelte/store';

// Configuration for NEAR Testnet
const NEAR_CONFIG = {
    network: 'testnet',
    nodeUrl: 'https://rpc.testnet.near.org',
    walletUrl: 'https://wallet.testnet.near.org',
    helperUrl: 'https://helper.testnet.near.org',
    explorerUrl: 'https://explorer.testnet.near.org',
};

// MPC Contract ID (Testnet)
const MPC_CONTRACT_ID = 'v1.signer-prod.testnet';
// Our Contract ID
const CONTRACT_ID = 'anypay-legend-final.testnet';

export const nearStore = writable({
    accountId: null as string | null,
    isConnected: false,
    isLoading: true
});

export class NearService {
    // ... existing properties ...

    async init() {
        if (this.selector) return;
        console.log("NEAR Service: Initializing...");

        try {
            this.selector = await setupWalletSelector({
                network: "testnet",
                modules: [setupMyNearWallet()],
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

        // Listen for sign-in event
        this.selector.store.observable.subscribe((state) => {
            this.updateStore(state.accounts);
        });
    }

    private async updateStore(accounts: Array<any>) {
        if (accounts.length > 0) {
            this.accountId = accounts[0].accountId;
            this.wallet = await this.selector!.wallet();
            nearStore.set({ accountId: this.accountId, isConnected: true, isLoading: false });
        } else {
            this.accountId = null;
            this.wallet = null;
            nearStore.set({ accountId: null, isConnected: false, isLoading: false });
        }
    }
    // ... existing methods ...

    async login() {
        if (!this.modal) await this.init();
        this.modal.show();
    }

    logout() {
        if (!this.wallet) return;
        this.wallet.signOut().then(() => {
            window.location.reload();
        });
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
        if (!this.wallet || !this.accountId) throw new Error("Not signed in");

        return await this.wallet.signAndSendTransaction({
            signerId: this.accountId,
            receiverId: CONTRACT_ID,
            actions: [{
                type: "FunctionCall",
                params: {
                    methodName: "create_deposit",
                    args: {
                        token,
                        amount: parseUnits(amount, 24).toString(),
                        min_intent_amount: parseUnits(minIntentAmount, 24).toString(),
                        max_intent_amount: parseUnits(maxIntentAmount, 24).toString(),
                        payment_methods: paymentMethods,
                        delegate: delegate || null
                    },
                    gas: "30000000000000",
                    deposit: "1000000000000000000000000" // 1 NEAR for storage
                }
            }]
        });
    }

    /**
     * Withdraw from a specific deposit
     */
    async withdrawDeposit(depositId: number) {
        if (!this.wallet || !this.accountId) throw new Error("Not signed in");

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
        depositId: number,
        amount: string,
        paymentMethod: string,
        currencyCode: string,
        recipient: string,
        chain: string
    ) {
        if (!this.wallet || !this.accountId) throw new Error("Not signed in");

        return await this.wallet.signAndSendTransaction({
            signerId: this.accountId,
            receiverId: CONTRACT_ID,
            actions: [{
                type: "FunctionCall",
                params: {
                    methodName: "signal_intent",
                    args: {
                        deposit_id: depositId,
                        amount: parseUnits(amount, 24).toString(),
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
     * Release intent (depositor manually releases funds)
     */
    async releaseIntent(intentHash: string) {
        if (!this.wallet || !this.accountId) throw new Error("Not signed in");

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

    // === VIEW FUNCTIONS ===

    /**
     * Helper for view calls
     */
    private async view(methodName: string, args: any = {}) {
        const provider = new JsonRpcProvider({ url: NEAR_CONFIG.nodeUrl });
        const result = await provider.query({
            request_type: 'call_function',
            account_id: CONTRACT_ID,
            method_name: methodName,
            args_base64: Buffer.from(JSON.stringify(args)).toString('base64'),
            finality: 'final'
        });

        // @ts-ignore
        return JSON.parse(Buffer.from(result.result).toString());
    }

    async getDeposit(depositId: number) {
        return await this.view('get_deposit', { deposit_id: depositId });
    }

    async getAccountDeposits(accountId?: string) {
        const account = accountId || this.accountId;
        if (!account) throw new Error("No account specified");
        return await this.view('get_account_deposits', { account_id: account });
    }

    async getIntent(intentHash: string) {
        return await this.view('get_intent', { intent_hash: intentHash });
    }

    async getAccountIntents(accountId?: string) {
        const account = accountId || this.accountId;
        if (!account) throw new Error("No account specified");
        return await this.view('get_account_intents', { account_id: account });
    }

    async getDepositIntents(depositId: number) {
        return await this.view('get_deposit_intents', { deposit_id: depositId });
    }

    async getPaymentMethod(name: string) {
        return await this.view('get_payment_method', { name });
    }
}

export const nearService = new NearService();
