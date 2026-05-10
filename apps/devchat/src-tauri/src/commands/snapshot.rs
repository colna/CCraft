use crate::models::ProjectSnapshot;
use crate::services::snapshot::generate_demo_snapshot;

#[tauri::command]
pub async fn generate_snapshot(_token: String, _owner: String, _repo: String, _branch: String) -> Result<ProjectSnapshot, String> {
    Ok(generate_demo_snapshot())
}
