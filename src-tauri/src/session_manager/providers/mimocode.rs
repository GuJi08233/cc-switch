use crate::session_manager::{SessionMeta, SessionMessage};
use std::path::{Path, PathBuf};

const PROVIDER_ID: &str = "mimocode";

pub(crate) fn get_mimocode_base_dir() -> PathBuf {
    crate::mimocode_config::get_mimocode_data_dir()
}

fn get_mimocode_db_path() -> PathBuf {
    crate::mimocode_config::get_mimocode_db_path()
}

pub fn scan_sessions() -> Vec<SessionMeta> {
    let mut sessions = Vec::new();

    // Scan SQLite database
    sessions.extend(scan_sessions_sqlite());

    sessions
}

fn scan_sessions_sqlite() -> Vec<SessionMeta> {
    let db_path = get_mimocode_db_path();
    if !db_path.exists() {
        return Vec::new();
    }

    let conn = match rusqlite::Connection::open_with_flags(
        &db_path,
        rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY | rusqlite::OpenFlags::SQLITE_OPEN_NO_MUTEX,
    ) {
        Ok(conn) => conn,
        Err(e) => {
            log::warn!("Failed to open MiMoCode database: {e}");
            return Vec::new();
        }
    };

    // Enable WAL mode for concurrent reads
    let _ = conn.execute_batch("PRAGMA journal_mode=WAL;");

    let mut sessions = Vec::new();

    // Query sessions
    let mut stmt = match conn.prepare(
        "SELECT id, title, created_at FROM session ORDER BY created_at DESC",
    ) {
        Ok(stmt) => stmt,
        Err(e) => {
            log::warn!("Failed to prepare MiMoCode session query: {e}");
            return Vec::new();
        }
    };

    let rows = stmt.query_map([], |row| {
        let id: String = row.get(0)?;
        let title: Option<String> = row.get(1)?;
        let created_at: Option<i64> = row.get(2)?;
        Ok((id, title, created_at))
    });

    match rows {
        Ok(rows) => {
            for row in rows {
                if let Ok((id, title, created_at)) = row {
                    sessions.push(SessionMeta {
                        provider_id: PROVIDER_ID.to_string(),
                        session_id: id.clone(),
                        title,
                        summary: None,
                        project_dir: None,
                        created_at,
                        last_active_at: created_at,
                        source_path: Some(format!("sqlite:{}:{}", db_path.display(), id)),
                        resume_command: Some(format!("mimo -s {id}")),
                    });
                }
            }
        }
        Err(e) => {
            log::warn!("Failed to query MiMoCode sessions: {e}");
        }
    }

    sessions
}

pub fn load_messages(path: &Path) -> Result<Vec<SessionMessage>, String> {
    // For SQLite sessions, delegate to the SQLite loader
    let source_str = path.to_string_lossy().to_string();
    if source_str.starts_with("sqlite:") {
        return load_messages_sqlite(&source_str);
    }

    Err("MiMoCode only supports SQLite session storage".to_string())
}

pub fn load_messages_sqlite(source: &str) -> Result<Vec<SessionMessage>, String> {
    // Parse "sqlite:<db_path>:<session_id>"
    let parts: Vec<&str> = source.splitn(3, ':').collect();
    if parts.len() < 3 {
        return Err(format!("Invalid MiMoCode SQLite source: {source}"));
    }

    let db_path = parts[1];
    let session_id = parts[2];

    let conn = rusqlite::Connection::open_with_flags(
        db_path,
        rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY | rusqlite::OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )
    .map_err(|e| format!("Failed to open MiMoCode database: {e}"))?;

    let _ = conn.execute_batch("PRAGMA journal_mode=WAL;");

    let mut messages = Vec::new();

    let mut stmt = conn
        .prepare(
            "SELECT data, time_created FROM message WHERE session_id = ?1 ORDER BY time_created ASC",
        )
        .map_err(|e| format!("Failed to prepare message query: {e}"))?;

    let rows = stmt
        .query_map([session_id], |row| {
            let data: String = row.get(0)?;
            let ts: Option<i64> = row.get(1)?;
            Ok((data, ts))
        })
        .map_err(|e| format!("Failed to query messages: {e}"))?;

    for row in rows {
        if let Ok((data, ts)) = row {
            if let Ok(msg_data) = serde_json::from_str::<serde_json::Value>(&data) {
                let role = msg_data
                    .get("role")
                    .and_then(|v| v.as_str())
                    .unwrap_or("unknown")
                    .to_string();

                // Extract content from parts or content field
                let content = if let Some(content) = msg_data.get("content") {
                    if let Some(s) = content.as_str() {
                        s.to_string()
                    } else if let Some(arr) = content.as_array() {
                        arr.iter()
                            .filter_map(|p| p.get("text").and_then(|v| v.as_str()))
                            .collect::<Vec<_>>()
                            .join("")
                    } else {
                        String::new()
                    }
                } else {
                    String::new()
                };

                if !content.is_empty() {
                    messages.push(SessionMessage {
                        role,
                        content,
                        ts,
                    });
                }
            }
        }
    }

    Ok(messages)
}

pub fn delete_session(
    _root: &Path,
    _source_path: &Path,
    _session_id: &str,
) -> Result<bool, String> {
    // SQLite deletion is handled separately
    Err("Use delete_session_sqlite for MiMoCode SQLite sessions".to_string())
}

pub fn delete_session_sqlite(session_id: &str, source: &str) -> Result<bool, String> {
    let parts: Vec<&str> = source.splitn(3, ':').collect();
    if parts.len() < 3 {
        return Err(format!("Invalid MiMoCode SQLite source: {source}"));
    }

    let db_path = parts[1];

    let conn = rusqlite::Connection::open(db_path)
        .map_err(|e| format!("Failed to open MiMoCode database: {e}"))?;

    conn.execute("DELETE FROM message WHERE session_id = ?1", [session_id])
        .map_err(|e| format!("Failed to delete messages: {e}"))?;

    conn.execute("DELETE FROM session WHERE id = ?1", [session_id])
        .map_err(|e| format!("Failed to delete session: {e}"))?;

    Ok(true)
}

pub fn session_roots() -> Vec<PathBuf> {
    vec![get_mimocode_base_dir()]
}
