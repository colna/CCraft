use crate::models::ChatMessage;
use anyhow::Context;
use futures_util::{stream, Stream, StreamExt};
use reqwest::{RequestBuilder, Response};
use serde::Serialize;
use serde_json::{json, Value};
use std::collections::VecDeque;
use std::pin::Pin;

const ANTHROPIC_VERSION: &str = "2023-06-01";
const ANTHROPIC_BETA: &str = "claude-code-20250219,interleaved-thinking-2025-05-14";
const CLAUDE_CLI_USER_AGENT: &str = "claude-cli/2.1.2 (external, cli)";
const DEFAULT_MAX_TOKENS: u32 = 4096;
const CONNECTION_TEST_MAX_TOKENS: u32 = 1;

type ChatTextStream = Pin<Box<dyn Stream<Item = anyhow::Result<String>> + Send>>;
type ByteStream = Pin<Box<dyn Stream<Item = Result<Vec<u8>, reqwest::Error>> + Send>>;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum AiProvider {
    Claude,
    OpenAiCompatible,
}

impl AiProvider {
    fn parse(provider: &str) -> anyhow::Result<Self> {
        match provider.trim() {
            "claude" => Ok(Self::Claude),
            "openai-compatible" => Ok(Self::OpenAiCompatible),
            _ => anyhow::bail!("unsupported AI provider: {}", provider),
        }
    }

