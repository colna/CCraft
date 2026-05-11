use tauri::AppHandle;

use crate::services::secret_store::{default_secret_store, SecretStore};

#[tauri::command]
pub async fn save_secret(_app: AppHandle, key: String, value: String) -> Result<(), String> {
    default_secret_store()
        .save(&key, &value)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn has_secret(_app: AppHandle, key: String) -> Result<bool, String> {
    default_secret_store()
        .has(&key)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn delete_secret(_app: AppHandle, key: String) -> Result<(), String> {
    default_secret_store()
        .delete(&key)
        .map_err(|error| error.to_string())
}

pub fn get_secret_value(app: &AppHandle, key: &str) -> Result<String, String> {
    get_optional_secret_value(app, key)?.ok_or_else(|| "未找到对应密钥，请先保存凭据".to_owned())
}

fn get_optional_secret_value(_app: &AppHandle, key: &str) -> Result<Option<String>, String> {
    default_secret_store()
        .get(key)
        .map_err(|error| error.to_string())
}
