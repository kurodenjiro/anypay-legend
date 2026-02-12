#!/usr/bin/env node

const fs = require("fs");
const os = require("os");
const path = require("path");
const { connect, keyStores, providers, KeyPair } = require("near-api-js");

function parseEnvFile(filePath) {
    if (!fs.existsSync(filePath)) {
        return {};
    }

    const parsed = {};
    const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) {
            continue;
        }

        const separator = trimmed.indexOf("=");
        if (separator <= 0) {
            continue;
        }

        const rawKey = trimmed.slice(0, separator).trim();
        let rawValue = trimmed.slice(separator + 1).trim();
        const key = rawKey.replace(/^export\s+/, "");

        if (
            (rawValue.startsWith("\"") && rawValue.endsWith("\""))
            || (rawValue.startsWith("'") && rawValue.endsWith("'"))
        ) {
            rawValue = rawValue.slice(1, -1);
        }

        if (key) {
            parsed[key] = rawValue;
        }
    }

    return parsed;
}

const ENV_FALLBACKS = {
    ...parseEnvFile(path.join(__dirname, "..", "..", "apps", "web-next", ".env.local")),
    ...parseEnvFile(path.join(__dirname, "relayer", ".env")),
    ...parseEnvFile(path.join(__dirname, ".env")),
};

function resolveEnv(key, fallback = "") {
    const runtimeValue = process.env[key];
    if (typeof runtimeValue === "string" && runtimeValue.length > 0) {
        return runtimeValue;
    }

    const fileValue = ENV_FALLBACKS[key];
    if (typeof fileValue === "string" && fileValue.length > 0) {
        return fileValue;
    }

    return fallback;
}

const NETWORK_ID = resolveEnv("NETWORK_ID", "testnet");
const RPC_URL = resolveEnv("RPC_URL", "https://test.rpc.fastnear.com");
const RPC_URLS = (
    resolveEnv("RPC_URLS")
    || [RPC_URL, "https://rpc.testnet.near.org"].join(",")
)
    .split(",")
    .map((url) => url.trim())
    .filter(Boolean);
const CONTRACT_ID = resolveEnv("CONTRACT_ID", resolveEnv("NEXT_PUBLIC_NEAR_CONTRACT_ID", "anypay-legend-final.testnet"));
const TEST_ACCOUNT_ID = resolveEnv("TEST_ACCOUNT_ID", resolveEnv("OWNER_ID", resolveEnv("ORACLE_ACCOUNT_ID", "")));
const TEST_PRIVATE_KEY = resolveEnv("TEST_PRIVATE_KEY", resolveEnv("OWNER_PRIVATE_KEY", resolveEnv("ORACLE_PRIVATE_KEY", "")));
const RUN_WRITE_TESTS = resolveEnv("RUN_WRITE_TESTS") === "true";

const GAS = "30000000000000";
// Keep payable-call deposits minimal for test sustainability.
const STORAGE_DEPOSIT = "1"; // 1 yoctoNEAR
const INTENT_DEPOSIT = "1"; // 1 yoctoNEAR

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

function decodeSuccessValue(status) {
    const encoded = status?.SuccessValue ?? status?.successValue ?? null;
    if (!encoded) return null;

    const raw = Buffer.from(encoded, "base64").toString();
    if (raw.length === 0) return null;

    try {
        return JSON.parse(raw);
    } catch {
        if (/^\d+$/.test(raw)) return Number(raw);
        return raw;
    }
}

async function viewCall(provider, methodName, args = {}) {
    const result = await provider.query({
        request_type: "call_function",
        account_id: CONTRACT_ID,
        method_name: methodName,
        args_base64: Buffer.from(JSON.stringify(args)).toString("base64"),
        finality: "final",
    });

    return JSON.parse(Buffer.from(result.result).toString());
}