    fn stream_name(self) -> &'static str {
        match self {
            Self::Claude => "Claude",
            Self::OpenAiCompatible => "OpenAI-compatible",
        }
    }
}

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
        let Ok(provider) = AiProvider::parse(&self.provider) else {
            return Ok(false);
        };

        if self.api_key.trim().is_empty() || self.model.trim().is_empty() {
            return Ok(false);
        }

        let base_url = self.base_url.trim_end_matches('/');
        let response = match provider {
            AiProvider::Claude => {
                apply_claude_compatible_headers(
                    self.http.post(append_endpoint(base_url, "/v1/messages")),
                )
                .header("x-api-key", &self.api_key)
                .json(&json!({
                    "model": self.model,
                    "max_tokens": CONNECTION_TEST_MAX_TOKENS,
                    "messages": [{ "role": "user", "content": "Reply ok." }],
                    "stream": true
                }))
                .send()
                .await?
            }
            AiProvider::OpenAiCompatible => {
                self.http
                    .post(append_endpoint(base_url, "/v1/chat/completions"))
                    .bearer_auth(&self.api_key)
                    .header("content-type", "application/json")
                    .header("accept", "text/event-stream")
                    .header("accept-encoding", "identity")
                    .json(&OpenAiChatCompletionRequest {
                        model: &self.model,
                        max_tokens: Some(CONNECTION_TEST_MAX_TOKENS),
                        stream: true,
                        messages: vec![OpenAiMessage {
                            role: "user",
                            content: "Reply ok.",
                        }],
                    })
                    .send()
                    .await?
            }
        };
        if !response.status().is_success() {
            return Ok(false);
        }

        validate_connection_response(provider, response).await
    }

    pub async fn chat_stream(
        &self,
        messages: &[ChatMessage],
        system_prompt: &str,
    ) -> anyhow::Result<ChatTextStream> {
        let provider = AiProvider::parse(&self.provider)?;
        anyhow::ensure!(!self.api_key.trim().is_empty(), "AI API key is required");
        anyhow::ensure!(!self.model.trim().is_empty(), "AI model is required");

        let base_url = self.base_url.trim_end_matches('/');
        let response = match provider {
            AiProvider::Claude => {
                let request_messages = build_claude_messages(messages)?;
                let system_prompt = system_prompt.trim();
                let system = (!system_prompt.is_empty()).then_some(system_prompt);
                apply_claude_compatible_headers(
                    self.http.post(append_endpoint(base_url, "/v1/messages")),
                )
                .header("x-api-key", &self.api_key)
                .json(&ClaudeMessagesRequest {
                    model: &self.model,
                    max_tokens: DEFAULT_MAX_TOKENS,
                    stream: true,
                    system,
                    messages: request_messages,
                })
                .send()
                .await?
                .error_for_status()?
            }
            AiProvider::OpenAiCompatible => {
                let request_messages = build_openai_messages(messages, system_prompt)?;
                self.http
                    .post(append_endpoint(base_url, "/v1/chat/completions"))
                    .bearer_auth(&self.api_key)
                    .header("content-type", "application/json")
                    .json(&OpenAiChatCompletionRequest {
                        model: &self.model,
                        max_tokens: None,
                        stream: true,
                        messages: request_messages,
                    })
                    .send()
                    .await?
                    .error_for_status()?
            }
        };

        let byte_stream: ByteStream = Box::pin(
            response
                .bytes_stream()
                .map(|chunk| chunk.map(|bytes| bytes.to_vec())),
        );

        Ok(Box::pin(stream::unfold(
            SseStreamState::new(byte_stream, provider),
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

#[derive(Debug, Serialize)]
struct OpenAiChatCompletionRequest<'a> {
    model: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    max_tokens: Option<u32>,
    stream: bool,
    messages: Vec<OpenAiMessage<'a>>,
}

#[derive(Debug, Serialize)]
struct OpenAiMessage<'a> {
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

fn build_openai_messages<'a>(
    messages: &'a [ChatMessage],
    system_prompt: &'a str,
) -> anyhow::Result<Vec<OpenAiMessage<'a>>> {
    let mut request_messages = Vec::new();
    let system_prompt = system_prompt.trim();

    if !system_prompt.is_empty() {
        request_messages.push(OpenAiMessage {
            role: "system",
            content: system_prompt,
        });
    }

    let mut has_conversation_message = false;
    for message in messages {
        let content = message.content.trim();
        if content.is_empty() {
            continue;
        }

        match message.role.as_str() {
            "user" | "assistant" | "system" => {
                if message.role != "system" {
                    has_conversation_message = true;
                }
                request_messages.push(OpenAiMessage {
                    role: message.role.as_str(),
                    content,
                });
            }
            role => anyhow::bail!("unsupported chat message role: {role}"),
        }
    }

    anyhow::ensure!(
        has_conversation_message,
        "at least one user or assistant message is required"
    );
    Ok(request_messages)
}

async fn validate_connection_response(
    provider: AiProvider,
    response: Response,
) -> anyhow::Result<bool> {
    if response
        .headers()
        .get("content-type")
        .and_then(|value| value.to_str().ok())
        .is_some_and(|content_type| content_type.contains("text/event-stream"))
    {
        return validate_connection_stream(provider, response).await;
    }

    let value: Value = response.json().await.with_context(|| {
        format!(
            "{} connection response was not valid JSON",
            provider.stream_name()
        )
    })?;
    Ok(validate_connection_json(provider, &value))
}

async fn validate_connection_stream(
    provider: AiProvider,
    response: Response,
) -> anyhow::Result<bool> {
    let mut stream = response.bytes_stream();
    let mut buffer = Vec::new();

    while let Some(chunk) = stream.next().await {
        buffer.extend_from_slice(&chunk?);
        let batch = drain_sse_text_deltas(&mut buffer, provider)?;
        if !batch.deltas.is_empty() || batch.done {
            return Ok(true);
        }
    }

    Ok(false)
}

fn validate_connection_json(provider: AiProvider, value: &Value) -> bool {
    match provider {
        AiProvider::Claude => {
            value.get("type").and_then(Value::as_str) == Some("message")
                && value
                    .get("content")
                    .and_then(Value::as_array)
                    .is_some_and(|content| {
                        content.iter().any(|block| {
                            block.get("type").and_then(Value::as_str) == Some("text")
                                && block.get("text").and_then(Value::as_str).is_some()
                        })
                    })
        }
        AiProvider::OpenAiCompatible => {
            value
                .get("choices")
                .and_then(Value::as_array)
                .is_some_and(|choices| {
                    choices.iter().any(|choice| {
                        choice
                            .pointer("/message/content")
                            .and_then(Value::as_str)
                            .is_some()
                    })
                })
        }
    }
}

fn apply_claude_compatible_headers(request: RequestBuilder) -> RequestBuilder {
    request
        .header("anthropic-version", ANTHROPIC_VERSION)
        .header("anthropic-beta", ANTHROPIC_BETA)
        .header("anthropic-dangerous-direct-browser-access", "true")
        .header("content-type", "application/json")
        .header("accept", "application/json")
        .header("accept-encoding", "identity")
        .header("accept-language", "*")
        .header("user-agent", CLAUDE_CLI_USER_AGENT)
        .header("x-app", "cli")
        .header("x-stainless-lang", "js")
        .header("x-stainless-package-version", "0.70.0")
        .header("x-stainless-runtime", "node")
        .header("x-stainless-runtime-version", "v22.20.0")
        .header("x-stainless-retry-count", "0")
        .header("x-stainless-timeout", "600")
        .header("sec-fetch-mode", "cors")
        .header("x-stainless-os", os_name())
        .header("x-stainless-arch", arch_name())
}

fn os_name() -> &'static str {
    match std::env::consts::OS {
        "macos" => "MacOS",
        "linux" => "Linux",
        "windows" => "Windows",
        other => other,
    }
}

