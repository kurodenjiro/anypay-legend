use near_sdk::borsh::{self, BorshDeserialize, BorshSerialize};
use near_sdk::collections::{LookupMap, UnorderedSet};
use near_sdk::json_types::U128;
use near_sdk::serde::{Deserialize, Serialize};
use near_sdk::{env, near_bindgen, AccountId, PanicOnDefault, Promise};

#[cfg(feature = "abi")]
use near_sdk::schemars::JsonSchema;

pub mod chains;

// MPC Contract ID (on Testnet)
const MPC_CONTRACT_ID: &str = "v1.signer-prod.testnet";

const DEFAULT_V2_STORAGE_FEE_YOCTO: u128 = 50_000_000_000_000_000_000_000; // 0.05 NEAR
const DEFAULT_TOPUP_WINDOW_MS: u64 = 10_800_000; // 3 hours
const DEFAULT_MAX_QUOTE_ROTATIONS: u16 = 48;
const MAX_VIEW_LIMIT: usize = 200;

#[near_bindgen]
#[derive(BorshDeserialize, BorshSerialize, PanicOnDefault)]
pub struct Contract {
    // Owner of the contract
    pub owner_id: AccountId,

    // === ESCROW STATE ===
    // Deposit counter for unique IDs
    pub deposit_counter: u64,
    // Mapping: DepositId -> Deposit
    pub deposits: LookupMap<u64, Deposit>,
    // Mapping: AccountId -> Set<DepositId>
    pub account_deposits: LookupMap<AccountId, UnorderedSet<u64>>,
    // Mapping: DepositId -> Set<IntentHash>
    pub deposit_intents: LookupMap<u64, UnorderedSet<String>>,

    // === ORCHESTRATOR STATE ===
    // Intent counter for unique IDs
    pub intent_counter: u64,
    // Mapping: IntentHash -> Intent
    pub intents: LookupMap<String, Intent>,
    // Mapping: AccountId -> Set<IntentHash>
    pub account_intents: LookupMap<AccountId, UnorderedSet<String>>,

    // === REGISTRY STATE ===
    // Payment Method Registry: Name -> PaymentMethod
    pub payment_methods: LookupMap<String, PaymentMethod>,

    // === CONFIG ===
    pub protocol_fee: u128, // Fee in basis points (100 = 1%)
    pub protocol_fee_recipient: AccountId,
    pub max_intents_per_deposit: u8,
    pub intent_expiration_period: u64, // Nanoseconds

    // === V2 FUNDING STATE ===
    pub deposit_funding: LookupMap<u64, DepositFundingMeta>,
    pub open_deposits_by_asset: LookupMap<String, UnorderedSet<u64>>,
    pub oracle_account_id: AccountId,
    pub v2_storage_fee_yocto: u128,
    pub topup_window_ms: u64,
    pub max_quote_rotations: u16,
}

#[derive(BorshDeserialize, BorshSerialize)]
pub struct OldContract {
    pub owner_id: AccountId,
    pub deposit_counter: u64,
    pub deposits: LookupMap<u64, Deposit>,
    pub account_deposits: LookupMap<AccountId, UnorderedSet<u64>>,
    pub deposit_intents: LookupMap<u64, UnorderedSet<String>>,
    pub intent_counter: u64,
    pub intents: LookupMap<String, Intent>,
    pub account_intents: LookupMap<AccountId, UnorderedSet<String>>,
    pub payment_methods: LookupMap<String, PaymentMethod>,
    pub protocol_fee: u128,
    pub protocol_fee_recipient: AccountId,
    pub max_intents_per_deposit: u8,
    pub intent_expiration_period: u64,
}

// === STRUCTS ===

#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone, Debug)]
#[cfg_attr(feature = "abi", derive(JsonSchema))]
#[serde(crate = "near_sdk::serde")]
pub struct Deposit {
    pub deposit_id: u64,
    pub depositor: AccountId,
    pub delegate: Option<AccountId>, // Optional delegate to manage deposit
    pub token: String,               // Token identifier
    pub total_deposit: u128,
    pub remaining_deposits: u128,
    pub outstanding_intents: u128, // Locked in intents
    pub min_intent_amount: u128,
    pub max_intent_amount: u128,
    pub timestamp: u64,
    pub payment_methods: Vec<String>, // List of payment method names
}

#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone, Debug)]
#[serde(crate = "near_sdk::serde")]
pub struct DepositPaymentMethodData {
    pub payee_details_hash: String,
    pub verification_data: String,
    pub currencies: Vec<Currency>,
}

#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone, Debug)]
#[serde(crate = "near_sdk::serde")]
pub struct Currency {
    pub code: String,
    pub min_conversion_rate: u128,
}

#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone, Debug)]
#[cfg_attr(feature = "abi", derive(JsonSchema))]
#[serde(crate = "near_sdk::serde")]
pub struct PaymentMethod {
    pub name: String,
    pub verifier: String,
    pub currencies: Vec<String>,
    pub initialized: bool,
}

