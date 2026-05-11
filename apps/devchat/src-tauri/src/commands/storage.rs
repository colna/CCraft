use tauri::AppHandle;
use tauri_plugin_store::StoreExt;

use crate::models::{AiConfig, ChatSession, Project, UserConfig, UserPreferences};
use crate::services::project_history::{
    empty_project_history, migrate_project_history_value, upsert_recent_project,
};
use crate::services::secret_store::{default_secret_store, SecretStore};
use crate::services::session_history::{
    delete_session, empty_session_history, mark_session_committed, migrate_session_history_value,
    upsert_session,
};
use crate::services::user_config::{
    activate_ai_config, default_user_config, delete_ai_config as delete_user_ai_config,
    normalize_user_config, update_preferences as update_user_config_preferences, upsert_ai_config,
    GITHUB_TOKEN_SECRET_REF,
};

const SETTINGS_STORE_FILE: &str = "settings.json";
const SESSIONS_STORE_FILE: &str = "sessions.json";
const USER_CONFIG_STORE_KEY: &str = "userConfig";
const RECENT_PROJECTS_STORE_KEY: &str = "recentProjects";
const SESSION_HISTORY_STORE_KEY: &str = "sessionHistory";

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

#[tauri::command]
pub async fn load_user_config(app: AppHandle) -> Result<UserConfig, String> {
    load_user_config_value(&app)
}

#[tauri::command]
pub async fn save_ai_config(app: AppHandle, config: AiConfig) -> Result<UserConfig, String> {
    let github_has_token = github_has_token()?;
    let user_config = load_user_config_with_github_status(&app, github_has_token)?;
    let user_config = upsert_ai_config(user_config, config, github_has_token)
        .map_err(|error| error.to_string())?;
    save_user_config_value(&app, &user_config)?;
    Ok(user_config)
}

#[tauri::command]
pub async fn set_active_ai_config(app: AppHandle, id: String) -> Result<UserConfig, String> {
    let github_has_token = github_has_token()?;
    let user_config = load_user_config_with_github_status(&app, github_has_token)?;
    let user_config = activate_ai_config(user_config, &id, github_has_token)
        .map_err(|error| error.to_string())?;
    save_user_config_value(&app, &user_config)?;
    Ok(user_config)
}

#[tauri::command]
pub async fn delete_ai_config(app: AppHandle, id: String) -> Result<UserConfig, String> {
    let github_has_token = github_has_token()?;
    let user_config = load_user_config_with_github_status(&app, github_has_token)?;
    let user_config = delete_user_ai_config(user_config, &id, github_has_token)
        .map_err(|error| error.to_string())?;
    save_user_config_value(&app, &user_config)?;
    Ok(user_config)
}

#[tauri::command]
pub async fn update_user_preferences(
    app: AppHandle,
    preferences: UserPreferences,
) -> Result<UserConfig, String> {
    let github_has_token = github_has_token()?;
    let user_config = load_user_config_with_github_status(&app, github_has_token)?;
    let user_config = update_user_config_preferences(user_config, preferences, github_has_token)
        .map_err(|error| error.to_string())?;
    save_user_config_value(&app, &user_config)?;
    Ok(user_config)
}

#[tauri::command]
pub async fn load_recent_projects(app: AppHandle) -> Result<Vec<Project>, String> {
    load_recent_projects_value(&app)
}

#[tauri::command]
pub async fn save_recent_project(app: AppHandle, project: Project) -> Result<Vec<Project>, String> {
    let projects = load_recent_projects_value(&app)?;
    let projects = upsert_recent_project(projects, project).map_err(|error| error.to_string())?;
    save_recent_projects_value(&app, &projects)?;
    Ok(projects)
}

#[tauri::command]
pub async fn load_chat_sessions(app: AppHandle) -> Result<Vec<ChatSession>, String> {
    load_session_history_value(&app).map(|history| history.sessions)
}

#[tauri::command]
pub async fn save_chat_session(
    app: AppHandle,
    session: ChatSession,
) -> Result<Vec<ChatSession>, String> {
    let history = load_session_history_value(&app)?;
    let history = upsert_session(history, session).map_err(|error| error.to_string())?;
    save_session_history_value(&app, &history)?;
    Ok(history.sessions)
}

