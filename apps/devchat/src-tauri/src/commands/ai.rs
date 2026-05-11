use crate::models::ChatMessage;
use crate::services::ai_client::AiClient;
use futures_util::StreamExt;
use serde::Serialize;
use tauri::{AppHandle, Emitter};

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct StreamChunkEvent {
    request_id: String,
    text: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct StreamErrorEvent {
    request_id: String,
    message: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct StreamDoneEvent {
    request_id: String,
}

#[tauri::command]
pub async fn test_ai_connection(
    app: AppHandle,
    provider: String,
    base_url: String,
    api_key_secret_ref: String,
    model: String,
) -> Result<bool, String> {
    let api_key = crate::commands::storage::get_secret_value(&app, &api_key_secret_ref)?;
    AiClient::new(&provider, &base_url, &api_key, &model)
        .test_connection()
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn chat_stream(
    app: AppHandle,
    request_id: String,
    provider: String,
    base_url: String,
    api_key_secret_ref: String,
    model: String,
    messages: Vec<ChatMessage>,
    system_prompt: String,
) -> Result<(), String> {
    let request_id = request_id.trim().to_owned();
    if request_id.is_empty() {
        return Err("stream request id is required".to_owned());
    }

    let api_key = crate::commands::storage::get_secret_value(&app, &api_key_secret_ref)?;
    let client = AiClient::new(&provider, &base_url, &api_key, &model);
    let mut stream = client
        .chat_stream(&messages, &system_prompt)
        .await
        .map_err(|error| error.to_string())?;

    while let Some(chunk) = stream.next().await {
        match chunk {
            Ok(text) => app
                .emit(
                    "ai-stream-chunk",
                    StreamChunkEvent {
                        request_id: request_id.clone(),
                        text,
                    },
                )
                .map_err(|error| error.to_string())?,
            Err(error) => {
                app.emit(
                    "ai-stream-error",
                    StreamErrorEvent {
                        request_id: request_id.clone(),
                        message: error.to_string(),
                    },
                )
                .map_err(|emit_error| emit_error.to_string())?;
                break;
            }
        }
    }

    app.emit("ai-stream-done", StreamDoneEvent { request_id })
        .map_err(|error| error.to_string())
}
