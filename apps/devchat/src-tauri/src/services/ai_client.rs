use crate::models::ChatMessage;
use anyhow::Context;
use futures_util::{stream, Stream, StreamExt};
use serde::Serialize;
use serde_json::{json, Value};
use std::collections::VecDeque;
use std::pin::Pin;

const ANTHROPIC_VERSION: &str = "2023-06-01";
const DEFAULT_MAX_TOKENS: u32 = 4096;

type ChatTextStream = Pin<Box<dyn Stream<Item = anyhow::Result<String>> + Send>>;
type ByteStream = Pin<Box<dyn Stream<Item = Result<Vec<u8>, reqwest::Error>> + Send>>;

pub struct AiClient {
    provider: String,
    base_url: String,
    api_key: String,
    model: String,
    http: reqwest::Client,
}

impl AiClient {
    pub fn new(provider: &str, base_url: &str, api_key: &str, model: &str) -> Self {
        Self {
            provider: provider.to_owned(),
            base_url: base_url.to_owned(),
            api_key: api_key.to_owned(),
            model: model.to_owned(),
            http: reqwest::Client::new(),
        }
    }

    pub async fn test_connection(&self) -> anyhow::Result<bool> {
        if self.provider != "claude"
            || self.api_key.trim().is_empty()
            || self.model.trim().is_empty()
        {
            return Ok(false);
        }

        let base_url = self.base_url.trim_end_matches('/');
        let response = self
            .http
            .post(format!("{base_url}/v1/messages"))
            .header("x-api-key", &self.api_key)
            .header("anthropic-version", ANTHROPIC_VERSION)
            .json(&json!({
                "model": self.model,
                "max_tokens": 8,
                "messages": [{ "role": "user", "content": "Reply ok." }]
            }))
            .send()
            .await?;

        Ok(response.status().is_success())
    }

    pub async fn chat_stream(
        &self,
        messages: &[ChatMessage],
        system_prompt: &str,
    ) -> anyhow::Result<ChatTextStream> {
        anyhow::ensure!(
            self.provider == "claude",
            "unsupported AI provider: {}",
            self.provider
        );
        anyhow::ensure!(!self.api_key.trim().is_empty(), "AI API key is required");
        anyhow::ensure!(!self.model.trim().is_empty(), "AI model is required");

        let request_messages = build_claude_messages(messages)?;
        let system_prompt = system_prompt.trim();
        let system = (!system_prompt.is_empty()).then_some(system_prompt);
        let base_url = self.base_url.trim_end_matches('/');
        let response = self
            .http
            .post(format!("{base_url}/v1/messages"))
            .header("x-api-key", &self.api_key)
            .header("anthropic-version", ANTHROPIC_VERSION)
            .json(&ClaudeMessagesRequest {
                model: &self.model,
                max_tokens: DEFAULT_MAX_TOKENS,
                stream: true,
                system,
                messages: request_messages,
            })
            .send()
            .await?
            .error_for_status()?;

        let byte_stream: ByteStream = Box::pin(
            response
                .bytes_stream()
                .map(|chunk| chunk.map(|bytes| bytes.to_vec())),
        );

        Ok(Box::pin(stream::unfold(
            SseStreamState::new(byte_stream),
            |state| state.next_item(),
        )))
    }
}

#[derive(Debug, Serialize)]
struct ClaudeMessagesRequest<'a> {
    model: &'a str,
    max_tokens: u32,
    stream: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    system: Option<&'a str>,
    messages: Vec<ClaudeMessage<'a>>,
}

#[derive(Debug, Serialize)]
struct ClaudeMessage<'a> {
    role: &'a str,
    content: &'a str,
}

fn build_claude_messages(messages: &[ChatMessage]) -> anyhow::Result<Vec<ClaudeMessage<'_>>> {
    let mut request_messages = Vec::new();

    for message in messages {
        let content = message.content.trim();
        if content.is_empty() {
            continue;
        }

        match message.role.as_str() {
            "user" | "assistant" => request_messages.push(ClaudeMessage {
                role: message.role.as_str(),
                content,
            }),
            "system" => {}
            role => anyhow::bail!("unsupported chat message role: {role}"),
        }
    }

    anyhow::ensure!(
        !request_messages.is_empty(),
        "at least one user or assistant message is required"
    );
    Ok(request_messages)
}

struct SseStreamState {
    byte_stream: ByteStream,
    buffer: Vec<u8>,
    queue: VecDeque<String>,
    done: bool,
}

impl SseStreamState {
    fn new(byte_stream: ByteStream) -> Self {
        Self {
            byte_stream,
            buffer: Vec::new(),
            queue: VecDeque::new(),
            done: false,
        }
    }

