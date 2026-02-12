#!/bin/bash

# NEAR Contract Deployment Script
# This script will guide you through deploying the contract to testnet

echo "🚀 NEAR Contract Deployment Helper"
echo "===================================="
echo ""

# Check if WASM file exists
WASM_FILE="target/wasm32-unknown-unknown/release/anypay_legend_near.wasm"
if [ ! -f "$WASM_FILE" ]; then
    echo "❌ WASM file not found. Building contract..."
    cargo build --target wasm32-unknown-unknown --release
    if [ $? -ne 0 ]; then
        echo "❌ Build failed. Please fix errors and try again."
        exit 1
    fi
    echo "✅ Contract built successfully"
fi

echo "📦 WASM file ready: $WASM_FILE"
echo ""

# Check if user is logged in
echo "🔐 Checking NEAR CLI login status..."
near account list 2>/dev/null
if [ $? -ne 0 ]; then
    echo ""
    echo "⚠️  You need to login to NEAR CLI first."
    echo "Run: near account import-account using-web-wallet network-config testnet"
    echo ""
    exit 1
fi

echo ""
echo "📋 Deployment Options:"
echo ""
echo "Option 1: Create a new dev account (recommended for testing)"
echo "  Command: near account create-account fund-myself <your-new-account>.testnet '1 NEAR' autogenerate-new-keypair save-to-keychain sign-as <your-account>.testnet network-config testnet sign-with-keychain send"
echo ""
echo "Option 2: Deploy to existing account"
echo "  Command: near contract deploy <your-account>.testnet use-file $WASM_FILE without-init-call network-config testnet sign-with-keychain send"
echo ""
echo "After deployment, initialize the contract:"
echo "  near contract call-function as-transaction <contract-account>.testnet new json-args '{\"owner_id\":\"<your-account>.testnet\",\"protocol_fee_recipient\":\"<your-account>.testnet\"}' prepaid-gas '30 TeraGas' attached-deposit '0 NEAR' sign-as <your-account>.testnet network-config testnet sign-with-keychain send"
echo ""
echo "Then run the initialization script:"
echo "  CONTRACT_ID=<contract-account>.testnet OWNER_ID=<your-account>.testnet node init-contract.js"
echo ""
echo "💡 Tip: Replace <your-account> and <contract-account> with your actual account names"