#[tauri::command]
pub async fn delete_chat_session(app: AppHandle, id: String) -> Result<Vec<ChatSession>, String> {
    let history = load_session_history_value(&app)?;
    let history = delete_session(history, &id).map_err(|error| error.to_string())?;
    save_session_history_value(&app, &history)?;
    Ok(history.sessions)
}

#[tauri::command]
pub async fn mark_chat_session_committed(
    app: AppHandle,
    id: String,
    commit_sha: String,
    commit_url: Option<String>,
    updated_at: String,
) -> Result<Vec<ChatSession>, String> {
    let history = load_session_history_value(&app)?;
    let history = mark_session_committed(history, &id, &commit_sha, commit_url, &updated_at)
        .map_err(|error| error.to_string())?;
    save_session_history_value(&app, &history)?;
    Ok(history.sessions)
}

pub fn get_secret_value(app: &AppHandle, key: &str) -> Result<String, String> {
    get_optional_secret_value(app, key)?.ok_or_else(|| "未找到对应密钥，请先保存凭据".to_owned())
}

fn get_optional_secret_value(_app: &AppHandle, key: &str) -> Result<Option<String>, String> {
    default_secret_store()
        .get(key)
        .map_err(|error| error.to_string())
}

fn load_user_config_value(app: &AppHandle) -> Result<UserConfig, String> {
    let github_has_token = github_has_token()?;
    load_user_config_with_github_status(app, github_has_token)
}

fn load_user_config_with_github_status(
    app: &AppHandle,
    github_has_token: bool,
) -> Result<UserConfig, String> {
    let store = app
        .store(SETTINGS_STORE_FILE)
        .map_err(|error| error.to_string())?;
    let config = match store.get(USER_CONFIG_STORE_KEY) {
        Some(value) => serde_json::from_value::<UserConfig>(value.clone())
            .map_err(|error| error.to_string())?,
        None => default_user_config(github_has_token),
    };

    normalize_user_config(config, github_has_token).map_err(|error| error.to_string())
}

fn save_user_config_value(app: &AppHandle, user_config: &UserConfig) -> Result<(), String> {
    let store = app
        .store(SETTINGS_STORE_FILE)
        .map_err(|error| error.to_string())?;
    let value = serde_json::to_value(user_config).map_err(|error| error.to_string())?;
    store.set(USER_CONFIG_STORE_KEY.to_owned(), value);
    store.save().map_err(|error| error.to_string())
}

fn load_recent_projects_value(app: &AppHandle) -> Result<Vec<Project>, String> {
    let store = app
        .store(SETTINGS_STORE_FILE)
        .map_err(|error| error.to_string())?;
    let history = match store.get(RECENT_PROJECTS_STORE_KEY) {
        Some(value) => {
            migrate_project_history_value(value.clone()).map_err(|error| error.to_string())?
        }
        None => empty_project_history(),
    };

    Ok(history.projects)
}

fn save_recent_projects_value(app: &AppHandle, projects: &[Project]) -> Result<(), String> {
    let store = app
        .store(SETTINGS_STORE_FILE)
        .map_err(|error| error.to_string())?;
    let mut history = empty_project_history();
    history.projects = projects.to_vec();
    let value = serde_json::to_value(history).map_err(|error| error.to_string())?;
    store.set(RECENT_PROJECTS_STORE_KEY.to_owned(), value);
    store.save().map_err(|error| error.to_string())
}

fn load_session_history_value(
    app: &AppHandle,
) -> Result<crate::services::session_history::SessionHistory, String> {
    let store = app
        .store(SESSIONS_STORE_FILE)
        .map_err(|error| error.to_string())?;
    match store.get(SESSION_HISTORY_STORE_KEY) {
        Some(value) => {
            migrate_session_history_value(value.clone()).map_err(|error| error.to_string())
        }
        None => Ok(empty_session_history()),
    }
}

fn save_session_history_value(
    app: &AppHandle,
    history: &crate::services::session_history::SessionHistory,
) -> Result<(), String> {
    let store = app
        .store(SESSIONS_STORE_FILE)
        .map_err(|error| error.to_string())?;
    let value = serde_json::to_value(history).map_err(|error| error.to_string())?;
    store.set(SESSION_HISTORY_STORE_KEY.to_owned(), value);
    store.save().map_err(|error| error.to_string())
}

fn github_has_token() -> Result<bool, String> {
    default_secret_store()
        .has(GITHUB_TOKEN_SECRET_REF)
        .map_err(|error| error.to_string())
}
