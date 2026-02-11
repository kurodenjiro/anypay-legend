import { createWalletClient, custom, parseEther, parseUnits, type WalletClient } from 'viem';
import { base, baseSepolia } from 'viem/chains';

const USDC_ADDRESS = '0x036CbD53842c5426634e7929541eC2318f3dCF7e'; // Base Sepolia USDC

// Contract addresses
const ESCROW_ADDRESS = '0x6a5e11c3D87e22b828d02ee65a4e8f322BF6B97E'; // For sellers to create deposits
const ORCHESTRATOR_ADDRESS = '0x7D563c65456deF11c1Fdb9510eB745D5a780F5Fd'; // For buyers to signal intents

const ERC20_ABI = [
    {
        name: 'approve',
        type: 'function',
        stateMutability: 'nonpayable',
        inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }],
        outputs: [{ name: 'success', type: 'bool' }]
    }
] as const;

// Escrow ABI - for sellers
const ESCROW_ABI = [
    {
        name: 'createDeposit',
        type: 'function',
        stateMutability: 'nonpayable',
        inputs: [{
            name: '_params',
            type: 'tuple',
            components: [
                { name: 'token', type: 'address' },
                { name: 'amount', type: 'uint256' },
                {
                    name: 'intentAmountRange',
                    type: 'tuple',
                    components: [
                        { name: 'min', type: 'uint256' },
                        { name: 'max', type: 'uint256' }
                    ]
                },
                { name: 'paymentMethods', type: 'bytes32[]' },
                {
                    name: 'paymentMethodData',
                    type: 'tuple[]',
                    components: [
                        { name: 'intentGatingService', type: 'address' },
                        { name: 'payeeDetails', type: 'bytes32' },
                        { name: 'data', type: 'bytes' }
                    ]
                },
                {
                    name: 'currencies',
                    type: 'tuple[][]',
                    components: [
                        { name: 'code', type: 'bytes32' },
                        { name: 'minConversionRate', type: 'uint256' }
                    ]
                },
                { name: 'delegate', type: 'address' },
                { name: 'intentGuardian', type: 'address' },
                { name: 'retainOnEmpty', type: 'bool' }
            ]
        }],
        outputs: []
    },
    {
        name: 'getAccountDeposits',
        type: 'function',
        stateMutability: 'view',
        inputs: [{ name: '_account', type: 'address' }],
        outputs: [{ name: '', type: 'uint256[]' }]
    }
] as const;

