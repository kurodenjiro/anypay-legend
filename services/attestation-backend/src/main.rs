mod prover;
mod types;
mod verifier;
mod ws;

use axum::{
    extract::ws::{WebSocket, WebSocketUpgrade},
    response::Response,
    routing::get,
    Router,
};
use std::net::SocketAddr;
use verifier::verifier;
use ws::WsStream;

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt::init();

    let app = Router::new().route("/verify", get(ws_handler));

    let addr = SocketAddr::from(([127, 0, 0, 1], 3000));
    tracing::info!("Attestation Service listening on {}", addr);
    
    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

async fn ws_handler(ws: WebSocketUpgrade) -> Response {
    ws.on_upgrade(handle_socket)
}

async fn handle_socket(socket: WebSocket) {
    tracing::info!("New WebSocket connection");
    
    // Wrap WebSocket in our WsStream adapter (AsyncRead + AsyncWrite)
    let stream = WsStream::new(socket);

    // Run the TLSNotary Verifier protocol
    match verifier(stream).await {
        Ok(_transcript) => {
            tracing::info!("✅ Verification success!");
            // In a real implementation, we would sign the attestation here
            // and maybe send it back if the socket wasn't closed by verifier logic.
        }
        Err(e) => {
            tracing::error!("❌ Verification failed: {:?}", e);
        }
    }
}
