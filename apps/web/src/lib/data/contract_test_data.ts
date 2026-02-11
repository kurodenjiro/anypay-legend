export const CONTRACT_TEST_DATA = {
    // 1. Signal Intent Data
    signal: {
        amount: "0.001", // Small amount for testing
        platform: "Wise",
        currency: "USD"
    },

    // 2. Mock Proof Data (simulating TLSN output)
    proof: {
        hex: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef", // 32-byte mock proof
        notaryUrl: "http://localhost:3000",
        session: {
            header: {
                date: new Date().toUTCString()
            }
        }
    },

    // 3. Expected LP (if one existed)
    lp: {
        address: "0x1234567890123456789012345678901234567890",
        name: "Test Provider",
        handle: "test_user_123"
    }
};
