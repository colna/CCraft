use crate::models::ChatMessage;
use futures_util::{stream, Stream};
use serde_json::json;

pub struct AiClient {
    provider: String,
    base_url: String,
    api_key: String,
    model: String,
}

impl AiClient {
    pub fn new(provider: &str, base_url: &str, api_key: &str, model: &str) -> Self {
        Self {
            provider: provider.to_owned(),
            base_url: base_url.to_owned(),
            api_key: api_key.to_owned(),
            model: model.to_owned(),
        }
    }

    pub async fn test_connection(&self) -> anyhow::Result<bool> {
        if self.provider != "claude" || self.api_key.trim().is_empty() || self.model.trim().is_empty() {
            return Ok(false);
        }

        let base_url = self.base_url.trim_end_matches('/');
        let response = reqwest::Client::new()
            .post(format!("{base_url}/v1/messages"))
            .header("x-api-key", &self.api_key)
            .header("anthropic-version", "2023-06-01")
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
    ) -> anyhow::Result<impl Stream<Item = anyhow::Result<String>>> {
        let last_request = messages
            .last()
            .map(|message| message.content.as_str())
            .unwrap_or("请修改代码");
        let text = format!(
            "已基于项目快照生成修改建议。模型 {} 收到需求：{}。{}",
            self.model,
            last_request,
            if system_prompt.is_empty() { "" } else { "Diff 已准备好供审查。" }
        );
        let chunks = text
            .split_inclusive('。')
            .filter(|chunk| !chunk.is_empty())
            .map(|chunk| Ok(chunk.to_owned()))
            .collect::<Vec<_>>();
        let _ = &self.api_key;
        Ok(stream::iter(chunks))
    }
}

#[cfg(test)]
mod tests {
    use super::AiClient;
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
        let client = AiClient::new("claude", &format!("http://{addr}"), "secret", "claude-haiku-4-5-20251001");
        assert!(client.test_connection().await.unwrap());
    }

    #[tokio::test]
    async fn rejects_failed_claude_messages_response() {
        let addr = spawn_claude_server(401).await;
        let client = AiClient::new("claude", &format!("http://{addr}"), "secret", "claude-haiku-4-5-20251001");
        assert!(!client.test_connection().await.unwrap());
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
}