#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone, Debug)]
#[cfg_attr(feature = "abi", derive(JsonSchema))]
#[serde(crate = "near_sdk::serde")]
pub struct Intent {
    pub intent_hash: String,
    pub buyer: AccountId,
    pub deposit_id: u64,
    pub amount: u128,
    pub timestamp: u64,
    pub payment_method: String,
    pub currency_code: String,
    pub status: IntentStatus,
    pub recipient: String,
    pub chain: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[cfg_attr(feature = "abi", derive(JsonSchema))]
#[serde(crate = "near_sdk::serde")]
pub struct IntentTransferDetailsView {
    pub intent_hash: String,
    pub deposit_id: u64,
    pub amount: u128,
    pub currency_code: String,
    pub payment_method_raw: String,
    pub platform: String,
    pub tagname: String,
    pub memo: String,
}

#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone, PartialEq, Debug)]
#[cfg_attr(feature = "abi", derive(JsonSchema))]
#[serde(crate = "near_sdk::serde")]
pub enum IntentStatus {
    Signaled,
    Fulfilled,
    Cancelled,
    Released,
}

#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone, PartialEq, Debug)]
#[cfg_attr(feature = "abi", derive(JsonSchema))]
#[serde(crate = "near_sdk::serde")]
pub enum FundingStatus {
    AwaitingFunding,
    Funded,
    TopUpExpired,
    Failed,
    Cancelled,
}

#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone, Debug)]
#[cfg_attr(feature = "abi", derive(JsonSchema))]
#[serde(crate = "near_sdk::serde")]
pub struct DepositFundingMeta {
    pub asset_id: String,
    pub refund_to: String,
    pub quote_id: Option<String>,
    pub deposit_address: Option<String>,
    pub deposit_memo: Option<String>,
    pub quote_expires_at_ms: u64,
    pub quote_generation: u16,
    pub funding_started_at_ms: u64,
    pub topup_deadline_at_ms: u64,
    pub status: FundingStatus,
    pub funded_amount: u128,
    pub origin_tx_hash: Option<String>,
    pub last_intents_status: Option<String>,
    pub failure_reason: Option<String>,
    pub updated_at_ms: u64,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[cfg_attr(feature = "abi", derive(JsonSchema))]
#[serde(crate = "near_sdk::serde")]
pub struct DepositSummaryV2 {
    pub deposit_id: u64,
    pub asset_id: String,
    pub depositor: AccountId,
    pub delegate: Option<AccountId>,
    pub payment_methods: Vec<String>,
    pub min_intent_amount: u128,
    pub max_intent_amount: u128,
    pub funded_amount: u128,
    pub remaining_deposits: u128,
    pub topup_deadline_at_ms: u64,
    pub quote_expires_at_ms: u64,
    pub status: FundingStatus,
    pub updated_at_ms: u64,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[cfg_attr(feature = "abi", derive(JsonSchema))]
#[serde(crate = "near_sdk::serde")]
pub struct V2Config {
    pub oracle_account_id: AccountId,
    pub storage_fee_yocto: U128,
    pub topup_window_ms: u64,
    pub max_quote_rotations: u16,
}

// === IMPLEMENTATION ===

#[near_bindgen]
impl Contract {
    #[init]
    pub fn new(owner_id: AccountId, protocol_fee_recipient: AccountId) -> Self {
        Self {
            owner_id: owner_id.clone(),
            deposit_counter: 0,
            deposits: LookupMap::new(b"d"),
            account_deposits: LookupMap::new(b"a"),
            deposit_intents: LookupMap::new(b"e"),
            intent_counter: 0,
            intents: LookupMap::new(b"i"),
            account_intents: LookupMap::new(b"b"),
            payment_methods: LookupMap::new(b"p"),
            protocol_fee: 100,
            protocol_fee_recipient,
            max_intents_per_deposit: 100,
            intent_expiration_period: 86_400_000_000_000,
            deposit_funding: LookupMap::new(b"f"),
            open_deposits_by_asset: LookupMap::new(b"o"),
            oracle_account_id: owner_id,
            v2_storage_fee_yocto: DEFAULT_V2_STORAGE_FEE_YOCTO,
            topup_window_ms: DEFAULT_TOPUP_WINDOW_MS,
            max_quote_rotations: DEFAULT_MAX_QUOTE_ROTATIONS,
        }
    }

    #[init(ignore_state)]
    pub fn migrate_v2(
        oracle_account_id: AccountId,
        storage_fee_yocto: U128,
        topup_window_ms: u64,
    ) -> Self {
        let old: OldContract = env::state_read().expect("Old state does not exist");
        assert_eq!(env::predecessor_account_id(), old.owner_id, "Owner only");

        Self {
            owner_id: old.owner_id,
            deposit_counter: old.deposit_counter,
            deposits: old.deposits,
            account_deposits: old.account_deposits,
            deposit_intents: old.deposit_intents,
            intent_counter: old.intent_counter,
            intents: old.intents,
            account_intents: old.account_intents,
            payment_methods: old.payment_methods,
            protocol_fee: old.protocol_fee,
            protocol_fee_recipient: old.protocol_fee_recipient,
            max_intents_per_deposit: old.max_intents_per_deposit,
            intent_expiration_period: old.intent_expiration_period,
            deposit_funding: LookupMap::new(b"f"),
            open_deposits_by_asset: LookupMap::new(b"o"),
            oracle_account_id,
            v2_storage_fee_yocto: storage_fee_yocto.0,
            topup_window_ms: if topup_window_ms == 0 {
                DEFAULT_TOPUP_WINDOW_MS
            } else {
                topup_window_ms
            },
            max_quote_rotations: DEFAULT_MAX_QUOTE_ROTATIONS,
        }
    }

