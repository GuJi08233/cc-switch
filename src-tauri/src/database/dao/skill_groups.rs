//! Skills 分组 DAO。

use crate::database::{lock_conn, Database};
use crate::error::AppError;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SkillGroup {
    pub id: String,
    pub name: String,
    pub skill_ids: Vec<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SkillGroupToggleFailure {
    pub skill_id: String,
    pub error: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SkillGroupToggleResult {
    pub group_id: String,
    pub app: String,
    pub enabled: bool,
    pub succeeded: Vec<String>,
    pub failed: Vec<SkillGroupToggleFailure>,
}

fn normalize_group_name(name: &str) -> Result<String, AppError> {
    let name = name.trim();
    if name.is_empty() {
        return Err(AppError::InvalidInput("Skill 分组名称不能为空".to_string()));
    }
    if name.chars().count() > 100 {
        return Err(AppError::InvalidInput(
            "Skill 分组名称不能超过 100 个字符".to_string(),
        ));
    }
    Ok(name.to_string())
}

fn load_group(conn: &Connection, id: &str) -> Result<Option<SkillGroup>, AppError> {
    let row = conn
        .query_row(
            "SELECT id, name, created_at, updated_at FROM skill_groups WHERE id = ?1",
            [id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, i64>(2)?,
                    row.get::<_, i64>(3)?,
                ))
            },
        )
        .optional()
        .map_err(|e| AppError::Database(e.to_string()))?;

    let Some((id, name, created_at, updated_at)) = row else {
        return Ok(None);
    };
    let mut stmt = conn
        .prepare(
            "SELECT skill_id FROM skill_group_members
             WHERE group_id = ?1 ORDER BY sort_index ASC, skill_id ASC",
        )
        .map_err(|e| AppError::Database(e.to_string()))?;
    let skill_ids = stmt
        .query_map([&id], |row| row.get::<_, String>(0))
        .map_err(|e| AppError::Database(e.to_string()))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| AppError::Database(e.to_string()))?;

    Ok(Some(SkillGroup {
        id,
        name,
        skill_ids,
        created_at,
        updated_at,
    }))
}

impl Database {
    pub fn get_skill_groups(&self) -> Result<Vec<SkillGroup>, AppError> {
        let conn = lock_conn!(self.conn);
        let mut stmt = conn
            .prepare("SELECT id FROM skill_groups ORDER BY created_at ASC, id ASC")
            .map_err(|e| AppError::Database(e.to_string()))?;
        let ids = stmt
            .query_map([], |row| row.get::<_, String>(0))
            .map_err(|e| AppError::Database(e.to_string()))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| AppError::Database(e.to_string()))?;
        ids.into_iter()
            .map(|id| {
                load_group(&conn, &id)?
                    .ok_or_else(|| AppError::Database(format!("Skill 分组在读取期间消失: {id}")))
            })
            .collect()
    }

    pub fn get_skill_group(&self, id: &str) -> Result<Option<SkillGroup>, AppError> {
        let conn = lock_conn!(self.conn);
        load_group(&conn, id)
    }

    pub fn create_skill_group(&self, name: &str) -> Result<SkillGroup, AppError> {
        let name = normalize_group_name(name)?;
        let now = chrono::Utc::now().timestamp();
        let id = uuid::Uuid::new_v4().to_string();
        let conn = lock_conn!(self.conn);
        conn.execute(
            "INSERT INTO skill_groups (id, name, created_at, updated_at) VALUES (?1, ?2, ?3, ?3)",
            params![id, name, now],
        )
        .map_err(|e| AppError::Database(format!("创建 Skill 分组失败: {e}")))?;
        load_group(&conn, &id)?
            .ok_or_else(|| AppError::Database(format!("Skill 分组创建后无法读取: {id}")))
    }

    pub fn update_skill_group(&self, id: &str, name: &str) -> Result<SkillGroup, AppError> {
        let name = normalize_group_name(name)?;
        let now = chrono::Utc::now().timestamp();
        let conn = lock_conn!(self.conn);
        let affected = conn
            .execute(
                "UPDATE skill_groups SET name = ?1, updated_at = ?2 WHERE id = ?3",
                params![name, now, id],
            )
            .map_err(|e| AppError::Database(format!("重命名 Skill 分组失败: {e}")))?;
        if affected == 0 {
            return Err(AppError::InvalidInput(format!("Skill 分组不存在: {id}")));
        }
        load_group(&conn, id)?
            .ok_or_else(|| AppError::Database(format!("Skill 分组更新后无法读取: {id}")))
    }

    pub fn delete_skill_group(&self, id: &str) -> Result<bool, AppError> {
        let conn = lock_conn!(self.conn);
        let affected = conn
            .execute("DELETE FROM skill_groups WHERE id = ?1", [id])
            .map_err(|e| AppError::Database(format!("删除 Skill 分组失败: {e}")))?;
        Ok(affected > 0)
    }

    pub fn replace_skill_group_members(
        &self,
        id: &str,
        skill_ids: &[String],
    ) -> Result<SkillGroup, AppError> {
        let mut unique_ids = Vec::new();
        let mut seen = HashSet::new();
        for skill_id in skill_ids {
            if seen.insert(skill_id.clone()) {
                unique_ids.push(skill_id.clone());
            }
        }

        let mut conn = lock_conn!(self.conn);
        let tx = conn
            .transaction()
            .map_err(|e| AppError::Database(e.to_string()))?;
        let exists: bool = tx
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM skill_groups WHERE id = ?1)",
                [id],
                |row| row.get(0),
            )
            .map_err(|e| AppError::Database(e.to_string()))?;
        if !exists {
            return Err(AppError::InvalidInput(format!("Skill 分组不存在: {id}")));
        }

        for skill_id in &unique_ids {
            let skill_exists: bool = tx
                .query_row(
                    "SELECT EXISTS(SELECT 1 FROM skills WHERE id = ?1)",
                    [skill_id],
                    |row| row.get(0),
                )
                .map_err(|e| AppError::Database(e.to_string()))?;
            if !skill_exists {
                return Err(AppError::InvalidInput(format!(
                    "无法添加不存在的 Skill 到分组: {skill_id}"
                )));
            }
        }

        tx.execute("DELETE FROM skill_group_members WHERE group_id = ?1", [id])
            .map_err(|e| AppError::Database(e.to_string()))?;
        for (index, skill_id) in unique_ids.iter().enumerate() {
            tx.execute(
                "INSERT INTO skill_group_members (group_id, skill_id, sort_index) VALUES (?1, ?2, ?3)",
                params![id, skill_id, index as i64],
            )
            .map_err(|e| AppError::Database(e.to_string()))?;
        }
        tx.execute(
            "UPDATE skill_groups SET updated_at = ?1 WHERE id = ?2",
            params![chrono::Utc::now().timestamp(), id],
        )
        .map_err(|e| AppError::Database(e.to_string()))?;
        tx.commit().map_err(|e| AppError::Database(e.to_string()))?;

        drop(conn);
        let conn = lock_conn!(self.conn);
        load_group(&conn, id)?
            .ok_or_else(|| AppError::Database(format!("Skill 分组成员更新后无法读取: {id}")))
    }
}