async function waitForViewValue(provider, methodName, args = {}, retries = 6, delayMs = 1200) {
    let lastValue = null;

    for (let i = 0; i < retries; i++) {
        const value = await viewCall(provider, methodName, args);
        lastValue = value;
        if (value !== null && value !== undefined) {
            return value;
        }
        await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    return lastValue;
}

async function waitForIntentStatus(provider, intentHash, targetStatus, retries = 8, delayMs = 1200) {
    let latest = null;

    for (let i = 0; i < retries; i++) {
        latest = await viewCall(provider, "get_intent", { intent_hash: intentHash });
        if (latest?.status === targetStatus) {
            return latest;
        }
        await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    return latest;
}

async function waitForFundingStarted(provider, depositId, retries = 8, delayMs = 1200) {
    let latest = null;
    for (let i = 0; i < retries; i++) {
        latest = await viewCall(provider, "get_deposit_funding_v2", { deposit_id: depositId });
        if (Number(latest?.funding_started_at_ms || 0) > 0) {
            return latest;
        }
        await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    return latest;
}

function toDepositId(value) {
    const parsed = typeof value === "string" ? Number(value) : value;
    if (!Number.isFinite(parsed)) return null;
    return Number(parsed);
}

function canReuseFundingMeta(meta, nowMs) {
    if (!meta || meta.status !== "AwaitingFunding") return false;

    const deadlineMs = Number(meta.topup_deadline_at_ms || 0);
    if (deadlineMs > 0 && deadlineMs <= nowMs + 30_000) {
        return false;
    }

    const quoteGeneration = Number(meta.quote_generation || 0);
    if (quoteGeneration >= 47) {
        return false;
    }

    return true;
}

async function findReusableV2Deposit(provider, accountId, assetId) {
    const accountDeposits = await viewCall(provider, "get_account_deposits", {
        account_id: accountId,
    });

    if (!Array.isArray(accountDeposits) || accountDeposits.length === 0) {
        return null;
    }

    const nowMs = Date.now();
    for (let i = accountDeposits.length - 1; i >= 0; i--) {
        const depositId = toDepositId(accountDeposits[i]);
        if (!depositId || depositId <= 0) {
            continue;
        }

        let funding = null;
        try {
            funding = await viewCall(provider, "get_deposit_funding_v2", { deposit_id: depositId });
        } catch {
            continue;
        }

        if (assetId && funding?.asset_id !== assetId) {
            continue;
        }

        if (!canReuseFundingMeta(funding, nowMs)) {
            continue;
        }

        return { depositId, funding };
    }

    return null;
}

async function main() {
    console.log("=== NEAR Testnet Integration Test ===");
    console.log("Network:", NETWORK_ID);
    console.log("RPCs:", RPC_URLS.join(", "));
    console.log("Contract:", CONTRACT_ID);
    console.log("Write tests:", RUN_WRITE_TESTS ? "enabled" : "disabled");
    if (RUN_WRITE_TESTS) {
        console.log(
            "Signer source:",
            TEST_PRIVATE_KEY ? "TEST_PRIVATE_KEY env" : "~/.near-credentials",
        );
    }

    const rpcProviders = RPC_URLS.map((url) => new providers.JsonRpcProvider({ url }));
    const provider =
        rpcProviders.length === 1
            ? rpcProviders[0]
            : new providers.FailoverRpcProvider(rpcProviders);

    // 1) Connectivity + contract availability
    const ownerId = await viewCall(provider, "get_owner");
    assert(typeof ownerId === "string" && ownerId.length > 0, "get_owner returned invalid owner");
    console.log("✓ get_owner:", ownerId);

    const wise = await viewCall(provider, "get_payment_method", { name: "wise" });
    if (wise) {
        console.log("✓ get_payment_method(wise): found");
    } else {
        console.log("• get_payment_method(wise): not found");
    }

    const v2Config = await viewCall(provider, "get_v2_config");
    assert(v2Config?.oracle_account_id, "get_v2_config returned invalid oracle account");
    console.log("✓ get_v2_config oracle:", v2Config.oracle_account_id);
    const v2StorageFeeYocto = String(
        v2Config?.storage_fee_yocto || "50000000000000000000000",
    );

    if (!RUN_WRITE_TESTS) {
        console.log("✓ View-only integration checks passed");
        return;
    }

    assert(TEST_ACCOUNT_ID, "TEST_ACCOUNT_ID (or OWNER_ID) is required when RUN_WRITE_TESTS=true");

    // 2) Writable flow against deployed contract
    const keyStore = TEST_PRIVATE_KEY
        ? new keyStores.InMemoryKeyStore()
        : new keyStores.UnencryptedFileSystemKeyStore(
              path.join(os.homedir(), ".near-credentials"),
          );

    if (TEST_PRIVATE_KEY) {
        const keyPair = KeyPair.fromString(TEST_PRIVATE_KEY);
        await keyStore.setKey(NETWORK_ID, TEST_ACCOUNT_ID, keyPair);
    }

    const near = await connect({
        networkId: NETWORK_ID,
        keyStore,
        nodeUrl: RPC_URLS[0],
        walletUrl: `https://wallet.${NETWORK_ID}.near.org`,
        helperUrl: `https://helper.${NETWORK_ID}.near.org`,
    });

    const account = await near.account(TEST_ACCOUNT_ID);
    await account.state();
    console.log("✓ signer account loaded:", TEST_ACCOUNT_ID);

    const amount = "100000000000000000000000"; // 0.1 (24 decimals)
    const minAmount = "10000000000000000000000"; // 0.01
    const paymentMethod = `automation-${Date.now()}`;
    const v2AssetId = "asset:btc:testnet";

    console.log("→ create_deposit...");
    const createOutcome = await account.functionCall({
        contractId: CONTRACT_ID,
        methodName: "create_deposit",
        args: {
            token: "usdc.testnet",
            amount,
            min_intent_amount: minAmount,
            max_intent_amount: amount,
            payment_methods: [paymentMethod],
            delegate: null,
        },
        gas: GAS,
        attachedDeposit: STORAGE_DEPOSIT,
    });

    let depositId = decodeSuccessValue(createOutcome.status);
    if (typeof depositId !== "number") {
        const accountDeposits = await viewCall(provider, "get_account_deposits", {
            account_id: TEST_ACCOUNT_ID,
        });
        assert(Array.isArray(accountDeposits) && accountDeposits.length > 0, "Could not resolve created deposit id");
        const latest = accountDeposits[accountDeposits.length - 1];
        depositId = typeof latest === "string" ? Number(latest) : latest;
    }
    assert(Number.isFinite(depositId), "Invalid deposit id");
    console.log("✓ create_deposit deposit_id:", depositId);

    console.log("→ signal_intent...");
    const signalOutcome = await account.functionCall({
        contractId: CONTRACT_ID,
        methodName: "signal_intent",
        args: {
            deposit_id: depositId,
            amount: minAmount,
            payment_method: paymentMethod,
            currency_code: "USD",
            recipient: "tb1qautomationtestrecipient",
            chain: "BTC",
        },
        gas: GAS,
        attachedDeposit: INTENT_DEPOSIT,
    });

    let intentHash = decodeSuccessValue(signalOutcome.status);
    if (typeof intentHash !== "string") {
        const depositIntents = await viewCall(provider, "get_deposit_intents", { deposit_id: depositId });
        assert(Array.isArray(depositIntents) && depositIntents.length > 0, "Could not resolve created intent hash");
        intentHash = depositIntents[depositIntents.length - 1];
    }
    assert(typeof intentHash === "string" && intentHash.length > 0, "Invalid intent hash");
    console.log("✓ signal_intent intent_hash:", intentHash);

    const signaledIntent = await waitForViewValue(provider, "get_intent", { intent_hash: intentHash });
    assert(signaledIntent?.status === "Signaled", "Intent should be Signaled");
    console.log("✓ get_intent status after signal:", signaledIntent.status);

    console.log("→ cancel_intent...");
    await account.functionCall({
        contractId: CONTRACT_ID,
        methodName: "cancel_intent",
        args: { intent_hash: intentHash },
        gas: GAS,
    });

    const cancelledIntent = await waitForIntentStatus(provider, intentHash, "Cancelled");
    assert(cancelledIntent?.status === "Cancelled", "Intent should be Cancelled");
    console.log("✓ get_intent status after cancel:", cancelledIntent.status);

    let v2DepositId = null;
    const reusableV2 = await findReusableV2Deposit(provider, TEST_ACCOUNT_ID, v2AssetId);
    if (reusableV2) {
        v2DepositId = reusableV2.depositId;
        console.log("• Reusing existing V2 deposit intent:", v2DepositId);
    } else {
        console.log("→ register_deposit_intent_v2...");
        let registerOutcome;
        try {
            registerOutcome = await account.functionCall({
                contractId: CONTRACT_ID,
                methodName: "register_deposit_intent_v2",
                args: {
                    asset_id: v2AssetId,
                    expected_amount: amount,
                    min_intent_amount: minAmount,
                    max_intent_amount: amount,
                    payment_methods: [paymentMethod],
                    delegate: null,
                    refund_to: "tb1qautomationrefundxxxxxxxxxxxxxxxxxxxxx",
                },
                gas: GAS,
                attachedDeposit: v2StorageFeeYocto,
            });
        } catch (error) {
            if (
                error?.type === "LackBalanceForState"
                || String(error?.message || error).includes("enough balance to cover storage")
            ) {
                throw new Error(
                    `Insufficient signer balance to register new V2 intent. ` +
                    `Need at least ${v2StorageFeeYocto} yoctoNEAR plus gas, or keep one AwaitingFunding V2 deposit reusable.`,
                );
            }
            throw error;
        }

        v2DepositId = decodeSuccessValue(registerOutcome.status);
        if (typeof v2DepositId !== "number") {
            const accountDeposits = await viewCall(provider, "get_account_deposits", {
                account_id: TEST_ACCOUNT_ID,
            });
            const latest = accountDeposits[accountDeposits.length - 1];
            v2DepositId = typeof latest === "string" ? Number(latest) : latest;
        }
        assert(Number.isFinite(v2DepositId), "Invalid V2 deposit id");
        console.log("✓ register_deposit_intent_v2 deposit_id:", v2DepositId);
    }

    console.log("→ oracle_set_quote_v2...");
    await account.functionCall({
        contractId: CONTRACT_ID,
        methodName: "oracle_set_quote_v2",
        args: {
            deposit_id: v2DepositId,
            quote_id: `integration-quote-${Date.now()}`,
            deposit_address: "tb1qintegrationaddressxxxxxxxxxxxxxxxxxxx",
            deposit_memo: null,
            quote_expires_at_ms: Date.now() + 10 * 60_000,
        },
        gas: GAS,
    });

    const funding = await waitForFundingStarted(provider, v2DepositId);
    assert(funding?.status === "AwaitingFunding", "V2 funding should remain AwaitingFunding after set_quote");
    assert(Number(funding?.funding_started_at_ms || 0) > 0, "V2 funding_started_at_ms should be set");
    console.log("✓ oracle_set_quote_v2 accepted");

    console.log("✓ Write integration checks passed");
}

main().catch((error) => {
    console.error("❌ Integration test failed");
    console.error(error);
    process.exit(1);
});
