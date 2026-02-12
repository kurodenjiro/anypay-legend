export const CONTRACTS = {
    BASE_SEPOLIA: {
        SIMPLE_ATTESTATION_VERIFIER: "0xcCf663c7938a387dC8Df10E632Bf41b359595Bf0",
        ESCROW: "0x6a5e11c3D87e22b828d02ee65a4e8f322BF6B97E",
        USDC: "0x48aB9BCF2B25a696ea950E95c2EACFE0Ec8A6DE1",
        WITNESS: "0x03fBbA1b1A455d028b074D9abC2b23d3EF786943",
        CHAIN_ID: 84532,
        RPC_URL: "https://sepolia.base.org"
    }
};

export const ABI = {
    ESCROW: [
        "function deposit(bytes32 _intentHash) external",
        "function release(bytes32 _intentHash) external",
        "function getDeposit(bytes32 _intentHash) external view returns (tuple(address depositor, uint256 amount, address token))"
    ],
    USDC: [
        "function approve(address spender, uint256 amount) external returns (bool)",
        "function allowance(address owner, address spender) external view returns (uint256)",
        "function balanceOf(address account) external view returns (uint256)",
        "function mint(address to, uint256 amount) external"
    ]
};
