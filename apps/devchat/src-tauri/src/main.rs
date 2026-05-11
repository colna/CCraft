fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_deep_link::init())
        .invoke_handler(tauri::generate_handler![
            devchat_lib::commands::ai::test_ai_connection,
            devchat_lib::commands::ai::chat_stream,
            devchat_lib::commands::github::github_list_repos,
            devchat_lib::commands::github::github_get_tree,
            devchat_lib::commands::github::github_list_branches,
            devchat_lib::commands::github::github_get_branch,
            devchat_lib::commands::github::github_commit_and_push,
            devchat_lib::commands::snapshot::generate_snapshot,
            devchat_lib::commands::storage::save_secret,
            devchat_lib::commands::storage::has_secret,
            devchat_lib::commands::storage::delete_secret,
            devchat_lib::commands::storage::load_user_config,
            devchat_lib::commands::storage::save_ai_config,
            devchat_lib::commands::storage::set_active_ai_config,
            devchat_lib::commands::storage::delete_ai_config,
            devchat_lib::commands::storage::update_user_preferences,
            devchat_lib::commands::storage::load_recent_projects,
            devchat_lib::commands::storage::save_recent_project
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
