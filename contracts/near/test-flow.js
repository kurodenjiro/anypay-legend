const { Worker } = require("near-workspaces");
const path = require("path");

const V2_STORAGE_FEE = "50000000000000000000000"; // 0.05 NEAR

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function testFlow() {
  const worker = await Worker.init();
  const root = worker.rootAccount;

  try {
    const wasmPath = path.join(
      __dirname,
      "target/wasm32-unknown-unknown/release/anypay_legend_near.wasm",
    );

    console.log("📦 Deploying contract...");
    const contract = await root.devDeploy(wasmPath);

    console.log("🔧 Initializing contract...");
    await contract.call(contract, "new", {
      owner_id: root.accountId,
      protocol_fee_recipient: root.accountId,
    });
    console.log("✅ Contract Initialized:", contract.accountId);

    const depositor = await root.createSubAccount("depositor", { initialBalance: "30" });
    const buyer = await root.createSubAccount("buyer", { initialBalance: "30" });

    console.log("\n--- Test 1: Payment Method Registry ---");
    await root.call(contract, "add_payment_method", {
      name: "wise",
      verifier: "wise-verifier.testnet",
      currencies: ["USD", "EUR", "GBP"],
    });
    await root.call(contract, "add_payment_method", {
      name: "venmo",
      verifier: "venmo-verifier.testnet",
      currencies: ["USD"],
    });

    const wiseMethod = await contract.view("get_payment_method", { name: "wise" });
    assert(!!wiseMethod?.initialized, "wise payment method was not initialized");
    console.log("✅ Payment methods registered");

    console.log("\n--- Test 2: V2 Register Intent + Quote + Funding Confirmation ---");
    const v2DepositId = await depositor.call(
      contract,
      "register_deposit_intent_v2",
      {
        asset_id: "asset:btc:testnet",
        expected_amount: "200000000000000000000000",
        min_intent_amount: "20000000000000000000000",
        max_intent_amount: "200000000000000000000000",
        payment_methods: ["wise", "venmo"],
        delegate: null,
        refund_to: "tb1qrefundaddressxxxxxxxxxxxxxxxxxxxxxx",
      },
      { attachedDeposit: V2_STORAGE_FEE },
    );

    const fundingBeforeQuote = await contract.view("get_deposit_funding_v2", {
      deposit_id: v2DepositId,
    });
    assert(
      fundingBeforeQuote?.status === "AwaitingFunding",
      "V2 funding should start as AwaitingFunding",
    );

    await root.call(contract, "oracle_set_quote_v2", {
      deposit_id: v2DepositId,
      quote_id: "quote-v2-1",
      deposit_address: "tb1qfundingaddressxxxxxxxxxxxxxxxxxxxxx",
      deposit_memo: null,
      quote_expires_at_ms: Date.now() + 10 * 60_000,
    });

    const fundingAfterQuote = await contract.view("get_deposit_funding_v2", {
      deposit_id: v2DepositId,
    });
    assert(
      Number(fundingAfterQuote?.funding_started_at_ms || 0) > 0,
      "Funding start timestamp should be set on first quote",
    );
    assert(
      Number(fundingAfterQuote?.topup_deadline_at_ms || 0)
      > Number(fundingAfterQuote?.funding_started_at_ms || 0),
      "Topup deadline should be after funding start",
    );

    await root.call(contract, "oracle_confirm_funding_v2", {
      deposit_id: v2DepositId,
      quote_id: "quote-v2-1",
      funded_amount: "180000000000000000000000",
      origin_tx_hash: "btc-tx-hash-1",
      intents_status: "SUCCESS",
    });

    const fundingAfterConfirm = await contract.view("get_deposit_funding_v2", {
      deposit_id: v2DepositId,
    });
    assert(fundingAfterConfirm?.status === "Funded", "Funding should be Funded after oracle confirmation");

    const openListings = await contract.view("get_open_deposits_by_asset_v2", {
      asset_id: "asset:btc:testnet",
      from_index: 0,
      limit: 10,
    });
    assert(
      Array.isArray(openListings) && openListings.some((item) => Number(item.deposit_id) === Number(v2DepositId)),
      "Funded deposit should be visible in open listings",
    );

    console.log("✅ V2 listing open and funded");

    console.log("\n--- Test 3: Buyer Signals Intent From V2 Funded Listing ---");
    const v2IntentHash = await buyer.call(
      contract,
      "signal_intent",
      {
        deposit_id: v2DepositId,
        amount: "20000000000000000000000",
        payment_method: "wise",
        currency_code: "USD",
        recipient: "tb1qbuyeraddressxxxxxxxxxxxxxxxxxxxxxxx",
        chain: "BTC",
      },
      { attachedDeposit: "10000000000000000000000" },
    );

    const v2Intent = await contract.view("get_intent", { intent_hash: v2IntentHash });
    assert(v2Intent?.status === "Signaled", "V2 intent should be Signaled");
    console.log("✅ Buyer intent signaled on funded V2 listing");

    console.log("\n--- Test 4: V2 Cancel Before Funding ---");
    const cancelableDepositId = await depositor.call(
      contract,
      "register_deposit_intent_v2",
      {
        asset_id: "asset:eth:testnet",
        expected_amount: "50000000000000000000000",
        min_intent_amount: "5000000000000000000000",
        max_intent_amount: "50000000000000000000000",
        payment_methods: ["venmo"],
        delegate: null,
        refund_to: "0x0123456789abcdef0123456789abcdef01234567",
      },
      { attachedDeposit: V2_STORAGE_FEE },
    );

    await depositor.call(contract, "cancel_deposit_intent_v2", {
      deposit_id: cancelableDepositId,
    });

    const cancelledFunding = await contract.view("get_deposit_funding_v2", {
      deposit_id: cancelableDepositId,
    });
    assert(cancelledFunding?.status === "Cancelled", "V2 funding should be Cancelled");
    console.log("✅ Pre-funded cancellation works");

    console.log("\n--- Test 5: V1 Flow Backward Compatibility ---");
    const v1DepositId = await depositor.call(
      contract,
      "create_deposit",
      {
        token: "USDC",
        amount: "1000000000",
        min_intent_amount: "10000000",
        max_intent_amount: "500000000",
        payment_methods: ["wise", "venmo"],
        delegate: null,
      },
      { attachedDeposit: "1000000000000000000000000" },
    );

    const v1IntentHash = await buyer.call(
      contract,
      "signal_intent",
      {
        deposit_id: v1DepositId,
        amount: "50000000",
        payment_method: "venmo",
        currency_code: "USD",
        recipient: "0xtest123",
        chain: "ETH",
      },
      { attachedDeposit: "10000000000000000000000" },
    );

    await buyer.call(contract, "cancel_intent", { intent_hash: v1IntentHash });

    const cancelledV1Intent = await contract.view("get_intent", {
      intent_hash: v1IntentHash,
    });
    assert(cancelledV1Intent?.status === "Cancelled", "V1 intent cancel should still work");

    console.log("✅ V1 compatibility preserved");

    console.log("\n🎉 All tests passed!");
  } finally {
    await worker.tearDown();
  }
}

testFlow().catch((e) => {
  console.error("❌ Test Failed:", e);
  process.exit(1);
});
