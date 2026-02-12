#!/bin/bash
set -e

echo "🚀 Deploying to testnet..."
near contract deploy anypay-legend-final.testnet use-file target/wasm32-unknown-unknown/release/anypay_legend_near.wasm without-init-call network-config testnet sign-with-keychain send

echo "🔧 Initializing contract..."
near contract call-function as-transaction anypay-legend-final.testnet new json-args '{"owner_id":"agenttest1.testnet","protocol_fee_recipient":"agenttest1.testnet"}' prepaid-gas '30 TeraGas' attached-deposit '0 NEAR' sign-as anypay-legend-final.testnet network-config testnet sign-with-keychain send

echo "✅ Deployment Complete!"