    // === ESCROW FUNCTIONS (V1) ===

    #[payable]
    pub fn create_deposit(
        &mut self,
        token: String,
        amount: U128,
        min_intent_amount: U128,
        max_intent_amount: U128,
        payment_methods: Vec<String>,
        delegate: Option<AccountId>,
    ) -> u64 {
        let amount = amount.0;
        let min_intent_amount = min_intent_amount.0;
        let max_intent_amount = max_intent_amount.0;
        let depositor = env::predecessor_account_id();

        assert!(amount > 0, "Amount must be greater than 0");
        assert!(
            min_intent_amount > 0,
            "Min intent amount must be greater than 0"
        );
        assert!(min_intent_amount <= max_intent_amount, "Min must be <= max");
        assert!(
            !payment_methods.is_empty(),
            "At least one payment method required"
        );
        assert!(
            Self::extract_payment_details(&payment_methods).is_some(),
            "payment_methods must include platform::tagname"
        );

        self.deposit_counter += 1;
        let deposit_id = self.deposit_counter;

        let deposit = Deposit {
            deposit_id,
            depositor: depositor.clone(),
            delegate,
            token,
            total_deposit: amount,
            remaining_deposits: amount,
            outstanding_intents: 0,
            min_intent_amount,
            max_intent_amount,
            timestamp: env::block_timestamp(),
            payment_methods,
        };

        self.deposits.insert(&deposit_id, &deposit);
        self.insert_account_deposit(&depositor, deposit_id);
        self.deposit_intents.insert(
            &deposit_id,
            &UnorderedSet::new(format!("di:{}", deposit_id).as_bytes()),
        );

        env::log_str(&format!("Deposit created: {}", deposit_id));
        deposit_id
    }

    pub fn withdraw_deposit(&mut self, deposit_id: u64) {
        let caller = env::predecessor_account_id();
        let mut deposit = self.deposits.get(&deposit_id).expect("Deposit not found");

        assert!(self.is_deposit_manager(&caller, &deposit), "Unauthorized");
        assert!(
            deposit.outstanding_intents == 0,
            "Outstanding intents exist"
        );

        let amount = deposit.remaining_deposits;
        deposit.remaining_deposits = 0;
        self.deposits.insert(&deposit_id, &deposit);
        self.sync_open_listing_state(deposit_id, &deposit);

        env::log_str(&format!(
            "Deposit withdrawn: {} amount: {}",
            deposit_id, amount
        ));
        // In production: transfer tokens back to depositor
    }

    pub fn set_delegate(&mut self, deposit_id: u64, delegate: AccountId) {
        let caller = env::predecessor_account_id();
        let mut deposit = self.deposits.get(&deposit_id).expect("Deposit not found");

        assert!(
            deposit.depositor == caller,
            "Only depositor can set delegate"
        );
        deposit.delegate = Some(delegate.clone());
        self.deposits.insert(&deposit_id, &deposit);

        env::log_str(&format!(
            "Delegate set for deposit {}: {}",
            deposit_id, delegate
        ));
    }

    // === V2 SELLER FUNDING METHODS ===

    #[payable]
    pub fn register_deposit_intent_v2(
        &mut self,
        asset_id: String,
        expected_amount: U128,
        min_intent_amount: U128,
        max_intent_amount: U128,
        payment_methods: Vec<String>,
        delegate: Option<AccountId>,
        refund_to: String,
    ) -> u64 {
        let expected_amount = expected_amount.0;
        let min_intent_amount = min_intent_amount.0;
        let max_intent_amount = max_intent_amount.0;
        let depositor = env::predecessor_account_id();
        let attached = env::attached_deposit().as_yoctonear();

        assert!(
            attached >= self.v2_storage_fee_yocto,
            "Attached deposit is below V2 storage fee"
        );
        assert!(expected_amount > 0, "Expected amount must be > 0");
        assert!(
            min_intent_amount > 0,
            "Min intent amount must be greater than 0"
        );
        assert!(min_intent_amount <= max_intent_amount, "Min must be <= max");
        assert!(
            !payment_methods.is_empty(),
            "At least one payment method required"
        );
        assert!(
            Self::extract_payment_details(&payment_methods).is_some(),
            "payment_methods must include platform::tagname"
        );
        assert!(!asset_id.trim().is_empty(), "asset_id is required");
        assert!(!refund_to.trim().is_empty(), "refund_to is required");

        self.deposit_counter += 1;
        let deposit_id = self.deposit_counter;

        let deposit = Deposit {
            deposit_id,
            depositor: depositor.clone(),
            delegate,
            token: asset_id.clone(),
            total_deposit: expected_amount,
            remaining_deposits: 0,
            outstanding_intents: 0,
            min_intent_amount,
            max_intent_amount,
            timestamp: env::block_timestamp(),
            payment_methods,
        };

        let now_ms = self.now_ms();
        let funding = DepositFundingMeta {
            asset_id,
            refund_to,
            quote_id: None,
            deposit_address: None,
            deposit_memo: None,
            quote_expires_at_ms: 0,
            quote_generation: 0,
            funding_started_at_ms: 0,
            topup_deadline_at_ms: 0,
            status: FundingStatus::AwaitingFunding,
            funded_amount: 0,
            origin_tx_hash: None,
            last_intents_status: None,
            failure_reason: None,
            updated_at_ms: now_ms,
        };

        self.deposits.insert(&deposit_id, &deposit);
        self.deposit_funding.insert(&deposit_id, &funding);
        self.insert_account_deposit(&depositor, deposit_id);
        self.deposit_intents.insert(
            &deposit_id,
            &UnorderedSet::new(format!("di:{}", deposit_id).as_bytes()),
        );

        env::log_str(&format!("V2 deposit intent registered: {}", deposit_id));
        deposit_id
    }