    async fn next_item(mut self) -> Option<(anyhow::Result<String>, Self)> {
        loop {
            if let Some(text) = self.queue.pop_front() {
                return Some((Ok(text), self));
            }

            if self.done {
                return None;
            }

            match self.byte_stream.next().await {
                Some(Ok(bytes)) => {
                    self.buffer.extend_from_slice(&bytes);
                    match drain_sse_text_deltas(&mut self.buffer) {
                        Ok(deltas) => self.queue.extend(deltas),
                        Err(error) => {
                            self.done = true;
                            return Some((Err(error), self));
                        }
                    }
                }
                Some(Err(error)) => {
                    self.done = true;
                    return Some((Err(error.into()), self));
                }
                None => {
                    self.done = true;
                    return None;
                }
            }
        }
    }
}

fn drain_sse_text_deltas(buffer: &mut Vec<u8>) -> anyhow::Result<Vec<String>> {
    let mut deltas = Vec::new();

    while let Some(event) = take_next_sse_event(buffer)? {
        if let Some(text) = parse_sse_text_delta(&event)? {
            deltas.push(text);
        }
    }

    Ok(deltas)
}

fn take_next_sse_event(buffer: &mut Vec<u8>) -> anyhow::Result<Option<String>> {
    let Some((index, delimiter_len)) = find_sse_delimiter(buffer) else {
        return Ok(None);
    };

    let event_bytes = buffer[..index].to_vec();
    let rest = buffer[index + delimiter_len..].to_vec();
    *buffer = rest;
    String::from_utf8(event_bytes)
        .map(Some)
        .context("Claude stream event was not valid UTF-8")
}

fn find_sse_delimiter(buffer: &[u8]) -> Option<(usize, usize)> {
    if let Some(index) = buffer.windows(4).position(|window| window == b"\r\n\r\n") {
        return Some((index, 4));
    }

    buffer
        .windows(2)
        .position(|window| window == b"\n\n")
        .map(|index| (index, 2))
}

fn parse_sse_text_delta(event: &str) -> anyhow::Result<Option<String>> {
    let data = event
        .lines()
        .filter_map(|line| line.strip_prefix("data:"))
        .map(str::trim_start)
        .collect::<Vec<_>>()
        .join("\n");

    if data.trim().is_empty() || data.trim() == "[DONE]" {
        return Ok(None);
    }

    let value: Value =
        serde_json::from_str(&data).context("Claude stream event had malformed JSON")?;
    match value.get("type").and_then(Value::as_str) {
        Some("content_block_delta") => {
            let delta_type = value.pointer("/delta/type").and_then(Value::as_str);
            if delta_type != Some("text_delta") {
                return Ok(None);
            }

            Ok(value
                .pointer("/delta/text")
                .and_then(Value::as_str)
                .filter(|text| !text.is_empty())
                .map(ToOwned::to_owned))
        }
        Some("error") => {
            let error_type = value
                .pointer("/error/type")
                .and_then(Value::as_str)
                .unwrap_or("unknown_error");
            let message = value
                .pointer("/error/message")
                .and_then(Value::as_str)
                .unwrap_or("Claude stream returned an error");
            anyhow::bail!("Claude stream error ({error_type}): {message}")
        }
        _ => Ok(None),
    }
}

#[cfg(test)]
mod tests {
    use super::{drain_sse_text_deltas, AiClient};
    use crate::models::ChatMessage;
    use futures_util::TryStreamExt;
    use std::net::SocketAddr;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use tokio::net::TcpListener;

    #[tokio::test]
    async fn rejects_unsupported_providers() {
        let client = AiClient::new("openai", "http://127.0.0.1:1", "secret", "test-model");
        assert!(!client.test_connection().await.unwrap());
    }

    #[tokio::test]
    async fn rejects_empty_api_keys() {
        let client = AiClient::new("claude", "http://127.0.0.1:1", "", "test-model");
        assert!(!client.test_connection().await.unwrap());
    }

    #[tokio::test]
    async fn accepts_successful_claude_messages_response() {
        let addr = spawn_claude_server(200).await;
        let client = AiClient::new(
            "claude",
            &format!("http://{addr}"),
            "secret",
            "claude-haiku-4-5-20251001",
        );
        assert!(client.test_connection().await.unwrap());
    }

    #[tokio::test]
    async fn rejects_failed_claude_messages_response() {
        let addr = spawn_claude_server(401).await;
        let client = AiClient::new(
            "claude",
            &format!("http://{addr}"),
            "secret",
            "claude-haiku-4-5-20251001",
        );
        assert!(!client.test_connection().await.unwrap());
    }

