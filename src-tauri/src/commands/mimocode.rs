use tauri::State;

use crate::mimocode_config;
use crate::store::AppState;

// ============================================================================
// MiMoCode Provider Commands
// ============================================================================

/// Import providers from MiMoCode live config to database.
///
/// MiMoCode uses additive mode — users may already have providers
/// configured in mimocode.json.
#[tauri::command]
pub fn import_mimocode_providers_from_live(state: State<'_, AppState>) -> Result<usize, String> {
    crate::services::provider::import_mimocode_providers_from_live(state.inner())
        .map_err(|e| e.to_string())
}

/// Get provider names in the MiMoCode live config.
#[tauri::command]
pub fn get_mimocode_live_provider_ids() -> Result<Vec<String>, String> {
    mimocode_config::get_providers()
        .map(|providers| providers.keys().cloned().collect())
        .map_err(|e| e.to_string())
}