    pub fn cancel_deposit_intent_v2(&mut self, deposit_id: u64) {
        let caller = env::predecessor_account_id();
        let deposit = self.deposits.get(&deposit_id).expect("Deposit not found");
        let mut funding = self
            .deposit_funding
            .get(&deposit_id)
            .expect("V2 funding metadata not found");

        assert!(self.is_deposit_manager(&caller, &deposit), "Unauthorized");
        assert_eq!(
            funding.status,
            FundingStatus::AwaitingFunding,
            "Deposit is no longer cancelable"
        );

        funding.status = FundingStatus::Cancelled;
        funding.failure_reason = Some("Cancelled by seller".to_string());
        funding.updated_at_ms = self.now_ms();
        self.deposit_funding.insert(&deposit_id, &funding);

        self.remove_open_listing(&funding.asset_id, deposit_id);
        env::log_str(&format!("V2 deposit intent cancelled: {}", deposit_id));
    }

    pub fn oracle_set_quote_v2(
        &mut self,
        deposit_id: u64,
        quote_id: String,
        deposit_address: String,
        deposit_memo: Option<String>,
        quote_expires_at_ms: u64,
    ) {
        self.assert_oracle();
        self.deposits.get(&deposit_id).expect("Deposit not found");

        let mut funding = self
            .deposit_funding
            .get(&deposit_id)
            .expect("V2 funding metadata not found");

        if funding.status != FundingStatus::AwaitingFunding {
            return;
        }

        assert!(
            funding.quote_generation < self.max_quote_rotations,
            "Maximum quote rotations reached"
        );

        let now_ms = self.now_ms();
        if funding.funding_started_at_ms == 0 {
            funding.funding_started_at_ms = now_ms;
            funding.topup_deadline_at_ms = now_ms.saturating_add(self.topup_window_ms);
        }

        if now_ms >= funding.topup_deadline_at_ms {
            funding.status = FundingStatus::TopUpExpired;
            funding.failure_reason = Some("Top-up window already expired".to_string());
            funding.updated_at_ms = now_ms;
            self.deposit_funding.insert(&deposit_id, &funding);
            self.remove_open_listing(&funding.asset_id, deposit_id);
            return;
        }

        funding.quote_id = Some(quote_id);
        funding.deposit_address = Some(deposit_address);
        funding.deposit_memo = deposit_memo.and_then(|memo| {
            let trimmed = memo.trim();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed.to_string())
            }
        });
        funding.quote_expires_at_ms = quote_expires_at_ms;
        funding.quote_generation = funding.quote_generation.saturating_add(1);
        funding.last_intents_status = Some("PENDING_DEPOSIT".to_string());
        funding.updated_at_ms = now_ms;

        self.deposit_funding.insert(&deposit_id, &funding);
        env::log_str(&format!("V2 quote set for deposit {}", deposit_id));
    }

    pub fn oracle_mark_quote_expired_v2(&mut self, deposit_id: u64, quote_id: String) {
        self.assert_oracle();

        let mut funding = self
            .deposit_funding
            .get(&deposit_id)
            .expect("V2 funding metadata not found");

        if funding.status != FundingStatus::AwaitingFunding {
            return;
        }

        if let Some(current_quote_id) = &funding.quote_id {
            if current_quote_id != &quote_id {
                return;
            }
        }

        let now_ms = self.now_ms();
        funding.quote_id = None;
        funding.deposit_address = None;
        funding.deposit_memo = None;
        funding.quote_expires_at_ms = 0;
        funding.last_intents_status = Some("QUOTE_EXPIRED".to_string());
        funding.updated_at_ms = now_ms;

        if funding.topup_deadline_at_ms > 0 && now_ms >= funding.topup_deadline_at_ms {
            funding.status = FundingStatus::TopUpExpired;
            funding.failure_reason = Some("Top-up window expired".to_string());
            self.remove_open_listing(&funding.asset_id, deposit_id);
        }

        self.deposit_funding.insert(&deposit_id, &funding);
    }

