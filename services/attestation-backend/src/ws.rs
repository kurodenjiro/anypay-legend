use std::io::{Result, Error, ErrorKind};
use std::pin::Pin;
use std::task::{Context, Poll};
use axum::extract::ws::{Message, WebSocket};
use bytes::{Bytes, Buf};
use futures::{StreamExt, SinkExt};
use tokio::io::{AsyncRead, AsyncWrite, ReadBuf};

pub struct WsStream {
    ws: WebSocket,
    read_buf: Bytes,
}

impl WsStream {
    pub fn new(ws: WebSocket) -> Self {
        Self {
            ws,
            read_buf: Bytes::new(),
        }
    }
}

impl AsyncRead for WsStream {
    fn poll_read(
        mut self: Pin<&mut Self>,
        cx: &mut Context<'_>,
        buf: &mut ReadBuf<'_>,
    ) -> Poll<Result<()>> {
        loop {
            // If we have data in the buffer, return it
            if self.read_buf.has_remaining() {
                let len = std::cmp::min(self.read_buf.remaining(), buf.remaining());
                buf.put_slice(&self.read_buf[..len]);
                self.read_buf.advance(len);
                return Poll::Ready(Ok(()));
            }

            // Otherwise, try to receive a new message
            match self.ws.poll_next_unpin(cx) {
                Poll::Ready(Some(Ok(msg))) => match msg {
                    Message::Binary(data) => {
                        self.read_buf = Bytes::from(data);
                        continue; // Loop back to copy data to buf
                    }
                    Message::Text(_) => {
                        // TLSN protocol is binary, but maybe log warning?
                        continue;
                    }
                    Message::Ping(_) | Message::Pong(_) => continue, // Axum handles these?
                    Message::Close(_) => return Poll::Ready(Ok(())), // EOF
                },
                Poll::Ready(Some(Err(e))) => {
                    return Poll::Ready(Err(std::io::Error::new(ErrorKind::Other, e.to_string())));
                }
                Poll::Ready(None) => return Poll::Ready(Ok(())), // EOF
                Poll::Pending => return Poll::Pending,
            }
        }
    }
}

impl AsyncWrite for WsStream {
    fn poll_write(
        mut self: Pin<&mut Self>,
        cx: &mut Context<'_>,
        buf: &[u8],
    ) -> Poll<Result<usize>> {
        // We can't easily partially write a message in WS, so we assume the buf is a full frame or we send it as one.
        // For streams, this might be inefficient if buf is huge, or wrong if protocol expects fragmentation.
        // TLSN usually sends frames that fit in memory.
        
        let msg = Message::Binary(buf.to_vec());
        match self.ws.poll_ready_unpin(cx) {
            Poll::Ready(Ok(())) => {
                match self.ws.start_send_unpin(msg) {
                    Ok(()) => {
                        // We must return expected number of bytes written. 
                        // Since we queued the whole buffer, we say we wrote it all.
                        Poll::Ready(Ok(buf.len()))
                    },
                    Err(e) => Poll::Ready(Err(Error::new(ErrorKind::Other, e.to_string()))),
                }
            }
            Poll::Ready(Err(e)) => Poll::Ready(Err(Error::new(ErrorKind::Other, e.to_string()))),
            Poll::Pending => Poll::Pending,
        }
    }

    fn poll_flush(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Result<()>> {
        match self.ws.poll_flush_unpin(cx) {
            Poll::Ready(Ok(())) => Poll::Ready(Ok(())),
            Poll::Ready(Err(e)) => Poll::Ready(Err(Error::new(ErrorKind::Other, e.to_string()))),
            Poll::Pending => Poll::Pending,
        }
    }

    fn poll_shutdown(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Result<()>> {
        match self.ws.poll_close_unpin(cx) {
            Poll::Ready(Ok(())) => Poll::Ready(Ok(())),
            Poll::Ready(Err(e)) => Poll::Ready(Err(Error::new(ErrorKind::Other, e.to_string()))),
            Poll::Pending => Poll::Pending,
        }
    }
}