// Orchestrator ABI - for buyers
const ORCHESTRATOR_ABI = [
    {
        name: 'signalIntent',
        type: 'function',
        stateMutability: 'nonpayable',
        inputs: [{
            name: '_params',
            type: 'tuple',
            components: [
                { name: 'escrow', type: 'address' },
                { name: 'depositId', type: 'uint256' },
                { name: 'amount', type: 'uint256' },
                { name: 'to', type: 'address' },
                { name: 'paymentMethod', type: 'bytes32' },
                { name: 'fiatCurrency', type: 'bytes32' },
                { name: 'conversionRate', type: 'uint256' },
                { name: 'referrer', type: 'address' },
                { name: 'referrerFee', type: 'uint256' },
                { name: 'gatingServiceSignature', type: 'bytes' },
                { name: 'signatureExpiration', type: 'uint256' },
                { name: 'postIntentHook', type: 'address' },
                { name: 'data', type: 'bytes' }
            ]
        }],
        outputs: []
    },
    {
        name: 'verifyProof',
        type: 'function',
        stateMutability: 'nonpayable',
        inputs: [
            { name: 'intentId', type: 'bytes32' },
            { name: 'proof', type: 'bytes' }
        ],
        outputs: []
    },
    {
        name: 'fulfillIntent',
        type: 'function',
        stateMutability: 'nonpayable',
        inputs: [
            {
                name: 'params', type: 'tuple', components: [
                    { name: 'intentHash', type: 'bytes32' },
                    { name: 'proof', type: 'bytes' },
                    { name: 'postIntentHookData', type: 'bytes' }
                ]
            }
        ],
        outputs: []
    },
    {
        name: 'intents',
        type: 'function',
        stateMutability: 'view',
        inputs: [{ name: 'intentHash', type: 'bytes32' }],
        outputs: [
            { name: 'escrow', type: 'address' },
            { name: 'depositId', type: 'uint256' },
            { name: 'paymentMethod', type: 'bytes32' },
            { name: 'from', type: 'address' },
            { name: 'to', type: 'address' },
            { name: 'amount', type: 'uint256' },
            { name: 'fiatCurrency', type: 'bytes32' },
            { name: 'conversionRate', type: 'uint256' },
            { name: 'timestamp', type: 'uint256' },
            { name: 'intentTimestamp', type: 'uint256' },
            { name: 'referrerFee', type: 'uint256' },
            { name: 'postIntentHook', type: 'address' },
            { name: 'data', type: 'bytes' }
        ]
    },
    {
        name: 'getAccountIntents',
        type: 'function',
        stateMutability: 'view',
        inputs: [{ name: 'account', type: 'address' }],
        outputs: [{ name: '', type: 'bytes32[]' }]
    },
    {
        name: 'intentCounter',
        type: 'function',
        stateMutability: 'view',
        inputs: [],
        outputs: [{ name: '', type: 'uint256' }]
    },
    {
        name: 'getBestProvider',
        type: 'function',
        stateMutability: 'view',
        inputs: [
            { name: 'platform', type: 'string' },
            { name: 'amount', type: 'uint256' }
        ],
        outputs: [
            {
                name: 'providerParams', type: 'tuple', components: [
                    { name: 'addr', type: 'address' },
                    { name: 'name', type: 'string' },
                    { name: 'handle', type: 'string' },
                    { name: 'rating', type: 'uint8' }
                ]
            }
        ]
    },
    // Events
    {
        anonymous: false,
        inputs: [
            { indexed: true, name: 'depositId', type: 'uint256' },
            { indexed: true, name: 'depositor', type: 'address' },
            { indexed: false, name: 'token', type: 'address' },
            { indexed: false, name: 'amount', type: 'uint256' }
        ],
        name: 'DepositReceived',
        type: 'event'
    },
    {
        anonymous: false,
        inputs: [
            { indexed: true, name: 'intentHash', type: 'bytes32' },
            { indexed: true, name: 'to', type: 'address' },
            { indexed: false, name: 'amount', type: 'uint256' },
            { indexed: false, name: 'fee', type: 'uint256' }
        ],
        name: 'IntentFulfilled',
        type: 'event'
    }
] as const;

const CONTRACT_ADDRESS = "0x6a5e11c3D87e22b828d02ee65a4e8f322BF6B97E"; // Base Sepolia Escrow

export class ContractService {
    private wallet: WalletClient | null = null;
    private publicClient: any = null; // Ideally use public client for reads

    constructor() {
        if (typeof window !== 'undefined' && window.ethereum) {
            this.wallet = createWalletClient({
                chain: baseSepolia, // Force Testnet
                transport: custom(window.ethereum)
            });
        }
    }

    setWalletClient(client: WalletClient) {
        this.wallet = client;
    }

    async ensureNetwork() {
        if (!this.wallet) return;
        const chainId = await this.wallet.getChainId();
        if (chainId !== baseSepolia.id) {
            console.log(`Wrong chain (${chainId}), switching to Base Sepolia (${baseSepolia.id})...`);
            try {
                await this.wallet.switchChain({ id: baseSepolia.id });
            } catch (e: any) {
                console.log("Switch chain failed, attempting to add chain...", e);
                // If chain is missing, add it
                await this.wallet.request({
                    method: 'wallet_addEthereumChain',
                    params: [{
                        chainId: `0x${baseSepolia.id.toString(16)}`,
                        chainName: 'Base Sepolia',
                        nativeCurrency: {
                            name: 'Ether',
                            symbol: 'ETH',
                            decimals: 18
                        },
                        rpcUrls: ['https://sepolia.base.org'],
                        blockExplorerUrls: ['https://sepolia.basescan.org']
                    }]
                });
            }
        }
    }