    pub fn oracle_confirm_funding_v2(
        &mut self,
        deposit_id: u64,
        quote_id: String,
        funded_amount: U128,
        origin_tx_hash: String,
        intents_status: String,
    ) {
        let funded_amount = funded_amount.0;
        self.assert_oracle();
        assert!(funded_amount > 0, "funded_amount must be > 0");

        let mut deposit = self.deposits.get(&deposit_id).expect("Deposit not found");
        let mut funding = self
            .deposit_funding
            .get(&deposit_id)
            .expect("V2 funding metadata not found");

        if funding.status == FundingStatus::Funded {
            return;
        }

        assert_eq!(
            funding.status,
            FundingStatus::AwaitingFunding,
            "Deposit is not awaiting funding"
        );
        assert!(
            funding.topup_deadline_at_ms > 0,
            "Funding window not started"
        );
        assert!(
            self.now_ms() <= funding.topup_deadline_at_ms,
            "Top-up deadline has passed"
        );

        if let Some(current_quote_id) = &funding.quote_id {
            assert_eq!(current_quote_id, &quote_id, "Stale quote id");
        }

        funding.status = FundingStatus::Funded;
        funding.funded_amount = funded_amount;
        funding.origin_tx_hash = Some(origin_tx_hash);
        funding.last_intents_status = Some(intents_status);
        funding.failure_reason = None;
        funding.updated_at_ms = self.now_ms();

        deposit.total_deposit = funded_amount;
        deposit.remaining_deposits = funded_amount;
        if deposit.min_intent_amount > funded_amount {
            deposit.min_intent_amount = funded_amount;
        }
        if deposit.max_intent_amount > funded_amount {
            deposit.max_intent_amount = funded_amount;
        }
        if deposit.max_intent_amount < deposit.min_intent_amount {
            deposit.max_intent_amount = deposit.min_intent_amount;
        }

        self.deposit_funding.insert(&deposit_id, &funding);
        self.deposits.insert(&deposit_id, &deposit);

        self.add_open_listing(&funding.asset_id, deposit_id);
        env::log_str(&format!("V2 funding confirmed for deposit {}", deposit_id));
    }

    pub fn oracle_mark_failed_v2(
        &mut self,
        deposit_id: u64,
        quote_id: String,
        intents_status: String,
        reason: String,
    ) {
        self.assert_oracle();

        let mut funding = self
            .deposit_funding
            .get(&deposit_id)
            .expect("V2 funding metadata not found");

        if funding.status == FundingStatus::Failed {
            return;
        }
        if funding.status != FundingStatus::AwaitingFunding {
            return;
        }

        if let Some(current_quote_id) = &funding.quote_id {
            if current_quote_id != &quote_id {
                return;
            }
        }

        funding.status = FundingStatus::Failed;
        funding.last_intents_status = Some(intents_status);
        funding.failure_reason = Some(reason);
        funding.updated_at_ms = self.now_ms();

        self.deposit_funding.insert(&deposit_id, &funding);
        self.remove_open_listing(&funding.asset_id, deposit_id);
    }

    pub fn oracle_mark_topup_expired_v2(
        &mut self,
        deposit_id: u64,
        quote_id: String,
        reason: String,
    ) {
        self.assert_oracle();

        let mut funding = self
            .deposit_funding
            .get(&deposit_id)
            .expect("V2 funding metadata not found");

        if funding.status == FundingStatus::TopUpExpired {
            return;
        }
        if funding.status != FundingStatus::AwaitingFunding {
            return;
        }

        if let Some(current_quote_id) = &funding.quote_id {
            if current_quote_id != &quote_id {
                return;
            }
        }

        funding.status = FundingStatus::TopUpExpired;
        funding.failure_reason = Some(reason);
        funding.updated_at_ms = self.now_ms();

        self.deposit_funding.insert(&deposit_id, &funding);
        self.remove_open_listing(&funding.asset_id, deposit_id);
    }

    // === ORCHESTRATOR FUNCTIONS (V1 + V2 listing compatibility) ===