fn arch_name() -> &'static str {
    match std::env::consts::ARCH {
        "aarch64" => "arm64",
        "x86_64" => "x86_64",
        "x86" => "x86",
        other => other,
    }
}

fn append_endpoint(base_url: &str, endpoint: &str) -> String {
    let base = base_url.trim_end_matches('/');
    let endpoint_without_version = endpoint.trim_start_matches("/v1/");
    if base.ends_with("/v1") {
        format!("{base}/{endpoint_without_version}")
    } else {
        format!("{base}{endpoint}")
    }
}

struct SseStreamState {
    provider: AiProvider,
    byte_stream: ByteStream,
    buffer: Vec<u8>,
    queue: VecDeque<String>,
    done: bool,
}

impl SseStreamState {
    fn new(byte_stream: ByteStream, provider: AiProvider) -> Self {
        Self {
            provider,
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
                    match drain_sse_text_deltas(&mut self.buffer, self.provider) {
                        Ok(batch) => {
                            self.queue.extend(batch.deltas);
                            if batch.done {
                                self.done = true;
                            }
                        }
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

#[derive(Debug)]
struct SseParseBatch {
    deltas: Vec<String>,
    done: bool,
}

enum ParsedSseEvent {
    Delta(String),
    Done,
    Ignore,
}

fn drain_sse_text_deltas(
    buffer: &mut Vec<u8>,
    provider: AiProvider,
) -> anyhow::Result<SseParseBatch> {
    let mut deltas = Vec::new();
    let mut done = false;

    while let Some(event) = take_next_sse_event(buffer)? {
        match parse_sse_text_delta(&event, provider)? {
            ParsedSseEvent::Delta(text) => deltas.push(text),
            ParsedSseEvent::Done => {
                done = true;
                break;
            }
            ParsedSseEvent::Ignore => {}
        }
    }

    Ok(SseParseBatch { deltas, done })
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
        .context("AI stream event was not valid UTF-8")
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

fn parse_sse_text_delta(event: &str, provider: AiProvider) -> anyhow::Result<ParsedSseEvent> {
    let data = event
        .lines()
        .filter_map(|line| line.strip_prefix("data:"))
        .map(str::trim_start)
        .collect::<Vec<_>>()
        .join("\n");

    if data.trim().is_empty() {
        return Ok(ParsedSseEvent::Ignore);
    }

    if data.trim() == "[DONE]" {
        return Ok(ParsedSseEvent::Done);
    }

    let value: Value = serde_json::from_str(&data)
        .with_context(|| format!("{} stream event had malformed JSON", provider.stream_name()))?;
    match provider {
        AiProvider::Claude => parse_claude_sse_event(&value),
        AiProvider::OpenAiCompatible => parse_openai_sse_event(&value),
    }
}

fn parse_claude_sse_event(value: &Value) -> anyhow::Result<ParsedSseEvent> {
    match value.get("type").and_then(Value::as_str) {
        Some("content_block_delta") => {
            let delta_type = value.pointer("/delta/type").and_then(Value::as_str);
            if delta_type != Some("text_delta") {
                return Ok(ParsedSseEvent::Ignore);
            }

            match value.pointer("/delta/text") {
                Some(Value::String(text)) if !text.is_empty() => {
                    Ok(ParsedSseEvent::Delta(text.to_owned()))
                }
                Some(Value::String(_)) | None => Ok(ParsedSseEvent::Ignore),
                Some(_) => anyhow::bail!("Claude stream delta text was not a string"),
            }
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
        Some("message_stop") => Ok(ParsedSseEvent::Done),
        _ => Ok(ParsedSseEvent::Ignore),
    }
}

fn parse_openai_sse_event(value: &Value) -> anyhow::Result<ParsedSseEvent> {
    if let Some(error) = value.get("error") {
        let error_type = error
            .get("type")
            .or_else(|| error.get("code"))
            .and_then(Value::as_str)
            .unwrap_or("unknown_error");
        let message = error
            .get("message")
            .and_then(Value::as_str)
            .unwrap_or("OpenAI-compatible stream returned an error");
        anyhow::bail!("OpenAI-compatible stream error ({error_type}): {message}");
    }

    let choices = value
        .get("choices")
        .and_then(Value::as_array)
        .context("OpenAI-compatible stream event missing choices")?;
    let mut text = String::new();

    for choice in choices {
        if choice
            .get("finish_reason")
            .is_some_and(|reason| !reason.is_null())
        {
            continue;
        }

        match choice.pointer("/delta/content") {
            Some(Value::String(content)) if !content.is_empty() => text.push_str(content),
            Some(Value::String(_)) | Some(Value::Null) | None => {}
            Some(_) => anyhow::bail!("OpenAI-compatible stream delta content was not a string"),
        }
    }

    if text.is_empty() {
        Ok(ParsedSseEvent::Ignore)
    } else {
        Ok(ParsedSseEvent::Delta(text))
    }
}

#[cfg(test)]
mod tests {
    use super::{append_endpoint, drain_sse_text_deltas, AiClient, AiProvider};
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
    async fn rejects_malformed_claude_connection_response() {
        let addr = spawn_claude_server_with_body(200, r#"{"type":"message","content":[]}"#).await;
        let client = AiClient::new(
            "claude",
            &format!("http://{addr}"),
            "secret",
            "claude-haiku-4-5-20251001",
        );
        assert!(!client.test_connection().await.unwrap());
    }

    #[tokio::test]
    async fn accepts_successful_openai_compatible_chat_completions_response() {
        let addr = spawn_openai_server(200).await;
        let client = AiClient::new(
            "openai-compatible",
            &format!("http://{addr}"),
            "secret",
            "gpt-4.1-mini",
        );
        assert!(client.test_connection().await.unwrap());
    }

    #[tokio::test]
    async fn rejects_failed_openai_compatible_chat_completions_response() {
        let addr = spawn_openai_server(401).await;
        let client = AiClient::new(
            "openai-compatible",
            &format!("http://{addr}"),
            "secret",
            "gpt-4.1-mini",
        );
        assert!(!client.test_connection().await.unwrap());
    }

    #[tokio::test]
    async fn rejects_malformed_openai_compatible_connection_response() {
        let addr = spawn_openai_server_with_body(200, r#"{"choices":[]}"#).await;
        let client = AiClient::new(
            "openai-compatible",
            &format!("http://{addr}"),
            "secret",
            "gpt-4.1-mini",
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
            assert!(request
                .contains("anthropic-beta: claude-code-20250219,interleaved-thinking-2025-05-14"));
            assert!(request.contains("user-agent: claude-cli/2.1.2 (external, cli)"));
            assert!(request.contains("x-app: cli"));
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
    async fn streams_text_deltas_from_openai_compatible_sse_response() {
        let body = concat!(
            "data: {\"choices\":[{\"delta\":{\"role\":\"assistant\"}}]}\n\n",
            "data: {\"choices\":[{\"delta\":{\"content\":\"Hello \"}}]}\n\n",
            "data: {\"choices\":[{\"delta\":{\"content\":\"world\"}}]}\n\n",
            "data: [DONE]\n\n"
        );
        let addr = spawn_openai_stream_server(body, |request| {
            assert!(request.starts_with("POST /v1/chat/completions"));
            assert!(request.contains("authorization: Bearer secret"));
            assert!(request.contains("content-type: application/json"));
            assert!(request.contains("\"stream\":true"));
            assert!(request.contains("\"role\":\"system\""));
            assert!(request.contains("\"content\":\"Use repo context.\""));
            assert!(request.contains("\"role\":\"user\""));
            assert!(request.contains("\"content\":\"Fix the login form\""));
        })
        .await;
        let client = AiClient::new(
            "openai-compatible",
            &format!("http://{addr}"),
            "secret",
            "gpt-4.1-mini",
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

        let error = drain_sse_text_deltas(&mut buffer, AiProvider::Claude).unwrap_err();
        assert!(error.to_string().contains("overloaded_error"));
        assert!(error.to_string().contains("try later"));
    }

    #[test]
    fn reports_malformed_stream_events() {
        let mut buffer = b"event: content_block_delta\ndata: {bad-json}\n\n".to_vec();

        let error = drain_sse_text_deltas(&mut buffer, AiProvider::Claude).unwrap_err();
        assert!(error.to_string().contains("malformed JSON"));
    }

    #[test]
    fn parses_openai_compatible_done_events() {
        let mut buffer = concat!(
            "data: {\"choices\":[{\"delta\":{\"content\":\"Hello\"}}]}\n\n",
            "data: [DONE]\n\n",
            "data: {\"choices\":[{\"delta\":{\"content\":\"ignored\"}}]}\n\n"
        )
        .as_bytes()
        .to_vec();

        let batch = drain_sse_text_deltas(&mut buffer, AiProvider::OpenAiCompatible).unwrap();

        assert_eq!(batch.deltas, vec!["Hello"]);
        assert!(batch.done);
        assert!(!buffer.is_empty());
    }

    #[test]
    fn parses_openai_compatible_stream_error_events_as_errors() {
        let mut buffer = br#"data: {"error":{"type":"rate_limit_error","message":"slow down"}}

"#
        .to_vec();

        let error = drain_sse_text_deltas(&mut buffer, AiProvider::OpenAiCompatible).unwrap_err();
        assert!(error.to_string().contains("rate_limit_error"));
        assert!(error.to_string().contains("slow down"));
    }

    #[test]
    fn reports_malformed_openai_compatible_stream_events() {
        let mut buffer = b"data: {bad-json}\n\n".to_vec();

        let error = drain_sse_text_deltas(&mut buffer, AiProvider::OpenAiCompatible).unwrap_err();
        assert!(error.to_string().contains("malformed JSON"));
    }

    #[test]
    fn endpoint_builder_accepts_base_urls_with_or_without_v1() {
        assert_eq!(
            append_endpoint("https://api.example.com", "/v1/chat/completions"),
            "https://api.example.com/v1/chat/completions"
        );
        assert_eq!(
            append_endpoint("https://api.example.com/v1", "/v1/chat/completions"),
            "https://api.example.com/v1/chat/completions"
        );
        assert_eq!(
            append_endpoint("https://api.example.com/v1/", "/v1/messages"),
            "https://api.example.com/v1/messages"
        );
    }

    async fn spawn_claude_server(status_code: u16) -> SocketAddr {
        spawn_claude_server_with_body(
            status_code,
            r#"{"type":"message","content":[{"type":"text","text":"Ok."}]}"#,
        )
        .await
    }

    async fn spawn_claude_server_with_body(status_code: u16, body: &'static str) -> SocketAddr {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        tokio::spawn(async move {
            let (mut socket, _) = listener.accept().await.unwrap();
            let mut buffer = vec![0; 4096];
            let bytes = socket.read(&mut buffer).await.unwrap();
            let request = String::from_utf8_lossy(&buffer[..bytes]);
            assert!(request.starts_with("POST /v1/messages"));
            assert!(request.contains("anthropic-version: 2023-06-01"));
            assert!(request
                .contains("anthropic-beta: claude-code-20250219,interleaved-thinking-2025-05-14"));
            assert!(request.contains("user-agent: claude-cli/2.1.2 (external, cli)"));
            assert!(request.contains("x-app: cli"));
            assert!(request.contains("claude-haiku-4-5-20251001"));
            assert!(request.contains("\"stream\":true"));

            let response = format!(
                "HTTP/1.1 {status_code} OK\r\ncontent-type: application/json\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{body}",
                body.len()
            );
            socket.write_all(response.as_bytes()).await.unwrap();
        });
        addr
    }

    async fn spawn_openai_server(status_code: u16) -> SocketAddr {
        spawn_openai_server_with_body(
            status_code,
            r#"{"choices":[{"message":{"role":"assistant","content":"Ok."}}]}"#,
        )
        .await
    }

    async fn spawn_openai_server_with_body(status_code: u16, body: &'static str) -> SocketAddr {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        tokio::spawn(async move {
            let (mut socket, _) = listener.accept().await.unwrap();
            let mut buffer = vec![0; 4096];
            let bytes = socket.read(&mut buffer).await.unwrap();
            let request = String::from_utf8_lossy(&buffer[..bytes]);
            assert!(request.starts_with("POST /v1/chat/completions"));
            assert!(request.contains("authorization: Bearer secret"));
            assert!(request.contains("gpt-4.1-mini"));
            assert!(request.contains("\"max_tokens\":1"));
            assert!(request.contains("\"stream\":true"));

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

    async fn spawn_openai_stream_server<F>(body: &'static str, assert_request: F) -> SocketAddr
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
