use near_workspaces::{types::NearToken, Account, Contract};
use serde_json::json;

#[tokio::test]
async fn test_full_flow() -> anyhow::Result<()> {
    // 1. Initialize Sandbox
    let worker = near_workspaces::sandbox().await?;

    // 2. Load Contract WASM manually
    let wasm = std::fs::read("target/wasm32-unknown-unknown/release/anypay_legend_near.wasm")?;
    let contract = worker.dev_deploy(&wasm).await?;

    // 3. Create Users
    let owner = worker.root_account()?;
    let user = owner
        .create_subaccount("user")
        .initial_balance(NearToken::from_near(30))
        .transact()
        .await?
        .into_result()?;

    // 4. Initialize Contract
    contract
        .call("new")
        .args_json(json!({ "owner_id": owner.id() }))
        .transact()
        .await?
        .into_result()?;

    println!("Contract Initialized");

    // 5. User Deposits BTC (Simulated)
    // In production, this would be an oracle call or cross-chain proof
    // For MVP, user calls deposit to simulate the relayer action
    user.call(contract.id(), "deposit")
        .args_json(json!({
            "chain": "BTC",
            "asset": "BTC",
            "amount": "100000000" // 1 BTC in sats
        }))
        .deposit(NearToken::from_yoctonear(1)) // Storage deposit
        .transact()
        .await?
        .into_result()?;

    println!("User Deposited BTC");

    // 6. User Signals Intent (Lock Funds)
    let intent_id: String = user
        .call(contract.id(), "signal_intent")
        .args_json(json!({
            "chain": "BTC",
            "asset": "BTC",
            "amount": "50000000", // 0.5 BTC
            "recipient": "tb1q..."
        }))
        .deposit(NearToken::from_yoctonear(1))
        .transact()
        .await?
        .json()?;

    println!("Intent Signaled: {}", intent_id);

    // 7. Fulfill Intent (Trigger MPC)
    // This should succeed and log the MPC signature request
    let outcome = owner
        .call(contract.id(), "fulfill_intent")
        .args_json(json!({
            "intent_id": intent_id
        }))
        .transact()
        .await?;

    println!("Fulfill Outcome Logs: {:?}", outcome.logs());
    assert!(outcome.is_success());
    println!("Intent Fulfilled - MPC Request Sent");

    Ok(())
}