    #[payable]
    pub fn signal_intent(
        &mut self,
        deposit_id: u64,
        amount: U128,
        payment_method: String,
        currency_code: String,
        recipient: String,
        chain: String,
    ) -> String {
        let amount = amount.0;
        let buyer = env::predecessor_account_id();
        let mut deposit = self.deposits.get(&deposit_id).expect("Deposit not found");

        if let Some(funding) = self.deposit_funding.get(&deposit_id) {
            assert_eq!(
                funding.status,
                FundingStatus::Funded,
                "Listing is not funded"
            );
        }

        assert!(amount >= deposit.min_intent_amount, "Amount below minimum");
        assert!(amount <= deposit.max_intent_amount, "Amount above maximum");
        assert!(
            deposit.remaining_deposits >= amount,
            "Insufficient liquidity"
        );
        assert!(
            deposit.payment_methods.contains(&payment_method),
            "Payment method not supported"
        );

        let deposit_intent_vec = self.deposit_intents.get(&deposit_id).unwrap();
        assert!(
            deposit_intent_vec.len() < self.max_intents_per_deposit as u64,
            "Max intents reached"
        );

        deposit.remaining_deposits -= amount;
        deposit.outstanding_intents += amount;
        self.deposits.insert(&deposit_id, &deposit);
        self.sync_open_listing_state(deposit_id, &deposit);

        self.intent_counter += 1;
        let intent_hash = format!("intent:{}", self.intent_counter);

        let intent = Intent {
            intent_hash: intent_hash.clone(),
            buyer: buyer.clone(),
            deposit_id,
            amount,
            timestamp: env::block_timestamp(),
            payment_method,
            currency_code,
            status: IntentStatus::Signaled,
            recipient,
            chain,
        };

        self.intents.insert(&intent_hash, &intent);

        let mut buyer_intents = self
            .account_intents
            .get(&buyer)
            .unwrap_or_else(|| UnorderedSet::new(format!("ui:{}", buyer).as_bytes()));
        buyer_intents.insert(&intent_hash);
        self.account_intents.insert(&buyer, &buyer_intents);

        let mut deposit_intent_set = self.deposit_intents.get(&deposit_id).unwrap();
        deposit_intent_set.insert(&intent_hash);
        self.deposit_intents
            .insert(&deposit_id, &deposit_intent_set);

        env::log_str(&format!("Intent signaled: {}", intent_hash));
        intent_hash
    }

    pub fn cancel_intent(&mut self, intent_hash: String) {
        let caller = env::predecessor_account_id();
        let mut intent = self.intents.get(&intent_hash).expect("Intent not found");

        assert!(intent.buyer == caller, "Only buyer can cancel");
        assert!(
            intent.status == IntentStatus::Signaled,
            "Intent not in signaled state"
        );

        let mut deposit = self.deposits.get(&intent.deposit_id).unwrap();
        deposit.remaining_deposits += intent.amount;
        deposit.outstanding_intents -= intent.amount;
        self.deposits.insert(&intent.deposit_id, &deposit);
        self.sync_open_listing_state(intent.deposit_id, &deposit);

        intent.status = IntentStatus::Cancelled;
        self.intents.insert(&intent_hash, &intent);

        env::log_str(&format!("Intent cancelled: {}", intent_hash));
    }

    pub fn fulfill_intent(&mut self, intent_hash: String) -> Promise {
        let mut intent = self.intents.get(&intent_hash).expect("Intent not found");
        assert!(
            intent.status == IntentStatus::Signaled,
            "Intent not in signaled state"
        );

        intent.status = IntentStatus::Fulfilled;
        self.intents.insert(&intent_hash, &intent);

        let mut deposit = self.deposits.get(&intent.deposit_id).unwrap();
        deposit.outstanding_intents -= intent.amount;
        self.deposits.insert(&intent.deposit_id, &deposit);

        env::log_str(&format!("Intent fulfilled: {}", intent_hash));
        self.sign_transaction(intent)
    }

    pub fn fulfill_intent_with_proof(&mut self, intent_hash: String, proof: String) -> Promise {
        let normalized_proof = proof.trim();
        assert!(!normalized_proof.is_empty(), "proof is required");
        assert!(
            normalized_proof.len() <= 8_192,
            "proof payload is too large"
        );

        env::log_str(&format!(
            "Intent proof submitted: {} ({} bytes)",
            intent_hash,
            normalized_proof.len()
        ));

        self.fulfill_intent(intent_hash)
    }

    pub fn release_intent(&mut self, intent_hash: String) -> Promise {
        let caller = env::predecessor_account_id();
        let mut intent = self.intents.get(&intent_hash).expect("Intent not found");
        let deposit = self.deposits.get(&intent.deposit_id).unwrap();

        assert!(self.is_deposit_manager(&caller, &deposit), "Unauthorized");
        assert!(
            intent.status == IntentStatus::Signaled,
            "Intent not in signaled state"
        );

        intent.status = IntentStatus::Released;
        self.intents.insert(&intent_hash, &intent);

        let mut deposit = self.deposits.get(&intent.deposit_id).unwrap();
        deposit.outstanding_intents -= intent.amount;
        self.deposits.insert(&intent.deposit_id, &deposit);

        env::log_str(&format!("Intent released: {}", intent_hash));
        self.sign_transaction(intent)
    }

    // === PAYMENT METHOD REGISTRY ===

    pub fn add_payment_method(&mut self, name: String, verifier: String, currencies: Vec<String>) {
        self.assert_owner();
        assert!(!currencies.is_empty(), "At least one currency required");

        let pm = PaymentMethod {
            name: name.clone(),
            verifier,
            currencies,
            initialized: true,
        };

        self.payment_methods.insert(&name, &pm);
        env::log_str(&format!("Payment method added: {}", name));
    }

