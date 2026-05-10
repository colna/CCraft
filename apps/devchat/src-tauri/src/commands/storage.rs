use tauri::AppHandle;
use tauri_plugin_store::StoreExt;

#[tauri::command]
pub async fn save_secret(app: AppHandle, key: String, value: String) -> Result<(), String> {
    let store = app.store("secrets.json").map_err(|error| error.to_string())?;
    store.set(key, serde_json::json!(value));
    store.save().map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn get_secret(app: AppHandle, key: String) -> Result<Option<String>, String> {
    let store = app.store("secrets.json").map_err(|error| error.to_string())?;
    Ok(store.get(&key).and_then(|value| value.as_str().map(ToOwned::to_owned)))
}
