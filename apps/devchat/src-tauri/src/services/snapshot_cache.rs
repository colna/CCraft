use crate::models::ProjectSnapshot;
use serde::{Deserialize, Serialize};

const SNAPSHOT_CACHE_VERSION: u8 = 1;
const MAX_SNAPSHOT_CACHE_ENTRIES: usize = 24;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotCache {
    pub version: u8,
    pub entries: Vec<SnapshotCacheEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotCacheEntry {
    pub key: String,
    pub owner: String,
    pub repo: String,
    pub branch: String,
    pub cache_ref: String,
    pub snapshot: ProjectSnapshot,
    pub updated_at: String,
}

pub fn empty_snapshot_cache() -> SnapshotCache {
    SnapshotCache {
        version: SNAPSHOT_CACHE_VERSION,
        entries: Vec::new(),
    }
}

pub fn snapshot_cache_key(owner: &str, repo: &str, branch: &str, cache_ref: &str) -> String {
    format!("{owner}/{repo}#{branch}@{cache_ref}")
}

pub fn find_cached_snapshot(cache: &SnapshotCache, key: &str) -> Option<ProjectSnapshot> {
    cache
        .entries
        .iter()
        .find(|entry| entry.key == key)
        .map(|entry| entry.snapshot.clone())
}

pub fn upsert_cached_snapshot(
    mut cache: SnapshotCache,
    entry: SnapshotCacheEntry,
) -> SnapshotCache {
    cache.version = SNAPSHOT_CACHE_VERSION;
    cache.entries.retain(|existing| existing.key != entry.key);
    cache.entries.insert(0, entry);
    cache.entries.truncate(MAX_SNAPSHOT_CACHE_ENTRIES);
    cache
}

pub fn normalize_snapshot_cache(mut cache: SnapshotCache) -> SnapshotCache {
    if cache.version != SNAPSHOT_CACHE_VERSION {
        return empty_snapshot_cache();
    }

    cache.entries.retain(|entry| {
        !entry.key.trim().is_empty()
            && !entry.owner.trim().is_empty()
            && !entry.repo.trim().is_empty()
            && !entry.branch.trim().is_empty()
            && !entry.cache_ref.trim().is_empty()
    });
    cache.entries.truncate(MAX_SNAPSHOT_CACHE_ENTRIES);
    cache
}

#[cfg(test)]
mod tests {
    use super::{
        empty_snapshot_cache, find_cached_snapshot, normalize_snapshot_cache, snapshot_cache_key,
        upsert_cached_snapshot, SnapshotCacheEntry,
    };
    use crate::models::{ProjectSnapshot, TechStack};
    use serde_json::json;

    #[test]
    fn keys_include_repo_branch_and_ref() {
        assert_eq!(
            snapshot_cache_key("colna", "ccraft", "feature/mobile", "abc123"),
            "colna/ccraft#feature/mobile@abc123"
        );
    }

    #[test]
    fn upserts_and_limits_snapshot_cache_entries() {
        let mut cache = empty_snapshot_cache();
        for index in 0..30 {
            let key = format!("repo#{index}");
            cache = upsert_cached_snapshot(
                cache,
                SnapshotCacheEntry {
                    key,
                    owner: "colna".to_owned(),
                    repo: "ccraft".to_owned(),
                    branch: "main".to_owned(),
                    cache_ref: format!("sha-{index}"),
                    snapshot: snapshot("React"),
                    updated_at: format!("unix:{index}"),
                },
            );
        }

        assert_eq!(cache.entries.len(), 24);
        assert_eq!(cache.entries[0].cache_ref, "sha-29");
        assert!(find_cached_snapshot(&cache, "repo#29").is_some());
        assert!(find_cached_snapshot(&cache, "repo#0").is_none());
    }

    #[test]
    fn rejects_unknown_cache_versions() {
        let mut cache = empty_snapshot_cache();
        cache.version = 99;

        assert!(normalize_snapshot_cache(cache).entries.is_empty());
    }

    fn snapshot(framework: &str) -> ProjectSnapshot {
        ProjectSnapshot {
            directory_tree: json!({}),
            tech_stack: TechStack {
                language: "TypeScript".to_owned(),
                framework: framework.to_owned(),
                dependencies: vec!["react".to_owned()],
            },
            key_files: Vec::new(),
            module_map: json!({}),
            skipped_files: Vec::new(),
            generated_at: "unix:1778457600".to_owned(),
        }
    }
}