    // For SELLERS: Create a deposit in the Escrow contract
    async createDeposit(amount: string, platform: string, currency: string, recipientId: string, tokenSymbol: string = 'ETH') {
        if (!this.wallet) throw new Error("Wallet not connected");

        await this.ensureNetwork();

        const [account] = await this.wallet.getAddresses();

        // Helper function to convert string to bytes32
        const stringToBytes32 = (str: string): `0x${string}` => {
            const encoder = new TextEncoder();
            const bytes = encoder.encode(str);
            const hex = Array.from(bytes)
                .map(b => b.toString(16).padStart(2, '0'))
                .join('');
            return ('0x' + hex.padEnd(64, '0')) as `0x${string}`;
        };

        let parsedAmount = 0n;
        let tokenAddress: `0x${string}`;

        // Ensure amount is a string
        const amountStr = String(amount);

        // Handle ETH vs USDC
        if (tokenSymbol === 'USDC') {
            parsedAmount = parseUnits(amountStr, 6);
            tokenAddress = USDC_ADDRESS;

            // Approve Escrow to spend USDC
            console.log("Approving USDC for Escrow...");
            await (this.wallet as any).writeContract({
                address: USDC_ADDRESS,
                abi: ERC20_ABI,
                functionName: 'approve',
                args: [ESCROW_ADDRESS, parsedAmount],
                account
            });
            console.log("USDC Approved.");
        } else {
            parsedAmount = parseEther(amountStr);
            tokenAddress = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE' as `0x${string}`; // ETH placeholder
        }

        // Convert strings to bytes32
        const platformBytes32 = stringToBytes32(platform);
        const currencyBytes32 = stringToBytes32(currency);
        const recipientIdBytes32 = stringToBytes32(recipientId);

        // Create deposit params
        const minAmount = parseUnits('10', tokenSymbol === 'USDC' ? 6 : 18);
        const depositParams = {
            token: tokenAddress,
            amount: parsedAmount,
            intentAmountRange: {
                min: parsedAmount < minAmount ? parsedAmount : minAmount, // Min is smaller of 10 or actual amount
                max: parsedAmount // Max is the full amount
            },
            paymentMethods: [platformBytes32],
            paymentMethodData: [{
                intentGatingService: '0x0000000000000000000000000000000000000000' as `0x${string}`, // No gating
                payeeDetails: recipientIdBytes32,
                data: '0x' as `0x${string}` // No additional data
            }],
            currencies: [[{
                code: currencyBytes32,
                minConversionRate: parseEther('1') // 1:1 conversion rate
            }]],
            delegate: '0x0000000000000000000000000000000000000000' as `0x${string}`, // No delegate
            intentGuardian: '0x0000000000000000000000000000000000000000' as `0x${string}`, // No guardian
            retainOnEmpty: false
        };

        console.log("Creating deposit with params:", depositParams);

        // Call createDeposit on Escrow contract
        const hash = await (this.wallet as any).writeContract({
            address: ESCROW_ADDRESS,
            abi: ESCROW_ABI,
            functionName: 'createDeposit',
            args: [depositParams],
            account,
            value: tokenSymbol === 'ETH' ? parsedAmount : 0n // Send ETH if depositing ETH
        });

        return hash;
    }

