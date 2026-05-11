use crate::models::{AiConfig, GitHubAuthStatus, UserConfig, UserPreferences};
use crate::services::secret_store::validate_secret_key;

pub const GITHUB_TOKEN_SECRET_REF: &str = "github.default.token";

pub fn default_user_config(github_has_token: bool) -> UserConfig {
    UserConfig {
        version: 1,
        ai_configs: vec![default_ai_config()],
        github_auth_status: github_auth_status(github_has_token),
        preferences: UserPreferences {
            theme: "system".to_owned(),
            language: "zh-CN".to_owned(),
            default_branch: "main".to_owned(),
        },
    }
}

pub fn default_ai_config() -> AiConfig {
    AiConfig {
        id: "default".to_owned(),
        name: "Claude Haiku 4.5".to_owned(),
        provider: "claude".to_owned(),
        base_url: "http://172.245.240.135:8080".to_owned(),
        model: "claude-haiku-4-5-20251001".to_owned(),
        api_key_secret_ref: "ai.default.apiKey".to_owned(),
        is_active: true,
    }
}

pub fn github_auth_status(github_has_token: bool) -> GitHubAuthStatus {
    if github_has_token {
        GitHubAuthStatus::Configured
    } else {
        GitHubAuthStatus::NotConfigured
    }
}

pub fn normalize_user_config(
    mut config: UserConfig,
    github_has_token: bool,
) -> anyhow::Result<UserConfig> {
    if config.ai_configs.is_empty() {
        config.ai_configs.push(default_ai_config());
    }

    for ai_config in &mut config.ai_configs {
        normalize_ai_config(ai_config)?;
    }

    let active_count = config
        .ai_configs
        .iter()
        .filter(|config| config.is_active)
        .count();
    if active_count != 1 {
        for (index, ai_config) in config.ai_configs.iter_mut().enumerate() {
            ai_config.is_active = index == 0;
        }
    }

    normalize_preferences(&mut config.preferences)?;
    config.version = 1;
    config.github_auth_status = github_auth_status(github_has_token);
    Ok(config)
}

pub fn upsert_ai_config(
    mut user_config: UserConfig,
    mut ai_config: AiConfig,
    github_has_token: bool,
) -> anyhow::Result<UserConfig> {
    normalize_ai_config(&mut ai_config)?;

    if ai_config.is_active {
        for existing in &mut user_config.ai_configs {
            existing.is_active = false;
        }
    }

    match user_config
        .ai_configs
        .iter()
        .position(|existing| existing.id == ai_config.id)
    {
        Some(index) => user_config.ai_configs[index] = ai_config,
        None => user_config.ai_configs.push(ai_config),
    }

    normalize_user_config(user_config, github_has_token)
}

pub fn activate_ai_config(
    mut user_config: UserConfig,
    id: &str,
    github_has_token: bool,
) -> anyhow::Result<UserConfig> {
    let id = normalize_config_id(id)?;
    anyhow::ensure!(
        user_config.ai_configs.iter().any(|config| config.id == id),
        "AI config not found"
    );

    for ai_config in &mut user_config.ai_configs {
        ai_config.is_active = ai_config.id == id;
    }

    normalize_user_config(user_config, github_has_token)
}

pub fn delete_ai_config(
    mut user_config: UserConfig,
    id: &str,
    github_has_token: bool,
) -> anyhow::Result<UserConfig> {
    let id = normalize_config_id(id)?;
    anyhow::ensure!(
        user_config.ai_configs.len() > 1,
        "at least one AI config is required"
    );
    let before_len = user_config.ai_configs.len();
    user_config.ai_configs.retain(|config| config.id != id);
    anyhow::ensure!(
        user_config.ai_configs.len() != before_len,
        "AI config not found"
    );

    normalize_user_config(user_config, github_has_token)
}

pub fn update_preferences(
    mut user_config: UserConfig,
    preferences: UserPreferences,
    github_has_token: bool,
) -> anyhow::Result<UserConfig> {
    user_config.preferences = preferences;
    normalize_user_config(user_config, github_has_token)
}

fn normalize_ai_config(config: &mut AiConfig) -> anyhow::Result<()> {
    config.id = normalize_config_id(&config.id)?.to_owned();
    config.name = normalize_required_text(&config.name, "AI config name", 80)?;
    config.provider = normalize_provider(&config.provider)?;
    config.base_url = normalize_base_url(&config.base_url)?;
    config.model = normalize_required_text(&config.model, "AI model", 120)?;
    config.api_key_secret_ref = validate_secret_key(&config.api_key_secret_ref)?.to_owned();
    anyhow::ensure!(
        config.api_key_secret_ref.starts_with("ai."),
        "AI secret ref must use the ai. namespace"
    );
    Ok(())
}

fn normalize_preferences(preferences: &mut UserPreferences) -> anyhow::Result<()> {
    preferences.theme = match preferences.theme.trim() {
        "system" | "light" | "dark" => preferences.theme.trim().to_owned(),
        _ => anyhow::bail!("unsupported theme preference"),
    };
    preferences.language = match preferences.language.trim() {
        "zh-CN" | "en-US" => preferences.language.trim().to_owned(),
        _ => anyhow::bail!("unsupported language preference"),
    };
    preferences.default_branch =
        normalize_required_text(&preferences.default_branch, "default branch", 120)?;
    Ok(())
}

fn normalize_config_id(id: &str) -> anyhow::Result<&str> {
    let id = validate_secret_key(id)?;
    anyhow::ensure!(id.len() <= 80, "AI config id is too long");
    Ok(id)
}

