use near_sdk::borsh::{self, BorshDeserialize, BorshSerialize};
use near_sdk::serde::{Deserialize, Serialize};

#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone)]
#[serde(crate = "near_sdk::serde")]
pub struct Utxo {
    pub txid: String,
    pub vout: u32,
    pub value: u64,
}

#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone)]
#[serde(crate = "near_sdk::serde")]
pub struct BitcoinTransaction {
    pub version: i32,
    pub inputs: Vec<BitcoinInput>,
    pub outputs: Vec<BitcoinOutput>,
    pub locktime: u32,
}

#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone)]
#[serde(crate = "near_sdk::serde")]
pub struct BitcoinInput {
    pub txid: String,
    pub vout: u32,
    pub script_sig: Vec<u8>,
    pub sequence: u32,
}

#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone)]
#[serde(crate = "near_sdk::serde")]
pub struct BitcoinOutput {
    pub value: u64,
    pub script_pubkey: Vec<u8>,
}

// Basic implementation for BTC transaction serialization
pub fn serialize_transaction(tx: &BitcoinTransaction) -> Vec<u8> {
    let mut data = Vec::new();
    // Version
    data.extend_from_slice(&tx.version.to_le_bytes());

    // Inputs
    data.push(tx.inputs.len() as u8); // VarInt simplified
    for input in &tx.inputs {
        let txid_bytes = hex::decode(&input.txid).unwrap_or(vec![0; 32]);
        // TXID is little-endian in Bitcoin protocol
        let mut txid_le = txid_bytes.clone();
        txid_le.reverse();
        data.extend_from_slice(&txid_le);

        data.extend_from_slice(&input.vout.to_le_bytes());
        // ScriptSig length + ScriptSig
        data.push(input.script_sig.len() as u8);
        data.extend_from_slice(&input.script_sig);

        data.extend_from_slice(&input.sequence.to_le_bytes());
    }

    // Outputs
    data.push(tx.outputs.len() as u8); // VarInt simplified
    for output in &tx.outputs {
        data.extend_from_slice(&output.value.to_le_bytes());

        // ScriptPubKey length + ScriptPubKey
        data.push(output.script_pubkey.len() as u8);
        data.extend_from_slice(&output.script_pubkey);
    }

    // Locktime
    data.extend_from_slice(&tx.locktime.to_le_bytes());

    data
}