    async verifyProof(intentId: `0x${string}`, proof: any) {
        if (!this.wallet) throw new Error("Wallet not connected");
        const [account] = await this.wallet.getAddresses();

        // PROCESSING LOGIC (On-Chain):
        // 1. Recover Signer: The contract recovers the Notary Public Key from the proof signature.
        // 2. Validate Session: Checks if the Notary is trusted.
        // 3. Extract 'Date': The contract parses the revealed 'Date' header bytes.
        // 4. Time Check: 
        //    require(proof.date >= intent.timestamp, "Payment too early");
        //    require(proof.date <= intent.timestamp + 15 minutes, "Payment too late");

        // This ensures the user physically could not have made the payment before 
        // the commitment (intent.timestamp) existed on-chain.

        const hash = await (this.wallet as any).writeContract({
            address: CONTRACT_ADDRESS,
            abi: ABI,
            functionName: 'verifyProof',
            args: [intentId, proof.hex || "0x"],
            account
        });

        return hash;
    }

    /**
     * Fetch all available sell orders from the contract
     */
    async getAvailableOrders(platform: string, currency: string, minAmount: bigint = 0n) {
        // For now, return mock orders until we have proper indexing
        // TODO: Implement proper intent fetching when contract supports event indexing
        return this.getMockAvailableOrders(platform, currency, minAmount);
    }

    /**
     * Mock function to return available orders
     */
    private getMockAvailableOrders(platform: string, currency: string, minAmount: bigint) {
        const mockOrders = [
            {
                intentHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef' as `0x${string}`,
                seller: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb' as `0x${string}`,
                sellerName: 'Alice',
                amount: parseEther('1.5'),
                platform: 'Venmo',
                currency: 'USD',
                rate: 1.0,
                timestamp: Math.floor(Date.now() / 1000) - 3600
            },
            {
                intentHash: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890' as `0x${string}`,
                seller: '0x8626f6940E2eb28930eFb4CeF49B2d1F2C9C1199' as `0x${string}`,
                sellerName: 'Bob',
                amount: parseEther('0.5'),
                platform: 'Venmo',
                currency: 'USD',
                rate: 1.0,
                timestamp: Math.floor(Date.now() / 1000) - 7200
            },
            {
                intentHash: '0x9876543210fedcba9876543210fedcba9876543210fedcba9876543210fedcba' as `0x${string}`,
                seller: '0xdD2FD4581271e230360230F9337D5c0430Bf44C0' as `0x${string}`,
                sellerName: 'Charlie',
                amount: parseEther('2.0'),
                platform: 'Revolut',
                currency: 'EUR',
                rate: 0.95,
                timestamp: Math.floor(Date.now() / 1000) - 86400
            }
        ];

        return mockOrders.filter(order =>
            order.platform.toLowerCase() === platform.toLowerCase() &&
            order.currency.toUpperCase() === currency.toUpperCase() &&
            order.amount >= minAmount
        );
    }

    /**
     * Match buyer with best available seller
     */
    async matchBuyerWithSeller(amount: bigint, platform: string, currency: string) {
        const availableOrders = await this.getAvailableOrders(platform, currency, amount);

        if (availableOrders.length === 0) {
            return null;
        }

        // Find best match (closest amount, most recent)
        const bestMatch = availableOrders
            .filter(order => order.amount >= amount)
            .sort((a, b) => {
                const diffA = Number(a.amount - amount);
                const diffB = Number(b.amount - amount);
                if (diffA !== diffB) return diffA - diffB;
                return b.timestamp - a.timestamp;
            })[0];

        return bestMatch || availableOrders[0];
    }

    /**
     * Fulfill an intent by providing payment proof (called by buyer)
     */
    async fulfillIntent(intentHash: `0x${string}`, proof: any) {
        if (!this.wallet) throw new Error("Wallet not connected");
        const [account] = await this.wallet.getAddresses();

        const hash = await (this.wallet as any).writeContract({
            address: CONTRACT_ADDRESS,
            abi: ABI,
            functionName: 'fulfillIntent',
            args: [{
                intentHash,
                proof: proof || '0x',
                postIntentHookData: '0x'
            }],
            account
        });

        return hash;
    }

