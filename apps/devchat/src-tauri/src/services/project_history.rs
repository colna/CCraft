use crate::models::Project;
use serde::{Deserialize, Serialize};
use serde_json::Value;

const PROJECT_HISTORY_VERSION: u32 = 1;
const MAX_RECENT_PROJECTS: usize = 8;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectHistory {
    pub version: u32,
    pub projects: Vec<Project>,
}

pub fn empty_project_history() -> ProjectHistory {
    ProjectHistory {
        version: PROJECT_HISTORY_VERSION,
        projects: Vec::new(),
    }
}

pub fn upsert_recent_project(
    mut projects: Vec<Project>,
    project: Project,
) -> anyhow::Result<Vec<Project>> {
    validate_project(&project)?;
    projects.retain(|existing| {
        existing.repo_id != project.repo_id || existing.branch != project.branch
    });
    projects.insert(0, project);
    projects.truncate(MAX_RECENT_PROJECTS);
    Ok(projects)
}

pub fn normalize_recent_projects(projects: Vec<Project>) -> anyhow::Result<Vec<Project>> {
    let mut normalized = Vec::new();
    for project in projects {
        normalized = upsert_recent_project(normalized, project)?;
    }
    Ok(normalized)
}

pub fn normalize_project_history(mut history: ProjectHistory) -> anyhow::Result<ProjectHistory> {
    if history.version != PROJECT_HISTORY_VERSION {
        return Ok(empty_project_history());
    }

    history.projects = normalize_recent_projects(history.projects)?;
    history.version = PROJECT_HISTORY_VERSION;
    Ok(history)
}

pub fn migrate_project_history_value(value: Value) -> anyhow::Result<ProjectHistory> {
    if value.is_array() {
        let projects = serde_json::from_value::<Vec<Project>>(value)?;
        return normalize_project_history(ProjectHistory {
            version: PROJECT_HISTORY_VERSION,
            projects,
        });
    }

    let history = serde_json::from_value::<ProjectHistory>(value)?;
    normalize_project_history(history)
}

fn validate_project(project: &Project) -> anyhow::Result<()> {
    validate_text(&project.repo_id, "repo id", 120)?;
    validate_text(&project.repo_owner, "repo owner", 120)?;
    validate_text(&project.repo_name, "repo name", 120)?;
    validate_text(&project.repo_full_name, "repo full name", 240)?;
    validate_text(&project.branch, "branch", 240)?;
    if let Some(branch_sha) = &project.branch_sha {
        validate_text(branch_sha, "branch sha", 120)?;
    }
    validate_text(&project.last_accessed, "last accessed", 80)?;
    Ok(())
}

fn validate_text(value: &str, label: &str, max_len: usize) -> anyhow::Result<()> {
    let value = value.trim();
    anyhow::ensure!(!value.is_empty(), "{label} is required");
    anyhow::ensure!(value.len() <= max_len, "{label} is too long");
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{
        empty_project_history, migrate_project_history_value, normalize_project_history,
        normalize_recent_projects, upsert_recent_project,
    };
    use crate::models::Project;
    use serde_json::json;

    #[test]
    fn saves_most_recent_project_first_and_deduplicates_by_repo_and_branch() {
        let first = project("1", "main", "2026-05-11T00:00:00Z");
        let latest = project("1", "main", "2026-05-11T01:00:00Z");

        let projects = upsert_recent_project(vec![first], latest).unwrap();

        assert_eq!(projects.len(), 1);
        assert_eq!(projects[0].last_accessed, "2026-05-11T01:00:00Z");
    }

    #[test]
    fn limits_recent_projects_to_eight_entries() {
        let mut projects = Vec::new();
        for index in 0..10 {
            projects = upsert_recent_project(
                projects,
                project(&index.to_string(), "main", "2026-05-11T00:00:00Z"),
            )
            .unwrap();
        }

        assert_eq!(projects.len(), 8);
        assert_eq!(projects[0].repo_id, "9");
    }

    #[test]
    fn rejects_invalid_recent_projects() {
        let mut invalid = project("1", "main", "2026-05-11T00:00:00Z");
        invalid.repo_full_name = String::new();

        assert!(normalize_recent_projects(vec![invalid]).is_err());
    }

    #[test]
    fn migrates_legacy_project_arrays_to_versioned_history() {
        let value = json!([project("1", "main", "2026-05-11T00:00:00Z")]);

        let history = migrate_project_history_value(value).unwrap();

        assert_eq!(history.version, 1);
        assert_eq!(history.projects.len(), 1);
        assert_eq!(history.projects[0].repo_full_name, "colna/repo-1");
    }

    #[test]
    fn safely_ignores_unknown_project_history_versions() {
        let history = normalize_project_history(super::ProjectHistory {
            version: 99,
            projects: vec![project("1", "main", "2026-05-11T00:00:00Z")],
        })
        .unwrap();

        assert_eq!(history.version, empty_project_history().version);
        assert!(history.projects.is_empty());
    }

    fn project(repo_id: &str, branch: &str, last_accessed: &str) -> Project {
        Project {
            repo_id: repo_id.to_owned(),
            repo_owner: "colna".to_owned(),
            repo_name: format!("repo-{repo_id}"),
            repo_full_name: format!("colna/repo-{repo_id}"),
            branch: branch.to_owned(),
            branch_sha: None,
            snapshot: None,
            last_accessed: last_accessed.to_owned(),
        }
    }
}