    pub fn remove_payment_method(&mut self, name: String) {
        self.assert_owner();
        self.payment_methods.remove(&name);
        env::log_str(&format!("Payment method removed: {}", name));
    }

    // === VIEW FUNCTIONS ===

    pub fn get_owner(&self) -> AccountId {
        self.owner_id.clone()
    }

    pub fn get_payment_method(&self, name: String) -> Option<PaymentMethod> {
        self.payment_methods.get(&name)
    }

    pub fn get_deposit(&self, deposit_id: u64) -> Option<Deposit> {
        self.deposits.get(&deposit_id)
    }

    pub fn get_account_deposits(&self, account_id: AccountId) -> Vec<u64> {
        self.account_deposits
            .get(&account_id)
            .map(|set| set.to_vec())
            .unwrap_or_else(|| vec![])
    }

    pub fn get_intent(&self, intent_hash: String) -> Option<Intent> {
        self.intents.get(&intent_hash)
    }

    pub fn get_intent_transfer_details(&self, intent_hash: String) -> Option<IntentTransferDetailsView> {
        let intent = self.intents.get(&intent_hash)?;
        let (platform, tagname) = Self::parse_payment_method(&intent.payment_method);
        Some(IntentTransferDetailsView {
            intent_hash: intent.intent_hash.clone(),
            deposit_id: intent.deposit_id,
            amount: intent.amount,
            currency_code: intent.currency_code.clone(),
            payment_method_raw: intent.payment_method.clone(),
            platform,
            tagname,
            memo: Self::build_intent_transfer_memo(&intent.intent_hash, intent.deposit_id),
        })
    }

    pub fn get_account_intents(&self, account_id: AccountId) -> Vec<String> {
        self.account_intents
            .get(&account_id)
            .map(|set| set.to_vec())
            .unwrap_or_else(|| vec![])
    }

    pub fn get_deposit_intents(&self, deposit_id: u64) -> Vec<String> {
        self.deposit_intents
            .get(&deposit_id)
            .map(|set| set.to_vec())
            .unwrap_or_else(|| vec![])
    }

    pub fn get_deposit_funding_v2(&self, deposit_id: u64) -> Option<DepositFundingMeta> {
        self.deposit_funding.get(&deposit_id)
    }

    pub fn get_open_deposits_by_asset_v2(
        &self,
        asset_id: String,
        from_index: Option<u64>,
        limit: Option<u64>,
    ) -> Vec<DepositSummaryV2> {
        let start = from_index.unwrap_or(0) as usize;
        let limit = self.normalized_limit(limit);

        let mut deposit_ids = self
            .open_deposits_by_asset
            .get(&asset_id)
            .map(|set| set.to_vec())
            .unwrap_or_default();

        deposit_ids.sort_unstable_by(|a, b| b.cmp(a));

        deposit_ids
            .into_iter()
            .skip(start)
            .take(limit)
            .filter_map(|deposit_id| self.build_deposit_summary_v2(deposit_id))
            .filter(|summary| summary.asset_id == asset_id)
            .collect()
    }

    pub fn get_deposits_by_funding_status_v2(
        &self,
        status: FundingStatus,
        from_index: Option<u64>,
        limit: Option<u64>,
    ) -> Vec<u64> {
        let start = from_index.unwrap_or(0) as usize;
        let limit = self.normalized_limit(limit);

        let mut matched = Vec::new();

        for deposit_id in 1..=self.deposit_counter {
            if let Some(meta) = self.deposit_funding.get(&deposit_id) {
                if meta.status == status {
                    matched.push(deposit_id);
                }
            }
        }

        matched.into_iter().skip(start).take(limit).collect()
    }

    pub fn get_v2_config(&self) -> V2Config {
        V2Config {
            oracle_account_id: self.oracle_account_id.clone(),
            storage_fee_yocto: U128(self.v2_storage_fee_yocto),
            topup_window_ms: self.topup_window_ms,
            max_quote_rotations: self.max_quote_rotations,
        }
    }

    // === ADMIN FUNCTIONS ===

    pub fn set_protocol_fee(&mut self, fee: u128) {
        self.assert_owner();
        assert!(fee <= 500, "Fee cannot exceed 5%");
        self.protocol_fee = fee;
    }

    pub fn set_max_intents_per_deposit(&mut self, max: u8) {
        self.assert_owner();
        self.max_intents_per_deposit = max;
    }

    pub fn set_oracle_account_id(&mut self, oracle_account_id: AccountId) {
        self.assert_owner();
        self.oracle_account_id = oracle_account_id;
    }

    pub fn set_v2_storage_fee_yocto(&mut self, fee: U128) {
        self.assert_owner();
        self.v2_storage_fee_yocto = fee.0;
    }

    pub fn set_topup_window_ms(&mut self, topup_window_ms: u64) {
        self.assert_owner();
        assert!(topup_window_ms > 0, "topup_window_ms must be > 0");
        self.topup_window_ms = topup_window_ms;
    }

