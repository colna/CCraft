use std::collections::HashMap;
use std::sync::{Arc, Mutex};

const SERVICE_NAME: &str = "app.devchat.mobile";

pub trait SecretStore {
    fn save(&self, key: &str, value: &str) -> anyhow::Result<()>;
    fn get(&self, key: &str) -> anyhow::Result<Option<String>>;
    fn has(&self, key: &str) -> anyhow::Result<bool>;
    fn delete(&self, key: &str) -> anyhow::Result<()>;
}

#[derive(Debug, Clone, Copy, Default)]
pub struct KeyringSecretStore;

impl SecretStore for KeyringSecretStore {
    fn save(&self, key: &str, value: &str) -> anyhow::Result<()> {
        let key = validate_secret_key(key)?;
        let entry = keyring::Entry::new(SERVICE_NAME, key)?;
        entry.set_password(value)?;
        Ok(())
    }

    fn get(&self, key: &str) -> anyhow::Result<Option<String>> {
        let key = validate_secret_key(key)?;
        let entry = keyring::Entry::new(SERVICE_NAME, key)?;
        match entry.get_password() {
            Ok(value) => Ok(Some(value)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(error) => Err(error.into()),
        }
    }

    fn has(&self, key: &str) -> anyhow::Result<bool> {
        Ok(self.get(key)?.is_some())
    }

    fn delete(&self, key: &str) -> anyhow::Result<()> {
        let key = validate_secret_key(key)?;
        let entry = keyring::Entry::new(SERVICE_NAME, key)?;
        match entry.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(error) => Err(error.into()),
        }
    }
}

#[derive(Debug, Clone, Default)]
pub struct InMemorySecretStore {
    values: Arc<Mutex<HashMap<String, String>>>,
}

impl SecretStore for InMemorySecretStore {
    fn save(&self, key: &str, value: &str) -> anyhow::Result<()> {
        let key = validate_secret_key(key)?.to_owned();
        self.values
            .lock()
            .map_err(|_| anyhow::anyhow!("secret store lock poisoned"))?
            .insert(key, value.to_owned());
        Ok(())
    }

    fn get(&self, key: &str) -> anyhow::Result<Option<String>> {
        let key = validate_secret_key(key)?;
        Ok(self
            .values
            .lock()
            .map_err(|_| anyhow::anyhow!("secret store lock poisoned"))?
            .get(key)
            .cloned())
    }

    fn has(&self, key: &str) -> anyhow::Result<bool> {
        Ok(self.get(key)?.is_some())
    }

    fn delete(&self, key: &str) -> anyhow::Result<()> {
        let key = validate_secret_key(key)?;
        self.values
            .lock()
            .map_err(|_| anyhow::anyhow!("secret store lock poisoned"))?
            .remove(key);
        Ok(())
    }
}

pub fn validate_secret_key(key: &str) -> anyhow::Result<&str> {
    let key = key.trim();
    anyhow::ensure!(!key.is_empty(), "secret key is required");
    anyhow::ensure!(key.len() <= 128, "secret key is too long");
    anyhow::ensure!(
        key.bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b'-')),
        "secret key contains unsupported characters"
    );
    Ok(key)
}

pub fn default_secret_store() -> KeyringSecretStore {
    KeyringSecretStore
}

#[cfg(test)]
mod tests {
    use super::{validate_secret_key, InMemorySecretStore, SecretStore};

    #[test]
    fn saves_reads_checks_and_deletes_secrets_without_plaintext_files() {
        let store = InMemorySecretStore::default();

        store.save("ai.default.apiKey", "secret-value").unwrap();
        assert!(store.has("ai.default.apiKey").unwrap());
        assert_eq!(
            store.get("ai.default.apiKey").unwrap().as_deref(),
            Some("secret-value")
        );

        store.delete("ai.default.apiKey").unwrap();
        assert!(!store.has("ai.default.apiKey").unwrap());
        assert_eq!(store.get("ai.default.apiKey").unwrap(), None);
    }

    #[test]
    fn rejects_unsafe_secret_keys() {
        assert!(validate_secret_key("github.default-token_1").is_ok());
        assert!(validate_secret_key("").is_err());
        assert!(validate_secret_key("../token").is_err());
        assert!(validate_secret_key("token with spaces").is_err());
    }
}
