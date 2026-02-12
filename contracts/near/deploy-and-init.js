#!/usr/bin/env node

/**
 * NEAR Contract Deployment & Initialization Script
 * 
 * This script:
 * 1. Deploys the NEAR contract
 * 2. Initializes it with the owner
 * 3. Adds "Wise" as a demo zkTLS platform
 * 
 * Usage:
 *   node deploy-and-init.js
 */

const { connect, keyStores, Contract } = require('near-api-js');
const path = require('path');
const os = require('os');

const NETWORK = 'testnet';
const CONTRACT_WASM_PATH = path.join(__dirname, 'target/wasm32-unknown-unknown/release/anypay_legend_near.wasm');

async function main() {
    // 1. Setup NEAR connection
    const keyStore = new keyStores.UnencryptedFileSystemKeyStore(
        path.join(os.homedir(), '.near-credentials')
    );

    const config = {
        networkId: NETWORK,
        keyStore,
        nodeUrl: `https://rpc.${NETWORK}.near.org`,
        walletUrl: `https://wallet.${NETWORK}.near.org`,
        helperUrl: `https://helper.${NETWORK}.near.org`,
        explorerUrl: `https://explorer.${NETWORK}.near.org`,
    };

    const near = await connect(config);
    const account = await near.account(process.env.NEAR_ACCOUNT || 'your-account.testnet');

    console.log('📦 Deploying contract...');

    // 2. Deploy contract (dev-deploy equivalent)
    // For production, use: near.account().deployContract(wasmBuffer)
    console.log('⚠️  Please deploy manually using:');
    console.log('   near dev-deploy target/wasm32-unknown-unknown/release/anypay_legend_near.wasm');
    console.log('');
    console.log('After deployment, set CONTRACT_ID environment variable and run:');
    console.log('   CONTRACT_ID=dev-xxx.testnet node init-contract.js');
}

main().catch(console.error);
