type SupportedNetworkId = "testnet";

const envNetworkId = process.env.NEXT_PUBLIC_NEAR_NETWORK_ID;
export const NetworkId: SupportedNetworkId = envNetworkId === "testnet" ? "testnet" : "testnet";

const defaultContractPerNetwork: Record<SupportedNetworkId, string> = {
    testnet: "anypay-v2-1770979784.agenttest1.testnet",
};

const defaultRpcPerNetwork: Record<SupportedNetworkId, string> = {
    testnet: "https://test.rpc.fastnear.com",
};

const helperPerNetwork: Record<SupportedNetworkId, string> = {
    testnet: "https://helper.testnet.near.org/account",
};

export const providerUrl =
    process.env.NEXT_PUBLIC_NEAR_RPC_URL || defaultRpcPerNetwork[NetworkId];

export const contractPerNetwork: Record<SupportedNetworkId, string> = {
    testnet: process.env.NEXT_PUBLIC_NEAR_CONTRACT_ID || defaultContractPerNetwork.testnet,
};

export const HelloNearContract = contractPerNetwork[NetworkId];
export const helperUrl = helperPerNetwork[NetworkId];
