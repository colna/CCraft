use serde::{Deserialize, Serialize};

use super::AiConfig;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum GitHubAuthStatus {
    NotConfigured,
    Configured,
    Invalid,
    Expired,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
#[serde(rename_all = "camelCase")]
pub struct UserPreferences {
    pub theme: String,
    pub language: String,
    pub default_branch: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
#[serde(rename_all = "camelCase")]
pub struct UserConfig {
    pub version: u32,
    pub ai_configs: Vec<AiConfig>,
    pub github_auth_status: GitHubAuthStatus,
    pub preferences: UserPreferences,
}
