pub mod commands;
pub mod models;
pub mod services;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_deep_link::init())
        .invoke_handler(tauri::generate_handler![
            commands::ai::test_ai_connection,
            commands::ai::chat_stream,
            commands::github::github_list_repos,
            commands::github::github_get_tree,
            commands::github::github_list_branches,
            commands::github::github_get_branch,
            commands::github::github_get_file_content,
            commands::github::github_commit_and_push,
            commands::snapshot::generate_snapshot,
            commands::storage::save_secret,
            commands::storage::has_secret,
            commands::storage::delete_secret,
            commands::storage::load_user_config,
            commands::storage::save_ai_config,
            commands::storage::set_active_ai_config,
            commands::storage::delete_ai_config,
            commands::storage::update_user_preferences,
            commands::storage::load_recent_projects,
            commands::storage::save_recent_project,
            commands::storage::load_chat_sessions,
            commands::storage::save_chat_session,
            commands::storage::delete_chat_session,
            commands::storage::mark_chat_session_committed
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