    #[tokio::test]
    async fn streams_text_deltas_from_claude_sse_response() {
        let body = concat!(
            "event: message_start\n",
            "data: {\"type\":\"message_start\",\"message\":{\"id\":\"msg_1\"}}\n\n",
            "event: content_block_delta\n",
            "data: {\"type\":\"content_block_delta\",\"delta\":{\"type\":\"text_delta\",\"text\":\"Hello \"}}\n\n",
            "event: ping\n",
            "data: {\"type\":\"ping\"}\n\n",
            "event: content_block_delta\n",
            "data: {\"type\":\"content_block_delta\",\"delta\":{\"type\":\"text_delta\",\"text\":\"world\"}}\n\n",
            "event: message_stop\n",
            "data: {\"type\":\"message_stop\"}\n\n"
        );
        let addr = spawn_claude_stream_server(body, |request| {
            assert!(request.starts_with("POST /v1/messages"));
            assert!(request.contains("anthropic-version: 2023-06-01"));
            assert!(request.contains("\"stream\":true"));
            assert!(request.contains("\"system\":\"Use repo context.\""));
            assert!(request.contains("\"role\":\"user\""));
            assert!(request.contains("\"content\":\"Fix the login form\""));
        })
        .await;
        let client = AiClient::new(
            "claude",
            &format!("http://{addr}"),
            "secret",
            "claude-haiku-4-5-20251001",
        );
        let messages = vec![ChatMessage {
            role: "user".into(),
            content: "Fix the login form".into(),
        }];

        let chunks = client
            .chat_stream(&messages, "Use repo context.")
            .await
            .unwrap()
            .try_collect::<Vec<_>>()
            .await
            .unwrap();

        assert_eq!(chunks, vec!["Hello ", "world"]);
    }

    #[tokio::test]
    async fn requires_real_user_or_assistant_messages_for_streaming() {
        let client = AiClient::new(
            "claude",
            "http://127.0.0.1:1",
            "secret",
            "claude-haiku-4-5-20251001",
        );
        let result = client.chat_stream(&[], "").await;
        let error = match result {
            Ok(_) => panic!("streaming should require at least one message"),
            Err(error) => error,
        };
        assert!(error.to_string().contains("at least one"));
    }

    #[test]
    fn parses_stream_error_events_as_errors() {
        let mut buffer = br#"event: error
data: {"type":"error","error":{"type":"overloaded_error","message":"try later"}}

"#
        .to_vec();

        let error = drain_sse_text_deltas(&mut buffer).unwrap_err();
        assert!(error.to_string().contains("overloaded_error"));
        assert!(error.to_string().contains("try later"));
    }

    #[test]
    fn reports_malformed_stream_events() {
        let mut buffer = b"event: content_block_delta\ndata: {bad-json}\n\n".to_vec();

        let error = drain_sse_text_deltas(&mut buffer).unwrap_err();
        assert!(error.to_string().contains("malformed JSON"));
    }

    async fn spawn_claude_server(status_code: u16) -> SocketAddr {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        tokio::spawn(async move {
            let (mut socket, _) = listener.accept().await.unwrap();
            let mut buffer = vec![0; 4096];
            let bytes = socket.read(&mut buffer).await.unwrap();
            let request = String::from_utf8_lossy(&buffer[..bytes]);
            assert!(request.starts_with("POST /v1/messages"));
            assert!(request.contains("anthropic-version: 2023-06-01"));
            assert!(request.contains("claude-haiku-4-5-20251001"));

            let body = r#"{"type":"message","content":[{"type":"text","text":"Ok."}]}"#;
            let response = format!(
                "HTTP/1.1 {status_code} OK\r\ncontent-type: application/json\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{body}",
                body.len()
            );
            socket.write_all(response.as_bytes()).await.unwrap();
        });
        addr
    }

    async fn spawn_claude_stream_server<F>(body: &'static str, assert_request: F) -> SocketAddr
    where
        F: FnOnce(&str) + Send + 'static,
    {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        tokio::spawn(async move {
            let (mut socket, _) = listener.accept().await.unwrap();
            let mut buffer = vec![0; 8192];
            let bytes = socket.read(&mut buffer).await.unwrap();
            let request = String::from_utf8_lossy(&buffer[..bytes]);
            assert_request(&request);

            let response = format!(
                "HTTP/1.1 200 OK\r\ncontent-type: text/event-stream\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{body}",
                body.len()
            );
            socket.write_all(response.as_bytes()).await.unwrap();
        });
        addr
    }
}
