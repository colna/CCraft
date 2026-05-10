use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiConfig {
    pub name: String,
    pub provider: String,
    pub base_url: String,
    pub model: String,
    pub api_key_secret_ref: String,
}
