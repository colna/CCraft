use crate::models::ChatMessage;
use crate::services::ai_client::AiClient;
use futures_util::StreamExt;
use tauri::{AppHandle, Emitter};
use tauri_plugin_store::StoreExt;

#[tauri::command]
pub async fn test_ai_connection(
    app: AppHandle,
    provider: String,
    base_url: String,
    api_key_secret_ref: String,
    model: String,
) -> Result<bool, String> {
    let api_key = get_secret(&app, &api_key_secret_ref)?;
    AiClient::new(&provider, &base_url, &api_key, &model)
        .test_connection()
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn chat_stream(
    app: AppHandle,
    base_url: String,
    api_key_secret_ref: String,
    model: String,
    messages: Vec<ChatMessage>,
    system_prompt: String,
) -> Result<(), String> {
    let api_key = get_secret(&app, &api_key_secret_ref)?;
    let client = AiClient::new("claude", &base_url, &api_key, &model);
    let mut stream = client
        .chat_stream(&messages, &system_prompt)
        .await
        .map_err(|error| error.to_string())?;

    while let Some(chunk) = stream.next().await {
        match chunk {
            Ok(text) => app.emit("ai-stream-chunk", text).map_err(|error| error.to_string())?,
            Err(error) => {
                app.emit("ai-stream-error", error.to_string())
                    .map_err(|emit_error| emit_error.to_string())?;
                break;
            }
        }
    }

    app.emit("ai-stream-done", ()).map_err(|error| error.to_string())
}

fn get_secret(app: &AppHandle, key: &str) -> Result<String, String> {
    let store = app.store("secrets.json").map_err(|error| error.to_string())?;
    store
        .get(key)
        .and_then(|value| value.as_str().map(ToOwned::to_owned))
        .ok_or_else(|| "未找到对应密钥，请先保存 API Key".to_owned())
}
