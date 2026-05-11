pub mod ai_config;
pub mod diff;
pub mod project;
pub mod session;
pub mod user_config;

pub use ai_config::AiConfig;
pub use diff::{CommitResult, FileChange};
pub use project::{FileTree, KeyFile, ProjectSnapshot, Repository, TechStack};
pub use session::ChatMessage;
pub use user_config::{GitHubAuthStatus, UserConfig, UserPreferences};