    // New: Fetch LP from the smart contract registry
    async getBestLP(platform: string, amount: string): Promise<any> {
        if (!this.wallet) return null; // Need wallet or public client

        // This is the real call to the blockchain
        try {
            const result: any = await (this.wallet as any).readContract({
                address: CONTRACT_ADDRESS,
                abi: ABI,
                functionName: 'getBestProvider',
                args: [platform, parseEther(amount)]
            });

            // Transform contract result [address, name, handle, rating] to our app format
            return {
                address: result[0],
                name: result[1],
                handle: result[2],
                rating: result[3].toString() + "/5",
                referenceId: "ZK-" + Date.now().toString().slice(-4)
            };
        } catch (e) {
            console.warn("Contract read failed (expected if contract not deployed):", e);
            // Return null so the UI can handle "No Match Found" or "Network Error"
            return null;
        }
    }

    // --- INTEGRATION TEST HELPER ---
    async runIntegrationTest(): Promise<void> {
        if (!this.wallet) {
            console.error("Wallet not connected");
            alert("Please connect wallet first");
            return;
        }

        const { CONTRACT_TEST_DATA } = await import('$lib/data/contract_test_data');
        console.group("🚀 Running Smart Contract Integration Test");

        try {
            // Step 1: Read (Get Best LP)
            console.log("1. Testing getBestLP...");
            const lp = await this.getBestLP(CONTRACT_TEST_DATA.signal.platform, CONTRACT_TEST_DATA.signal.amount);
            console.log("   Result:", lp || "No LP Found (Expected on empty contract)");

            // Step 2: Write (Signal Intent)
            console.log("2. Testing signalIntent (Requires Wallet Signature)...");
            const intentId = await this.signalIntent(
                CONTRACT_TEST_DATA.signal.amount,
                CONTRACT_TEST_DATA.signal.platform,
                CONTRACT_TEST_DATA.signal.currency,
                "test-recipient-id"
            );
            console.log("   ✅ Intent Id (Tx Hash):", intentId);

            // Step 3: Write (Verify Proof)
            console.log("3. Testing verifyProof (Requires Wallet Signature)...");
            // Use the intentId from step 2
            const verifyHash = await this.verifyProof(intentId as `0x${string}`, CONTRACT_TEST_DATA.proof);
            console.log("   ✅ Verification Tx:", verifyHash);

            alert("Integration Test Complete! Check Console for hashes.");

        } catch (e) {
            console.error("❌ Integration Test Failed:", e);
            alert("Test Failed: " + (e as any).message);
        } finally {
            console.groupEnd();
        }
    }
    async getHistory(userAddress: string) {
        if (!this.wallet) return [];

        try {
            // 1. Get Orchestrator Address from Escrow
            const orchestratorAddress = await (this.wallet as any).readContract({
                address: CONTRACT_ADDRESS,
                abi: [{
                    name: 'orchestrator',
                    type: 'function',
                    stateMutability: 'view',
                    inputs: [],
                    outputs: [{ name: '', type: 'address' }]
                }],
                functionName: 'orchestrator',
            }) as `0x${string}`;

            // 2. Get Intent Hashes for User
            const intentHashes = await (this.wallet as any).readContract({
                address: orchestratorAddress,
                abi: [{
                    name: 'getAccountIntents',
                    type: 'function',
                    stateMutability: 'view',
                    inputs: [{ name: 'account', type: 'address' }],
                    outputs: [{ name: '', type: 'bytes32[]' }]
                }],
                functionName: 'getAccountIntents',
                args: [userAddress]
            }) as `0x${string}`[];

            if (!intentHashes || intentHashes.length === 0) return [];

            // 3. Fetch details for each intent
            const history = await Promise.all(intentHashes.map(async (hash) => {
                const intent: any = await (this.wallet as any).readContract({
                    address: orchestratorAddress,
                    abi: [{
                        name: 'getIntent',
                        type: 'function',
                        stateMutability: 'view',
                        inputs: [{ name: 'intentHash', type: 'bytes32' }],
                        outputs: [{
                            name: '',
                            type: 'tuple',
                            components: [
                                { name: 'owner', type: 'address' },
                                { name: 'to', type: 'address' },
                                { name: 'escrow', type: 'address' },
                                { name: 'depositId', type: 'uint256' },
                                { name: 'amount', type: 'uint256' },
                                { name: 'timestamp', type: 'uint256' },
                                { name: 'paymentMethod', type: 'bytes32' },
                                { name: 'fiatCurrency', type: 'bytes32' },
                                { name: 'conversionRate', type: 'uint256' },
                            ]
                        }]
                    }],
                    functionName: 'getIntent',
                    args: [hash]
                });

                return {
                    hash,
                    amount: intent.amount,
                    timestamp: Number(intent.timestamp),
                    currency: intent.fiatCurrency, // Needs decoding if it's bytes32
                    status: 'Signaled' // Default for now
                };
            }));

            return history.sort((a, b) => b.timestamp - a.timestamp);

        } catch (e) {
            console.error("Error fetching history:", e);
            return [];
        }
    }

