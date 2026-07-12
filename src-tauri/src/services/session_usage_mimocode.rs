use crate::database::{lock_conn, Database};
use crate::error::AppError;
use crate::mimocode_config;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct SessionSyncResult {
    pub imported: u32,
    pub skipped: u32,
    pub errors: Vec<String>,
}

struct MiMoCodeMessageData {
    input_tokens: u64,
    output_tokens: u64,
    reasoning_tokens: u64,
    cost: Option<f64>,
    model_id: Option<String>,
    timestamp_ms: Option<i64>,
}

pub fn sync_mimocode_usage(db: &Database) -> Result<SessionSyncResult, AppError> {
    let db_path = mimocode_config::get_mimocode_db_path();
    if !db_path.exists() {
        return Ok(SessionSyncResult {
            imported: 0,
            skipped: 0,
            errors: Vec::new(),
        });
    }

    // Check WAL file modification time for change detection
    let wal_path = db_path.with_extension("db-wal");
    let db_mtime = std::fs::metadata(&db_path)
        .and_then(|m| m.modified())
        .ok();
    let wal_mtime = if wal_path.exists() {
        std::fs::metadata(&wal_path)
            .and_then(|m| m.modified())
            .ok()
    } else {
        None
    };

    let conn = rusqlite::Connection::open_with_flags(
        &db_path,
        rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY | rusqlite::OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )
    .map_err(|e| AppError::Config(format!("Failed to open MiMoCode database: {e}")))?;

    let _ = conn.execute_batch("PRAGMA journal_mode=WAL;");

    let mut imported = 0;
    let mut skipped = 0;
    let mut errors = Vec::new();

    // Query sessions
    let sessions = query_sessions(&conn)?;

    for (session_id, _created_at) in &sessions {
        // Query assistant messages for this session
        match query_assistant_messages(&conn, session_id) {
            Ok(messages) => {
                for (request_id, data) in messages {
                    match insert_mimocode_message(db, &request_id, &data, session_id) {
                        Ok(true) => imported += 1,
                        Ok(false) => skipped += 1,
                        Err(e) => errors.push(format!("{request_id}: {e}")),
                    }
                }
            }
            Err(e) => {
                errors.push(format!("Session {session_id}: {e}"));
            }
        }
    }

    Ok(SessionSyncResult {
        imported,
        skipped,
        errors,
    })
}

fn query_sessions(conn: &rusqlite::Connection) -> Result<Vec<(String, i64)>, AppError> {
    let mut stmt = conn
        .prepare("SELECT id, COALESCE(created_at, 0) FROM session ORDER BY created_at DESC")
        .map_err(|e| AppError::Config(format!("Failed to prepare session query: {e}")))?;

    let rows = stmt
        .query_map([], |row| {
            let id: String = row.get(0)?;
            let created_at: i64 = row.get(1)?;
            Ok((id, created_at))
        })
        .map_err(|e| AppError::Config(format!("Failed to query sessions: {e}")))?;

    let mut sessions = Vec::new();
    for row in rows {
        if let Ok(session) = row {
            sessions.push(session);
        }
    }

    Ok(sessions)
}

fn query_assistant_messages(
    conn: &rusqlite::Connection,
    session_id: &str,
) -> Result<Vec<(String, MiMoCodeMessageData)>, AppError> {
    let mut stmt = conn
        .prepare(
            "SELECT id, data FROM message WHERE session_id = ?1 AND role = 'assistant' ORDER BY time_created ASC",
        )
        .map_err(|e| AppError::Config(format!("Failed to prepare message query: {e}")))?;

    let rows = stmt
        .query_map([session_id], |row| {
            let id: String = row.get(0)?;
            let data: String = row.get(1)?;
            Ok((id, data))
        })
        .map_err(|e| AppError::Config(format!("Failed to query messages: {e}")))?;

    let mut messages = Vec::new();
    for row in rows {
        if let Ok((id, data_str)) = row {
            if let Ok(data) = serde_json::from_str::<serde_json::Value>(&data_str) {
                if let Some(parsed) = parse_message_data(&data) {
                    messages.push((id, parsed));
                }
            }
        }
    }

    Ok(messages)
}

fn parse_message_data(value: &serde_json::Value) -> Option<MiMoCodeMessageData> {
    let usage = value.get("usage")?;

    let input_tokens = usage
        .get("input_tokens")
        .and_then(|v| v.as_u64())
        .unwrap_or(0);
    let output_tokens = usage
        .get("output_tokens")
        .and_then(|v| v.as_u64())
        .unwrap_or(0);
    let reasoning_tokens = usage
        .get("reasoning_tokens")
        .and_then(|v| v.as_u64())
        .unwrap_or(0);

    let cost = value.get("cost").and_then(|v| v.as_f64());
    let model_id = value
        .get("model")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let timestamp_ms = value.get("timestamp").and_then(|v| v.as_i64());

    Some(MiMoCodeMessageData {
        input_tokens,
        output_tokens,
        reasoning_tokens,
        cost,
        model_id,
        timestamp_ms,
    })
}

fn insert_mimocode_message(
    db: &Database,
    request_id: &str,
    data: &MiMoCodeMessageData,
    session_id: &str,
) -> Result<bool, AppError> {
    let conn = lock_conn!(db.conn);

    // Check if already imported
    let exists: bool = conn
        .query_row(
            "SELECT COUNT(*) FROM proxy_request_logs WHERE request_id = ?1",
            rusqlite::params![request_id],
            |row| Ok(row.get::<_, i64>(0)? > 0),
        )
        .unwrap_or(false);
    if exists {
        return Ok(false);
    }

    let model = data.model_id.clone().unwrap_or_else(|| "unknown".to_string());
    let total_output = data.output_tokens + data.reasoning_tokens;
    let cost = data.cost.unwrap_or(0.0);
    let created_at = data.timestamp_ms.unwrap_or(0) / 1000; // ms → seconds

    let inserted = conn
        .execute(
            "INSERT OR IGNORE INTO proxy_request_logs (
                request_id, provider_id, app_type, model, request_model,
                input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens,
                total_cost_usd, latency_ms, status_code, session_id,
                provider_type, is_streaming, cost_multiplier, created_at, data_source
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18)",
            rusqlite::params![
                request_id,
                "_mimocode_session",
                "mimocode",
                model,
                model,
                data.input_tokens,
                total_output,
                0i64, // cache_read_tokens
                0i64, // cache_creation_tokens
                cost,
                0i64, // latency_ms
                200i64, // status_code
                session_id,
                "mimocode_session",
                1i64, // is_streaming
                "1.0",
                created_at,
                "session_log",
            ],
        )
        .map_err(|e| AppError::Database(format!("插入 MiMoCode 会话日志失败: {e}")))?;

    Ok(inserted > 0)
}
