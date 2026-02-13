use serde::{Deserialize, Serialize};
use tlsn::{transcript::hash::PlaintextHash, transcript::TranscriptCommitment};

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ZKProofBundle {
    pub vk: Vec<u8>,
    pub proof: Vec<u8>,
}

// Start constants from tlsn-examples
// Maximum number of bytes that can be sent from prover to server.
pub const MAX_SENT_DATA: usize = 1 << 12;
// Maximum number of bytes that can be received by prover from server.
pub const MAX_RECV_DATA: usize = 1 << 14;
// End constants

pub fn received_commitments(commitments: &[TranscriptCommitment]) -> Vec<&PlaintextHash> {
    commitments
        .iter()
        .filter_map(|commitment| match commitment {
            TranscriptCommitment::Hash(hash) => Some(hash),
            _ => None,
        })
        .collect()
}
