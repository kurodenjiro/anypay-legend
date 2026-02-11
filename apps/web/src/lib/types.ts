export interface LiquidityProvider {
    address: string;
    name: string;
    handle: string;
    rating: string;
    supportedPlatforms: string[];
}

export interface Intent {
    id: string; // Unique ID (e.g. from contract event)
    maker: string; // User address
    taker: string; // LP address
    amount: string; // Fiat amount
    currency: string; // "USD", "EUR"
    platform: string; // "Revolut", "Wise"
    tokenAmount: string; // Crypto amount locked
    tokenAddress: string;
    expiry: number; // Timestamp
}

export interface TLSNProof {
    sessionId: string;
    signature: string; // Notary signature
    publicData: {
        timestamp: number;
        amount: string;
        recipientId: string;
    };
    redactedData: string; // The private parts
}

export interface ContractConfig {
    address: `0x${string}`;
    abi: any[]; // We will define minimal ABI
}
