use std::fs;

use cc_switch_lib::{AppType, InstalledSkill, SkillApps, SkillService};

#[path = "support.rs"]
mod support;
use support::{create_test_state, ensure_test_home, reset_test_fs, test_mutex};

fn add_skill(state: &cc_switch_lib::AppState, id: &str, directory: &str) {
    let home = ensure_test_home();
    let skill_dir = home.join(".cc-switch").join("skills").join(directory);
    fs::create_dir_all(&skill_dir).expect("create skill dir");
    fs::write(
        skill_dir.join("SKILL.md"),
        format!("---\nname: {directory}\ndescription: test\n---\n"),
    )
    .expect("write SKILL.md");

    state
        .db
        .save_skill(&InstalledSkill {
            id: id.to_string(),
            name: directory.to_string(),
            description: Some("test".to_string()),
            directory: directory.to_string(),
            repo_owner: None,
            repo_name: None,
            repo_branch: None,
            readme_url: None,
            apps: SkillApps::default(),
            installed_at: 1,
            content_hash: None,
            updated_at: 0,
        })
        .expect("save skill");
}

#[test]
fn skill_group_crud_and_member_replacement_are_consistent() {
    let _guard = test_mutex().lock().expect("lock test fs");
    reset_test_fs();
    let state = create_test_state().expect("create state");
    add_skill(&state, "local:a", "a");
    add_skill(&state, "local:b", "b");

    let group = state
        .db
        .create_skill_group("  Daily  ")
        .expect("create group");
    assert_eq!(group.name, "Daily");
    assert!(group.skill_ids.is_empty());

    let group = state
        .db
        .replace_skill_group_members(
            &group.id,
            &["local:b".into(), "local:a".into(), "local:b".into()],
        )
        .expect("replace members");
    assert_eq!(group.skill_ids, vec!["local:b", "local:a"]);

    let renamed = state
        .db
        .update_skill_group(&group.id, "Work")
        .expect("rename group");
    assert_eq!(renamed.name, "Work");

    let err = state
        .db
        .replace_skill_group_members(&group.id, &["local:a".into(), "missing".into()])
        .expect_err("unknown member must fail");
    assert!(err.to_string().contains("missing"));
    assert_eq!(
        state
            .db
            .get_skill_group(&group.id)
            .expect("read group")
            .expect("group exists")
            .skill_ids,
        vec!["local:b", "local:a"],
        "failed replacement must roll back"
    );

    assert!(state
        .db
        .delete_skill_group(&group.id)
        .expect("delete group"));
    assert!(state
        .db
        .get_installed_skill("local:a")
        .expect("read skill")
        .is_some());
}

#[test]
fn deleting_a_skill_cascades_membership_but_keeps_group() {
    let _guard = test_mutex().lock().expect("lock test fs");
    reset_test_fs();
    let state = create_test_state().expect("create state");
    add_skill(&state, "local:a", "a");
    let group = state.db.create_skill_group("Group").expect("create group");
    state
        .db
        .replace_skill_group_members(&group.id, &["local:a".into()])
        .expect("set member");

    state.db.delete_skill("local:a").expect("delete skill");
    let remaining = state
        .db
        .get_skill_group(&group.id)
        .expect("read group")
        .expect("group remains");
    assert!(remaining.skill_ids.is_empty());
}

#[test]
fn toggling_group_reports_each_member_and_syncs_supported_app() {
    let _guard = test_mutex().lock().expect("lock test fs");
    reset_test_fs();
    ensure_test_home();
    let state = create_test_state().expect("create state");
    add_skill(&state, "local:a", "a");
    add_skill(&state, "local:b", "b");
    let group = state.db.create_skill_group("Group").expect("create group");
    state
        .db
        .replace_skill_group_members(&group.id, &["local:a".into(), "local:b".into()])
        .expect("set members");

    let enabled = SkillService::toggle_group_app(&state.db, &group.id, &AppType::Claude, true)
        .expect("enable group");
    assert_eq!(enabled.succeeded.len(), 2);
    assert!(enabled.failed.is_empty());
    let claude_skills_dir =
        SkillService::get_app_skills_dir(&AppType::Claude).expect("resolve Claude skills dir");
    assert!(claude_skills_dir.join("a/SKILL.md").exists());
    assert!(claude_skills_dir.join("b/SKILL.md").exists());
    assert!(
        state
            .db
            .get_installed_skill("local:a")
            .expect("read skill a")
            .expect("skill a exists")
            .apps
            .claude
    );

    let disabled = SkillService::toggle_group_app(&state.db, &group.id, &AppType::Claude, false)
        .expect("disable group");
    assert_eq!(disabled.succeeded.len(), 2);
    assert!(disabled.failed.is_empty());
    assert!(!claude_skills_dir.join("a").exists());
    assert!(!claude_skills_dir.join("b").exists());
}

#[test]
fn toggling_group_rejects_apps_without_skill_support() {
    let _guard = test_mutex().lock().expect("lock test fs");
    reset_test_fs();
    let state = create_test_state().expect("create state");
    let group = state.db.create_skill_group("Group").expect("create group");

    let err = SkillService::toggle_group_app(&state.db, &group.id, &AppType::OpenClaw, true)
        .expect_err("OpenClaw must be rejected");
    assert!(err.to_string().contains("不支持 Skills"));
}