    pub fn set_max_quote_rotations(&mut self, max_quote_rotations: u16) {
        self.assert_owner();
        assert!(max_quote_rotations > 0, "max_quote_rotations must be > 0");
        self.max_quote_rotations = max_quote_rotations;
    }

    // === INTERNAL FUNCTIONS ===

    fn sign_transaction(&self, intent: Intent) -> Promise {
        env::log_str(&format!(
            "Requesting MPC signature for {} on {} via {}",
            intent.amount, intent.chain, MPC_CONTRACT_ID
        ));

        Promise::new(env::current_account_id())
    }

    fn assert_owner(&self) {
        assert_eq!(env::predecessor_account_id(), self.owner_id, "Owner only");
    }

    fn assert_oracle(&self) {
        assert_eq!(
            env::predecessor_account_id(),
            self.oracle_account_id,
            "Oracle only"
        );
    }

    fn now_ms(&self) -> u64 {
        env::block_timestamp_ms()
    }

    fn insert_account_deposit(&mut self, account_id: &AccountId, deposit_id: u64) {
        let mut user_deposits = self
            .account_deposits
            .get(account_id)
            .unwrap_or_else(|| UnorderedSet::new(format!("ud:{}", account_id).as_bytes()));
        user_deposits.insert(&deposit_id);
        self.account_deposits.insert(account_id, &user_deposits);
    }

    fn is_deposit_manager(&self, caller: &AccountId, deposit: &Deposit) -> bool {
        deposit.depositor == *caller || deposit.delegate.as_ref() == Some(caller)
    }

    fn open_set_key(asset_id: &str) -> Vec<u8> {
        let mut prefix = b"oa:".to_vec();
        prefix.extend(env::sha256(asset_id.as_bytes()));
        prefix
    }

    fn add_open_listing(&mut self, asset_id: &str, deposit_id: u64) {
        let mut set = self
            .open_deposits_by_asset
            .get(&asset_id.to_string())
            .unwrap_or_else(|| UnorderedSet::new(Self::open_set_key(asset_id)));
        set.insert(&deposit_id);
        self.open_deposits_by_asset
            .insert(&asset_id.to_string(), &set);
    }

    fn remove_open_listing(&mut self, asset_id: &str, deposit_id: u64) {
        if let Some(mut set) = self.open_deposits_by_asset.get(&asset_id.to_string()) {
            set.remove(&deposit_id);
            if set.is_empty() {
                self.open_deposits_by_asset.remove(&asset_id.to_string());
            } else {
                self.open_deposits_by_asset
                    .insert(&asset_id.to_string(), &set);
            }
        }
    }

    fn sync_open_listing_state(&mut self, deposit_id: u64, deposit: &Deposit) {
        if let Some(funding) = self.deposit_funding.get(&deposit_id) {
            if funding.status == FundingStatus::Funded && deposit.remaining_deposits > 0 {
                self.add_open_listing(&funding.asset_id, deposit_id);
            } else {
                self.remove_open_listing(&funding.asset_id, deposit_id);
            }
        }
    }

    fn build_deposit_summary_v2(&self, deposit_id: u64) -> Option<DepositSummaryV2> {
        let deposit = self.deposits.get(&deposit_id)?;
        let funding = self.deposit_funding.get(&deposit_id)?;

        if funding.status != FundingStatus::Funded || deposit.remaining_deposits == 0 {
            return None;
        }

        Some(DepositSummaryV2 {
            deposit_id,
            asset_id: funding.asset_id,
            depositor: deposit.depositor,
            delegate: deposit.delegate,
            payment_methods: deposit.payment_methods,
            min_intent_amount: deposit.min_intent_amount,
            max_intent_amount: deposit.max_intent_amount,
            funded_amount: funding.funded_amount,
            remaining_deposits: deposit.remaining_deposits,
            topup_deadline_at_ms: funding.topup_deadline_at_ms,
            quote_expires_at_ms: funding.quote_expires_at_ms,
            status: funding.status,
            updated_at_ms: funding.updated_at_ms,
        })
    }

    fn normalized_limit(&self, limit: Option<u64>) -> usize {
        let raw = limit.unwrap_or(50) as usize;
        raw.clamp(1, MAX_VIEW_LIMIT)
    }

    fn extract_payment_details(payment_methods: &[String]) -> Option<(String, String)> {
        for raw in payment_methods {
            let (platform, tagname) = Self::parse_payment_method(raw);
            if !platform.is_empty() && !tagname.is_empty() {
                return Some((platform, tagname));
            }
        }
        None
    }

    fn parse_payment_method(raw: &str) -> (String, String) {
        let normalized = raw.trim();
        if normalized.is_empty() {
            return (String::new(), String::new());
        }

        if let Some((left, right)) = normalized.split_once("::") {
            return (left.trim().to_lowercase(), right.trim().to_string());
        }

        (normalized.to_lowercase(), String::new())
    }

    fn build_intent_transfer_memo(intent_hash: &str, deposit_id: u64) -> String {
        let suffix = intent_hash.strip_prefix("intent:").unwrap_or(intent_hash);
        format!("anypay:{}:{}", deposit_id, suffix)
    }
}