    async getDashboardStats() {
        if (typeof window === 'undefined') return { tvl: "0.00", stakers: [], volume: "0.00", trades: [] };

        try {
            // 1. Fetch Deposit Counter
            let depositCount = 0n;
            try {
                if (this.wallet) {
                    depositCount = await (this.wallet as any).readContract({
                        address: CONTRACT_ADDRESS,
                        abi: [{ name: 'depositCounter', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] }],
                        functionName: 'depositCounter'
                    }) as bigint;
                }
            } catch (e) { console.warn("Could not read depositCounter", e) }

            const stakers: any[] = [];
            let tvl = 0;

            if (depositCount && Number(depositCount) > 0) {
                // Fetch last 5 deposits
                for (let i = Number(depositCount) - 1; i >= Math.max(0, Number(depositCount) - 5); i--) {
                    try {
                        const deposit: any = await (this.wallet as any)?.readContract({
                            address: CONTRACT_ADDRESS,
                            abi: [{
                                name: 'deposits',
                                type: 'function',
                                stateMutability: 'view',
                                inputs: [{ name: '', type: 'uint256' }],
                                outputs: [
                                    { name: 'depositor', type: 'address' },
                                    { name: 'delegate', type: 'address' },
                                    { name: 'token', type: 'address' },
                                    { name: 'amount', type: 'uint256' },
                                    { name: 'intentAmountRange', type: 'tuple', components: [{ name: 'min', type: 'uint256' }, { name: 'max', type: 'uint256' }] },
                                    { name: 'acceptingIntents', type: 'bool' },
                                    { name: 'remainingDeposits', type: 'uint256' },
                                    { name: 'outstandingIntentAmount', type: 'uint256' },
                                    { name: 'intentGuardian', type: 'address' },
                                    { name: 'retainOnEmpty', type: 'bool' }
                                ]
                            }],
                            functionName: 'deposits',
                            args: [BigInt(i)]
                        });

                        // Check if deposit is valid (non-zero depositor)
                        if (deposit && deposit.depositor !== '0x0000000000000000000000000000000000000000') {
                            // Format Remaining Amount
                            const remainingVal = Number(deposit.remainingDeposits);
                            const remainingFormatted = (remainingVal / 1e18).toFixed(4);

                            stakers.push({
                                address: deposit.depositor,
                                remaining: remainingFormatted,
                                score: 100 // placeholder
                            });
                            tvl += remainingVal;
                        }
                    } catch (e) {
                        console.warn("Failed to fetch deposit " + i, e);
                    }
                }
            }

            return {
                tvl: (tvl / 1e18).toFixed(2),
                stakers: stakers,
                volume: "0.00",
                trades: []
            };

        } catch (e) {
            console.error("Failed to fetch dashboard stats:", e);
            return { tvl: "0.00", stakers: [], volume: "0.00", trades: [] };
        }
    }
}

export const contractService = new ContractService();
