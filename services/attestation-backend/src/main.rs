mod attestation;
mod prover;
mod types;
mod verifier;
mod ws;

use attestation::{AttestationService, VerifierWebhookPayload};
use axum::{
    extract::ws::{WebSocket, WebSocketUpgrade},
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use std::net::SocketAddr;
use std::sync::Arc;
use tower_http::cors::CorsLayer;
use verifier::verifier;
use ws::WsStream;

#[derive(Clone)]
struct AppState {
    service: Arc<AttestationService>,
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt::init();

    let service =
        Arc::new(AttestationService::from_env().expect("failed to initialize attestation service"));
    let state = AppState { service };

    let app = Router::new()
        .route("/health", get(health))
        .route("/attestation/public-key", get(public_key))
        .route(
            "/attestations/session/:session_id",
            get(attestation_by_session),
        )
        .route(
            "/attestations/intent/:intent_id",
            get(attestation_by_intent),
        )
        .route("/webhook/tlsn-verifier", post(webhook_tlsn_verifier))
        .route("/verify", get(ws_handler))
        .layer(CorsLayer::permissive())
        .with_state(state);

    let addr = SocketAddr::from(([127, 0, 0, 1], 3101));
    tracing::info!("Attestation service listening on {}", addr);
    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

async fn health() -> impl IntoResponse {
    Json(serde_json::json!({
        "status": "ok",
        "service": "anypay-attestation-backend",
    }))
}

async fn public_key(State(state): State<AppState>) -> impl IntoResponse {
    Json(state.service.public_key_view())
}

async fn attestation_by_session(
    State(state): State<AppState>,
    Path(session_id): Path<String>,
) -> impl IntoResponse {
    match state.service.get_by_session(session_id.trim()).await {
        Some(record) => (StatusCode::OK, Json(record)).into_response(),
        None => (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({ "error": "attestation not found for session" })),
        )
            .into_response(),
    }
}

async fn attestation_by_intent(
    State(state): State<AppState>,
    Path(intent_id): Path<String>,
) -> impl IntoResponse {
    match state.service.get_by_intent(intent_id.trim()).await {
        Some(record) => (StatusCode::OK, Json(record)).into_response(),
        None => (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({ "error": "attestation not found for intent" })),
        )
            .into_response(),
    }
}

async fn webhook_tlsn_verifier(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<VerifierWebhookPayload>,
) -> impl IntoResponse {
    let provided_secret = headers
        .get("x-attestation-webhook-secret")
        .and_then(|value| value.to_str().ok());
    if !state.service.validate_webhook_secret(provided_secret) {
        return (
            StatusCode::UNAUTHORIZED,
            Json(serde_json::json!({ "error": "invalid webhook secret" })),
        )
            .into_response();
    }

    match state.service.create_from_webhook(payload).await {
        Ok(record) => (StatusCode::OK, Json(record)).into_response(),
        Err(error) => (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "error": error.to_string() })),
        )
            .into_response(),
    }
}

async fn ws_handler(ws: WebSocketUpgrade) -> Response {
    ws.on_upgrade(handle_socket)
}

async fn handle_socket(socket: WebSocket) {
    tracing::info!("New WebSocket /verify connection");

    // Wrap WebSocket in our WsStream adapter (AsyncRead + AsyncWrite)
    let stream = WsStream::new(socket);

    // Run the TLSNotary Verifier protocol
    match verifier(stream).await {
        Ok(_transcript) => tracing::info!("✅ /verify verification success"),
        Err(e) => {
            tracing::error!("❌ /verify verification failed: {:?}", e);
        }
    }
}