fn normalize_provider(provider: &str) -> anyhow::Result<String> {
    match provider.trim() {
        "claude" => Ok("claude".to_owned()),
        "openai-compatible" => Ok("openai-compatible".to_owned()),
        _ => anyhow::bail!("unsupported AI provider"),
    }
}

fn normalize_base_url(base_url: &str) -> anyhow::Result<String> {
    let base_url = normalize_required_text(base_url, "AI base URL", 300)?;
    anyhow::ensure!(
        base_url.starts_with("https://")
            || base_url.starts_with("http://127.0.0.1")
            || base_url.starts_with("http://localhost")
            || base_url == "http://172.245.240.135:8080",
        "AI base URL must be HTTPS or an approved local endpoint"
    );
    Ok(base_url.trim_end_matches('/').to_owned())
}

fn normalize_required_text(value: &str, label: &str, max_len: usize) -> anyhow::Result<String> {
    let value = value.trim();
    anyhow::ensure!(!value.is_empty(), "{label} is required");
    anyhow::ensure!(value.len() <= max_len, "{label} is too long");
    Ok(value.to_owned())
}

#[cfg(test)]
mod tests {
    use super::{
        activate_ai_config, default_ai_config, default_user_config, delete_ai_config,
        normalize_user_config, upsert_ai_config,
    };
    use crate::models::AiConfig;

    #[test]
    fn builds_default_non_sensitive_user_config() {
        let config = default_user_config(false);

        assert_eq!(config.version, 1);
        assert_eq!(config.ai_configs.len(), 1);
        assert!(config.ai_configs[0].is_active);
        assert_eq!(config.ai_configs[0].api_key_secret_ref, "ai.default.apiKey");
        assert_eq!(serde_json::to_value(&config).unwrap().get("apiKey"), None);
    }

    #[test]
    fn rejects_plaintext_secret_fields_when_deserializing_ai_configs() {
        let value = serde_json::json!({
            "id": "unsafe",
            "name": "Unsafe",
            "provider": "claude",
            "baseUrl": "https://api.anthropic.com",
            "model": "claude-haiku-4-5-20251001",
            "apiKeySecretRef": "ai.unsafe.apiKey",
            "apiKey": "should-not-be-here",
            "isActive": true
        });

        assert!(serde_json::from_value::<AiConfig>(value).is_err());
    }

    #[test]
    fn upserts_and_activates_one_ai_config() {
        let config = default_user_config(true);
        let new_config = AiConfig {
            id: "work".to_owned(),
            name: "Work Claude".to_owned(),
            provider: "claude".to_owned(),
            base_url: "https://api.anthropic.com/".to_owned(),
            model: "claude-sonnet-4-5".to_owned(),
            api_key_secret_ref: "ai.work.apiKey".to_owned(),
            is_active: true,
        };

        let config = upsert_ai_config(config, new_config, true).unwrap();

        assert_eq!(config.ai_configs.len(), 2);
        assert!(config
            .ai_configs
            .iter()
            .any(|config| config.id == "work" && config.is_active));
        assert!(config
            .ai_configs
            .iter()
            .any(|config| config.id == "default" && !config.is_active));
        assert_eq!(
            config.github_auth_status,
            crate::models::GitHubAuthStatus::Configured
        );
    }

    #[test]
    fn accepts_openai_compatible_ai_configs() {
        let config = default_user_config(true);
        let openai_config = AiConfig {
            id: "openai-compatible".to_owned(),
            name: "OpenAI-compatible".to_owned(),
            provider: "openai-compatible".to_owned(),
            base_url: "https://api.openai.com/".to_owned(),
            model: "gpt-4.1-mini".to_owned(),
            api_key_secret_ref: "ai.openai.apiKey".to_owned(),
            is_active: true,
        };

        let config = upsert_ai_config(config, openai_config, true).unwrap();
        let active = config
            .ai_configs
            .iter()
            .find(|config| config.is_active)
            .unwrap();

        assert_eq!(active.provider, "openai-compatible");
        assert_eq!(active.base_url, "https://api.openai.com");
    }

    #[test]
    fn rejects_unknown_ai_providers() {
        let config = default_user_config(true);
        let unknown_config = AiConfig {
            id: "unknown".to_owned(),
            name: "Unknown".to_owned(),
            provider: "unknown".to_owned(),
            base_url: "https://api.example.com".to_owned(),
            model: "unknown-model".to_owned(),
            api_key_secret_ref: "ai.unknown.apiKey".to_owned(),
            is_active: true,
        };

        let error = upsert_ai_config(config, unknown_config, true).unwrap_err();

        assert!(error.to_string().contains("unsupported AI provider"));
    }

    #[test]
    fn activates_and_deletes_configs_without_leaving_zero_configs() {
        let config = default_user_config(false);
        let mut second = default_ai_config();
        second.id = "second".to_owned();
        second.name = "Second".to_owned();
        second.api_key_secret_ref = "ai.second.apiKey".to_owned();
        second.is_active = false;

        let config = upsert_ai_config(config, second, false).unwrap();
        let config = activate_ai_config(config, "second", false).unwrap();
        assert!(config
            .ai_configs
            .iter()
            .any(|config| config.id == "second" && config.is_active));

        let config = delete_ai_config(config, "second", false).unwrap();
        assert_eq!(config.ai_configs.len(), 1);
        assert!(config.ai_configs[0].is_active);
        assert!(delete_ai_config(config, "default", false).is_err());
    }

    #[test]
    fn normalizes_empty_config_lists_to_the_default_config() {
        let mut config = default_user_config(false);
        config.ai_configs = vec![];

        let config = normalize_user_config(config, false).unwrap();

        assert_eq!(config.ai_configs.len(), 1);
        assert!(config.ai_configs[0].is_active);
    }
}
