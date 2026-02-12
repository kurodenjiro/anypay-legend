use near_sdk::borsh::{self, BorshDeserialize, BorshSerialize};
use near_sdk::serde::{Deserialize, Serialize};

#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone)]
#[serde(crate = "near_sdk::serde")]
pub struct EthTransaction {
    pub nonce: U256,
    pub gas_price: U256,
    pub gas_limit: U256,
    pub to: Option<String>,
    pub value: U256,
    pub data: Vec<u8>,
    pub v: u64,
    pub r: U256,
    pub s: U256,
}

#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone)]
#[serde(crate = "near_sdk::serde")]
pub struct U256(pub [u8; 32]);

pub fn rlp_encode(input: &[u8]) -> Vec<u8> {
    if input.len() == 1 && input[0] < 0x80 {
        return vec![input[0]];
    } else if input.len() <= 55 {
        let mut result = vec![0x80 + input.len() as u8];
        result.extend_from_slice(input);
        return result;
    } else {
        let len_bytes = to_min_bytes(input.len());
        let mut result = vec![0xb7 + len_bytes.len() as u8];
        result.extend_from_slice(&len_bytes);
        result.extend_from_slice(input);
        return result;
    }
}

pub fn to_min_bytes(val: usize) -> Vec<u8> {
    let mut bytes = Vec::new();
    let mut v = val;
    while v > 0 {
        bytes.push((v & 0xff) as u8);
        v >>= 8;
    }
    if bytes.is_empty() {
        bytes.push(0);
    }
    bytes.reverse();
    bytes
}

// Basic implementation for ETH transaction RLP encoding
// Note: This is simplified and assumes legacy transaction type for MVP
pub fn encode_transaction(tx: &EthTransaction) -> Vec<u8> {
    // Implementation would go here to encode the full tx structure
    // nonce, gas_price, gas_limit, to, value, data, v, r, s
    vec![]
}
