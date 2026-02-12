const { connect, keyStores, KeyPair } = require('near-api-js');
const fs = require('fs');
const path = require('path');

/**
 * Initialize the deployed NEAR contract
 * 
 * Usage:
 *   CONTRACT_ID=dev-xxx.testnet OWNER_ID=your-account.testnet node init-contract.js
 */

async function initContract() {
    const contractId = process.env.CONTRACT_ID;
    const ownerId = process.env.OWNER_ID || contractId;

    if (!contractId) {
        console.error('❌ CONTRACT_ID environment variable is required');
        console.log('Usage: CONTRACT_ID=dev-xxx.testnet OWNER_ID=your-account.testnet node init-contract.js');
        process.exit(1);
    }

    console.log('🔧 Initializing NEAR Contract');
    console.log('Contract ID:', contractId);
    console.log('Owner ID:', ownerId);

    // Setup NEAR connection
    const keyStore = new keyStores.UnencryptedFileSystemKeyStore(
        path.join(process.env.HOME, '.near-credentials')
    );

    const config = {
        networkId: 'testnet',
        keyStore,
        nodeUrl: 'https://rpc.testnet.near.org',
        walletUrl: 'https://wallet.testnet.near.org',
        helperUrl: 'https://helper.testnet.near.org',
    };

    const near = await connect(config);
    const account = await near.account(ownerId);

    try {
        // Step 1: Initialize contract
        console.log('\n📝 Step 1: Initializing contract...');
        await account.functionCall({
            contractId,
            methodName: 'new',
            args: {
                owner_id: ownerId,
                protocol_fee_recipient: ownerId
            },
            gas: '30000000000000',
        });
        console.log('✅ Contract initialized');

        // Step 2: Add Wise payment method
        console.log('\n📝 Step 2: Adding Wise payment method...');
        await account.functionCall({
            contractId,
            methodName: 'add_payment_method',
            args: {
                name: 'wise',
                verifier: 'wise-verifier.testnet',
                currencies: ['USD', 'EUR', 'GBP']
            },
            gas: '30000000000000',
        });
        console.log('✅ Wise payment method added');

        // Step 3: Add Venmo payment method
        console.log('\n📝 Step 3: Adding Venmo payment method...');
        await account.functionCall({
            contractId,
            methodName: 'add_payment_method',
            args: {
                name: 'venmo',
                verifier: 'venmo-verifier.testnet',
                currencies: ['USD']
            },
            gas: '30000000000000',
        });
        console.log('✅ Venmo payment method added');

        // Step 4: Add Revolut payment method
        console.log('\n📝 Step 4: Adding Revolut payment method...');
        await account.functionCall({
            contractId,
            methodName: 'add_payment_method',
            args: {
                name: 'revolut',
                verifier: 'revolut-verifier.testnet',
                currencies: ['USD', 'EUR', 'GBP', 'SGD']
            },
            gas: '30000000000000',
        });
        console.log('✅ Revolut payment method added');

        // Verify setup
        console.log('\n🔍 Verifying setup...');
        const wiseMethod = await account.viewFunction({
            contractId,
            methodName: 'get_payment_method',
            args: { name: 'wise' }
        });
        console.log('Wise method:', wiseMethod);

        console.log('\n🎉 Contract initialization complete!');
        console.log('\n📋 Next steps:');
        console.log(`1. Update CONTRACT_ID in apps/web/src/lib/services/near.ts to: ${contractId}`);
        console.log('2. Test deposit creation via frontend');
        console.log('3. Test intent signaling');

    } catch (error) {
        console.error('❌ Initialization failed:', error);
        process.exit(1);
    }
}

initContract();
