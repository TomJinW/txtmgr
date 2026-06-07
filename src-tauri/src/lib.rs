use std::{fs, path::PathBuf, sync::Mutex, time::Duration};

use keyring::Entry;
use serde::{Deserialize, Serialize};
use tauri::{
    menu::{Menu, MenuItemBuilder, MenuItemKind, SubmenuBuilder},
    utils::config::WebviewUrl,
    AppHandle, Emitter, Manager, Runtime, State, WebviewWindowBuilder, WindowEvent,
};

const GO_TO_ROW_MENU_ID: &str = "go_to_row";
const OPEN_ENCODING_MANAGER_MENU_ID: &str = "open_encoding_manager";
const LLM_SERVER_SETTINGS_MENU_ID: &str = "llm_server_settings";
const AI_TRANSLATION_MENU_ID: &str = "ai_translation";
const READ_JSON_MENU_ID: &str = "read_json";
const SAVE_JSON_MENU_ID: &str = "save_json";
const SAVE_JSON_AS_MENU_ID: &str = "save_json_as";
const IMPORT_EXCEL_MENU_ID: &str = "import_excel";
const EXPORT_EXCEL_MENU_ID: &str = "export_excel";
const IMPORT_SRT_MENU_ID: &str = "import_srt";
const EXPORT_SRT_MENU_ID: &str = "export_srt";
const OPEN_LANGUAGE_DIALOG_MENU_ID: &str = "open_language_dialog";
const LANGUAGE_EN_MENU_ID: &str = "language_en";
const LANGUAGE_ZH_HANS_MENU_ID: &str = "language_zh_hans";
const CHARACTER_STATS_MENU_ID: &str = "character_stats";
const UNDO_TABLE_CHANGE_MENU_ID: &str = "undo_table_change";
const REDO_TABLE_CHANGE_MENU_ID: &str = "redo_table_change";
const CLEAR_LIST_MENU_ID: &str = "clear_list";
const DELETE_SELECTED_MENU_ID: &str = "delete_selected";
const BULK_CHANGE_STATE_MENU_ID: &str = "bulk_change_state";
const ENCODING_IMPORT_MENU_ID: &str = "encoding_import";
const ENCODING_READ_JSON_MENU_ID: &str = "encoding_read_json";
const ENCODING_SAVE_JSON_MENU_ID: &str = "encoding_save_json";
const ENCODING_SAVE_JSON_AS_MENU_ID: &str = "encoding_save_json_as";
const ENCODING_EXPORT_MENU_ID: &str = "encoding_export";
const ENCODING_IMPORT_EXCEL_MENU_ID: &str = "encoding_import_excel";
const ENCODING_EXPORT_EXCEL_MENU_ID: &str = "encoding_export_excel";
const ENCODING_UNMAPPED_CHARACTERS_MENU_ID: &str = "encoding_unmapped_characters";
const ENCODING_UNUSED_ENCODINGS_MENU_ID: &str = "encoding_unused_encodings";
const ENCODING_LINE_LENGTH_MENU_ID: &str = "encoding_line_length";
const ENCODING_GO_TO_ROW_MENU_ID: &str = "encoding_go_to_row";
const ENCODING_CLEAR_LIST_MENU_ID: &str = "encoding_clear_list";
const ENCODING_DELETE_SELECTED_MENU_ID: &str = "encoding_delete_selected";
const LLM_API_KEY_SERVICE: &str = "txtmgr.llm";
const LLM_API_KEY_ACCOUNT: &str = "default_api_key";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LlmConnectionSettings {
    provider_mode: String,
    base_url: String,
    model: String,
    organization: String,
    project: String,
    timeout_seconds: u64,
    extra_request_json: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct LlmConnectionTestResult {
    ok: bool,
    message: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LlmTranslationRequest {
    settings: LlmConnectionSettings,
    api_key_override: String,
    prompt: String,
    temperature: f64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct LlmTranslationResult {
    translated_text: String,
    note: String,
    raw_content: String,
}

#[derive(Debug, Deserialize)]
struct ChatCompletionResponse {
    choices: Vec<ChatCompletionChoice>,
}

#[derive(Debug, Deserialize)]
struct ChatCompletionChoice {
    message: Option<ChatCompletionMessage>,
    text: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ChatCompletionMessage {
    content: Option<String>,
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
struct SentenceCoverageRow {
    index: usize,
    translated_text: String,
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
struct SentenceCoverageSource {
    all: Vec<SentenceCoverageRow>,
    filtered: Vec<SentenceCoverageRow>,
    selected: Vec<SentenceCoverageRow>,
}

type SentenceCoverageStore = Mutex<SentenceCoverageSource>;

// Table drafts are user document state, so they live in Tauri app data instead
// of browser localStorage. The frontend still reads legacy localStorage once
// and writes migrated data through these commands.
fn app_draft_path<R: Runtime>(app: &AppHandle<R>, name: &str) -> Result<PathBuf, String> {
    let file_name = match name {
        "main" => "main-draft.json",
        "encoding" => "encoding-draft.json",
        _ => return Err("Unknown draft name.".to_string()),
    };

    let dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Failed to resolve app data directory: {error}"))?;
    Ok(dir.join("drafts").join(file_name))
}

#[tauri::command]
fn read_app_draft(app: AppHandle, name: String) -> Result<Option<String>, String> {
    let path = app_draft_path(&app, &name)?;
    match fs::read_to_string(&path) {
        Ok(contents) => Ok(Some(contents)),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(format!("Failed to read app draft: {error}")),
    }
}

#[tauri::command]
fn write_app_draft(app: AppHandle, name: String, contents: String) -> Result<(), String> {
    let path = app_draft_path(&app, &name)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Failed to create app draft directory: {error}"))?;
    }
    fs::write(path, contents).map_err(|error| format!("Failed to write app draft: {error}"))
}

#[tauri::command]
fn delete_app_draft(app: AppHandle, name: String) -> Result<(), String> {
    let path = app_draft_path(&app, &name)?;
    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(format!("Failed to delete app draft: {error}")),
    }
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn set_sentence_coverage_source(
    store: State<SentenceCoverageStore>,
    source: SentenceCoverageSource,
) -> Result<(), String> {
    // Encoding Manager checks need translated_text from the main window even
    // when the encoding window is focused. Keep only the small coverage shape.
    let mut stored_source = store
        .lock()
        .map_err(|_| "Failed to lock sentence coverage source.".to_string())?;
    *stored_source = source;
    Ok(())
}

#[tauri::command]
fn get_sentence_coverage_source(
    store: State<SentenceCoverageStore>,
) -> Result<SentenceCoverageSource, String> {
    store
        .lock()
        .map(|source| source.clone())
        .map_err(|_| "Failed to lock sentence coverage source.".to_string())
}

#[tauri::command]
fn save_llm_api_key(api_key: String) -> Result<(), String> {
    let trimmed_key = api_key.trim();
    if trimmed_key.is_empty() {
        return delete_llm_api_key();
    }

    llm_api_key_entry()?
        .set_password(trimmed_key)
        .map_err(|error| format!("Failed to save API key in system credential store: {error}"))
}

#[tauri::command]
fn delete_llm_api_key() -> Result<(), String> {
    match llm_api_key_entry()?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(format!(
            "Failed to delete API key from system credential store: {error}"
        )),
    }
}

#[tauri::command]
fn has_llm_api_key() -> Result<bool, String> {
    match llm_api_key_entry()?.get_password() {
        Ok(key) => Ok(!key.trim().is_empty()),
        Err(keyring::Error::NoEntry) => Ok(false),
        Err(error) => Err(format!(
            "Failed to read API key from system credential store: {error}"
        )),
    }
}

#[tauri::command]
async fn test_llm_connection(
    settings: LlmConnectionSettings,
    api_key_override: String,
) -> Result<LlmConnectionTestResult, String> {
    let base_url = settings.base_url.trim().trim_end_matches('/');
    if base_url.is_empty() {
        return Ok(LlmConnectionTestResult {
            ok: false,
            message: "Base URL is required.".to_string(),
        });
    }

    let timeout_seconds = settings.timeout_seconds.clamp(1, 600);
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(timeout_seconds))
        .build()
        .map_err(|error| format!("Failed to create HTTP client: {error}"))?;

    let api_key = if api_key_override.trim().is_empty() {
        read_llm_api_key().unwrap_or_default()
    } else {
        api_key_override.trim().to_string()
    };

    let model_hint = settings.model.trim();
    let test_urls = llm_test_urls(base_url, settings.provider_mode.as_str());
    let mut last_error = String::new();

    // Some local servers expose OpenAI-compatible /models, while Ollama may
    // answer /api/tags. Try compatible endpoints and report the last failure.
    for url in test_urls {
        let mut request = client.get(&url);
        if !api_key.is_empty() {
            request = request.bearer_auth(&api_key);
        }

        match request.send().await {
            Ok(response) => {
                let status = response.status();
                if status.is_success() {
                    let message = if model_hint.is_empty() {
                        format!("Connection succeeded: {url}")
                    } else {
                        format!("Connection succeeded: {url}. Model name was not validated yet.")
                    };
                    return Ok(LlmConnectionTestResult { ok: true, message });
                }

                let body = response.text().await.unwrap_or_default();
                last_error = if body.trim().is_empty() {
                    format!("{url} returned HTTP {status}.")
                } else {
                    format!(
                        "{url} returned HTTP {status}: {}",
                        truncate_for_status(&body)
                    )
                };
            }
            Err(error) => {
                last_error = format!("{url} failed: {error}");
            }
        }
    }

    Ok(LlmConnectionTestResult {
        ok: false,
        message: if last_error.is_empty() {
            "Connection test failed.".to_string()
        } else {
            last_error
        },
    })
}

#[tauri::command]
async fn translate_with_llm(
    request: LlmTranslationRequest,
) -> Result<LlmTranslationResult, String> {
    let base_url = request.settings.base_url.trim().trim_end_matches('/');
    if base_url.is_empty() {
        return Err("Base URL is required.".to_string());
    }

    let model = request.settings.model.trim();
    if model.is_empty() {
        return Err("Model is required.".to_string());
    }

    let timeout_seconds = request.settings.timeout_seconds.clamp(1, 600);
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(timeout_seconds))
        .build()
        .map_err(|error| format!("Failed to create HTTP client: {error}"))?;

    let api_key = if request.api_key_override.trim().is_empty() {
        read_llm_api_key().unwrap_or_default()
    } else {
        request.api_key_override.trim().to_string()
    };

    let url = format!("{base_url}/chat/completions");
    let mut body = serde_json::json!({
        "model": model,
        "messages": [
            {
                "role": "user",
                "content": request.prompt,
            }
        ],
        "temperature": request.temperature.clamp(0.0, 2.0),
    });

    // Extra JSON is merged last so local-model knobs such as
    // chat_template_kwargs.enable_thinking can override defaults.
    merge_extra_request_json(&mut body, request.settings.extra_request_json.trim())?;

    let mut http_request = client.post(&url).json(&body);
    if !api_key.is_empty() {
        http_request = http_request.bearer_auth(&api_key);
    }
    if !request.settings.organization.trim().is_empty() {
        http_request =
            http_request.header("OpenAI-Organization", request.settings.organization.trim());
    }
    if !request.settings.project.trim().is_empty() {
        http_request = http_request.header("OpenAI-Project", request.settings.project.trim());
    }

    let response = http_request
        .send()
        .await
        .map_err(|error| format!("{url} failed: {error}"))?;
    let status = response.status();
    let response_text = response.text().await.unwrap_or_default();
    if !status.is_success() {
        return Err(if response_text.trim().is_empty() {
            format!("{url} returned HTTP {status}.")
        } else {
            format!(
                "{url} returned HTTP {status}: {}",
                truncate_for_status(&response_text)
            )
        });
    }

    let chat_response: ChatCompletionResponse = match serde_json::from_str(&response_text) {
        Ok(response) => response,
        Err(error) => {
            // Return the raw body as the candidate so users can debug servers
            // that do not send OpenAI-compatible JSON.
            return Ok(LlmTranslationResult {
                translated_text: response_text.trim().to_string(),
                note: format!(
                    "Failed to parse chat completion response: {error}. Raw server response is shown in Candidate."
                ),
                raw_content: response_text,
            });
        }
    };
    let raw_content = chat_response
        .choices
        .first()
        .and_then(|choice| {
            choice
                .message
                .as_ref()
                .and_then(|message| message.content.clone())
                .or_else(|| choice.text.clone())
        })
        .unwrap_or_default();

    Ok(parse_translation_content(&raw_content))
}

fn merge_extra_request_json(body: &mut serde_json::Value, extra_json: &str) -> Result<(), String> {
    if extra_json.is_empty() {
        return Ok(());
    }

    let extra_value = parse_extra_request_json(extra_json)?;
    let extra_object = extra_value
        .as_object()
        .ok_or_else(|| "Extra request JSON must be a JSON object.".to_string())?;
    let body_object = body
        .as_object_mut()
        .ok_or_else(|| "LLM request body was not a JSON object.".to_string())?;

    for (key, value) in extra_object {
        body_object.insert(key.clone(), value.clone());
    }

    Ok(())
}

fn parse_extra_request_json(extra_json: &str) -> Result<serde_json::Value, String> {
    match serde_json::from_str::<serde_json::Value>(extra_json) {
        Ok(value) => Ok(value),
        Err(original_error) => {
            // Allow users to paste a field fragment instead of a full object.
            let wrapped_json = format!("{{{extra_json}}}");
            serde_json::from_str::<serde_json::Value>(&wrapped_json).map_err(|wrapped_error| {
                format!(
                    "Extra request JSON is invalid. Use a JSON object such as {{ \"chat_template_kwargs\": {{ \"enable_thinking\": false }} }}. Original parse error: {original_error}. Wrapped field parse error: {wrapped_error}"
                )
            })
        }
    }
}

fn parse_translation_content(raw_content: &str) -> LlmTranslationResult {
    let trimmed = raw_content.trim();
    // Models sometimes wrap JSON with prose or markdown. Extract the outer JSON
    // object when possible, but preserve raw content for debugging.
    let json_text = extract_json_object(trimmed).unwrap_or(trimmed);
    match serde_json::from_str::<serde_json::Value>(json_text) {
        Ok(value) => {
            let translated_text = value
                .get("translated_text")
                .and_then(|item| item.as_str())
                .unwrap_or_default()
                .to_string();
            let note = value
                .get("note")
                .and_then(|item| item.as_str())
                .unwrap_or_default()
                .to_string();
            if !translated_text.trim().is_empty() {
                return LlmTranslationResult {
                    translated_text,
                    note,
                    raw_content: raw_content.to_string(),
                };
            }

            return LlmTranslationResult {
                translated_text: trimmed.to_string(),
                note: "Model response JSON did not contain a non-empty translated_text. Raw model response is shown in Candidate.".to_string(),
                raw_content: raw_content.to_string(),
            };
        }
        Err(error) => {
            return LlmTranslationResult {
                translated_text: trimmed.to_string(),
                note: format!(
                    "Failed to parse model response as translation JSON: {error}. Raw model response is shown in Candidate."
                ),
                raw_content: raw_content.to_string(),
            };
        }
    }
}

fn extract_json_object(value: &str) -> Option<&str> {
    let start = value.find('{')?;
    let end = value.rfind('}')?;
    if end <= start {
        return None;
    }
    Some(&value[start..=end])
}

fn llm_api_key_entry() -> Result<Entry, String> {
    Entry::new(LLM_API_KEY_SERVICE, LLM_API_KEY_ACCOUNT)
        .map_err(|error| format!("Failed to open system credential store: {error}"))
}

fn read_llm_api_key() -> Result<String, String> {
    match llm_api_key_entry()?.get_password() {
        Ok(key) => Ok(key),
        Err(keyring::Error::NoEntry) => Ok(String::new()),
        Err(error) => Err(format!(
            "Failed to read API key from system credential store: {error}"
        )),
    }
}

fn llm_test_urls(base_url: &str, provider_mode: &str) -> Vec<String> {
    let mut urls = vec![format!("{base_url}/models")];
    if provider_mode == "local" {
        let ollama_base = base_url.trim_end_matches("/v1");
        let ollama_tags = format!("{ollama_base}/api/tags");
        if !urls.iter().any(|url| url == &ollama_tags) {
            urls.push(ollama_tags);
        }
    }
    urls
}

fn truncate_for_status(value: &str) -> String {
    const MAX_LEN: usize = 240;
    let trimmed = value.trim();
    if trimmed.chars().count() <= MAX_LEN {
        return trimmed.to_string();
    }

    let mut truncated: String = trimmed.chars().take(MAX_LEN).collect();
    truncated.push_str("...");
    truncated
}

fn shortcut_accelerator(menu_id: &str) -> String {
    // Rust menus and the Windows frontend fallback share this manifest. Add new
    // shortcuts there first so both paths stay synchronized.
    let manifest: serde_json::Value =
        serde_json::from_str(include_str!("../../src/shortcutManifest.json"))
            .expect("shortcut manifest should be valid JSON");
    let platform_key = if cfg!(target_os = "macos") {
        "mac"
    } else {
        "other"
    };

    manifest
        .get(menu_id)
        .and_then(|entry| entry.get(platform_key))
        .and_then(|value| value.as_str())
        .unwrap_or_else(|| panic!("missing shortcut for menu id {menu_id}"))
        .to_string()
}

fn find_menu_item<R: Runtime>(items: Vec<MenuItemKind<R>>, id: &str) -> Option<MenuItemKind<R>> {
    for item in items {
        if item.id().as_ref() == id {
            return Some(item);
        }

        if let Some(submenu) = item.as_submenu() {
            if let Ok(children) = submenu.items() {
                if let Some(found) = find_menu_item(children, id) {
                    return Some(found);
                }
            }
        }
    }

    None
}

fn set_menu_item_enabled<R: Runtime>(
    app: &AppHandle<R>,
    id: &str,
    enabled: bool,
) -> tauri::Result<()> {
    if let Some(menu) = app.menu() {
        if let Some(item) = find_menu_item(menu.items()?, id) {
            if let Some(menu_item) = item.as_menuitem() {
                menu_item.set_enabled(enabled)?;
            }
        }
    }

    Ok(())
}

#[tauri::command]
fn set_history_menu_enabled(app: AppHandle, can_undo: bool, can_redo: bool) -> Result<(), String> {
    set_menu_item_enabled(&app, UNDO_TABLE_CHANGE_MENU_ID, can_undo)
        .map_err(|error| error.to_string())?;
    set_menu_item_enabled(&app, REDO_TABLE_CHANGE_MENU_ID, can_redo)
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
fn set_app_language_menu(app: AppHandle, language: String) -> Result<(), String> {
    let encoding_is_focused = app
        .get_webview_window("encoding")
        .and_then(|window| window.is_focused().ok())
        .unwrap_or(false);
    let language = normalize_app_language(&language);

    #[cfg(target_os = "macos")]
    {
        // macOS has one app menu bar, so it must be rebuilt for whichever
        // window is active. Windows/Linux attach menus to each window.
        if encoding_is_focused {
            let menu =
                build_encoding_menu_for(&app, language).map_err(|error| error.to_string())?;
            app.set_menu(menu).map_err(|error| error.to_string())?;
        } else {
            let menu = build_main_menu_for(&app, language).map_err(|error| error.to_string())?;
            app.set_menu(menu).map_err(|error| error.to_string())?;
        }
        return Ok(());
    }

    #[cfg(not(target_os = "macos"))]
    {
        if encoding_is_focused {
            #[cfg(target_os = "windows")]
            {
                if let Some(window) = app.get_webview_window("encoding") {
                    let menu = build_encoding_menu_for(&app, language)
                        .map_err(|error| error.to_string())?;
                    window.set_menu(menu).map_err(|error| error.to_string())?;
                }
            }
        } else if let Some(window) = app.get_webview_window("main") {
            let menu = build_main_menu_for(&app, language).map_err(|error| error.to_string())?;
            window.set_menu(menu).map_err(|error| error.to_string())?;
        }
        return Ok(());
    }
}

fn normalize_app_language(language: &str) -> &'static str {
    if language == "zh-Hans" {
        "zh-Hans"
    } else {
        "en"
    }
}

fn menu_label(language: &str, key: &str) -> &'static str {
    let zh = language == "zh-Hans";
    match key {
        "file" => {
            if zh {
                "文件"
            } else {
                "File"
            }
        }
        "tools" => {
            if zh {
                "工具"
            } else {
                "Tools"
            }
        }
        "statistics" => {
            if zh {
                "统计"
            } else {
                "Statistics"
            }
        }
        "language" => {
            if zh {
                "语言"
            } else {
                "Language"
            }
        }
        "language_dialog" => {
            if zh {
                "语言..."
            } else {
                "Language..."
            }
        }
        "read_json" => {
            if zh {
                "读取 JSON..."
            } else {
                "Read JSON..."
            }
        }
        "save_json" => {
            if zh {
                "保存 JSON"
            } else {
                "Save JSON"
            }
        }
        "save_json_as" => {
            if zh {
                "JSON 另存为..."
            } else {
                "Save JSON As..."
            }
        }
        "import_excel" => {
            if zh {
                "导入 Excel..."
            } else {
                "Import Excel..."
            }
        }
        "export_excel" => {
            if zh {
                "导出 Excel..."
            } else {
                "Export Excel..."
            }
        }
        "import_srt" => {
            if zh {
                "导入 SRT..."
            } else {
                "Import SRT..."
            }
        }
        "export_srt" => {
            if zh {
                "导出 SRT..."
            } else {
                "Export SRT..."
            }
        }
        "go_to_row" => {
            if zh {
                "跳转到行..."
            } else {
                "Go to Row..."
            }
        }
        "encoding_manager" => {
            if zh {
                "码表管理器..."
            } else {
                "Encoding Manager..."
            }
        }
        "llm_settings" => {
            if zh {
                "LLM 服务器设置..."
            } else {
                "LLM Server Settings..."
            }
        }
        "ai_translation" => {
            if zh {
                "AI 翻译..."
            } else {
                "AI Translation..."
            }
        }
        "clear_list" => {
            if zh {
                "清空列表"
            } else {
                "Clear List"
            }
        }
        "delete_selected" => {
            if zh {
                "删除选中"
            } else {
                "Delete Selected"
            }
        }
        "bulk_state" => {
            if zh {
                "修改选中状态..."
            } else {
                "Change Selected State..."
            }
        }
        "character_count" => {
            if zh {
                "字符统计..."
            } else {
                "Character Count..."
            }
        }
        "import_tbl" => {
            if zh {
                "导入 TBL..."
            } else {
                "Import TBL..."
            }
        }
        "export_tbl" => {
            if zh {
                "导出 TBL..."
            } else {
                "Export TBL..."
            }
        }
        "unmapped" => {
            if zh {
                "未映射字符..."
            } else {
                "Unmapped Characters..."
            }
        }
        "unused" => {
            if zh {
                "未使用编码..."
            } else {
                "Unused Encodings..."
            }
        }
        "line_length" => {
            if zh {
                "自然行长度检查..."
            } else {
                "Line Length Check..."
            }
        }
        _ => "",
    }
}

fn build_encoding_menu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    build_encoding_menu_for(app, "en")
}

fn build_main_menu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    build_main_menu_for(app, "en")
}

fn build_encoding_menu_for<R: Runtime>(
    app: &AppHandle<R>,
    language: &str,
) -> tauri::Result<Menu<R>> {
    let language = normalize_app_language(language);
    let read_json = MenuItemBuilder::with_id(
        ENCODING_READ_JSON_MENU_ID,
        menu_label(language, "read_json"),
    )
    .accelerator(shortcut_accelerator(ENCODING_READ_JSON_MENU_ID))
    .build(app)?;

    let save_json = MenuItemBuilder::with_id(
        ENCODING_SAVE_JSON_MENU_ID,
        menu_label(language, "save_json"),
    )
    .accelerator(shortcut_accelerator(ENCODING_SAVE_JSON_MENU_ID))
    .build(app)?;

    let save_json_as = MenuItemBuilder::with_id(
        ENCODING_SAVE_JSON_AS_MENU_ID,
        menu_label(language, "save_json_as"),
    )
    .accelerator(shortcut_accelerator(ENCODING_SAVE_JSON_AS_MENU_ID))
    .build(app)?;

    let import_encoding =
        MenuItemBuilder::with_id(ENCODING_IMPORT_MENU_ID, menu_label(language, "import_tbl"))
            .accelerator(shortcut_accelerator(ENCODING_IMPORT_MENU_ID))
            .build(app)?;

    let import_encoding_excel = MenuItemBuilder::with_id(
        ENCODING_IMPORT_EXCEL_MENU_ID,
        menu_label(language, "import_excel"),
    )
    .accelerator(shortcut_accelerator(ENCODING_IMPORT_EXCEL_MENU_ID))
    .build(app)?;

    let export_encoding =
        MenuItemBuilder::with_id(ENCODING_EXPORT_MENU_ID, menu_label(language, "export_tbl"))
            .accelerator(shortcut_accelerator(ENCODING_EXPORT_MENU_ID))
            .build(app)?;

    let export_encoding_excel = MenuItemBuilder::with_id(
        ENCODING_EXPORT_EXCEL_MENU_ID,
        menu_label(language, "export_excel"),
    )
    .accelerator(shortcut_accelerator(ENCODING_EXPORT_EXCEL_MENU_ID))
    .build(app)?;

    let go_to_row = MenuItemBuilder::with_id(
        ENCODING_GO_TO_ROW_MENU_ID,
        menu_label(language, "go_to_row"),
    )
    .accelerator(shortcut_accelerator(ENCODING_GO_TO_ROW_MENU_ID))
    .build(app)?;

    let clear_list = MenuItemBuilder::with_id(
        ENCODING_CLEAR_LIST_MENU_ID,
        menu_label(language, "clear_list"),
    )
    .accelerator(shortcut_accelerator(ENCODING_CLEAR_LIST_MENU_ID))
    .build(app)?;

    let delete_selected = MenuItemBuilder::with_id(
        ENCODING_DELETE_SELECTED_MENU_ID,
        menu_label(language, "delete_selected"),
    )
    .accelerator(shortcut_accelerator(ENCODING_DELETE_SELECTED_MENU_ID))
    .build(app)?;

    let unmapped_characters = MenuItemBuilder::with_id(
        ENCODING_UNMAPPED_CHARACTERS_MENU_ID,
        menu_label(language, "unmapped"),
    )
    .accelerator(shortcut_accelerator(ENCODING_UNMAPPED_CHARACTERS_MENU_ID))
    .build(app)?;

    let unused_encodings = MenuItemBuilder::with_id(
        ENCODING_UNUSED_ENCODINGS_MENU_ID,
        menu_label(language, "unused"),
    )
    .accelerator(shortcut_accelerator(ENCODING_UNUSED_ENCODINGS_MENU_ID))
    .build(app)?;

    let line_length = MenuItemBuilder::with_id(
        ENCODING_LINE_LENGTH_MENU_ID,
        menu_label(language, "line_length"),
    )
    .accelerator(shortcut_accelerator(ENCODING_LINE_LENGTH_MENU_ID))
    .build(app)?;

    let language_dialog = MenuItemBuilder::with_id(
        OPEN_LANGUAGE_DIALOG_MENU_ID,
        menu_label(language, "language_dialog"),
    )
    .accelerator(shortcut_accelerator(OPEN_LANGUAGE_DIALOG_MENU_ID))
    .build(app)?;

    let file_menu = SubmenuBuilder::new(app, menu_label(language, "file"))
        .item(&read_json)
        .item(&save_json)
        .item(&save_json_as)
        .item(&import_encoding)
        .item(&export_encoding)
        .item(&import_encoding_excel)
        .item(&export_encoding_excel)
        .build()?;

    let tools_menu = SubmenuBuilder::new(app, menu_label(language, "tools"))
        .item(&go_to_row)
        .item(&language_dialog)
        .item(&clear_list)
        .item(&delete_selected)
        .build()?;

    let statistics_menu = SubmenuBuilder::new(app, menu_label(language, "statistics"))
        .item(&unmapped_characters)
        .item(&unused_encodings)
        .item(&line_length)
        .build()?;

    let menu = Menu::default(app)?;
    menu.append(&file_menu)?;
    menu.append(&tools_menu)?;
    menu.append(&statistics_menu)?;
    Ok(menu)
}

fn build_main_menu_for<R: Runtime>(app: &AppHandle<R>, language: &str) -> tauri::Result<Menu<R>> {
    let language = normalize_app_language(language);
    let read_json = MenuItemBuilder::with_id(READ_JSON_MENU_ID, menu_label(language, "read_json"))
        .accelerator(shortcut_accelerator(READ_JSON_MENU_ID))
        .build(app)?;

    let save_json = MenuItemBuilder::with_id(SAVE_JSON_MENU_ID, menu_label(language, "save_json"))
        .accelerator(shortcut_accelerator(SAVE_JSON_MENU_ID))
        .build(app)?;

    let save_json_as =
        MenuItemBuilder::with_id(SAVE_JSON_AS_MENU_ID, menu_label(language, "save_json_as"))
            .accelerator(shortcut_accelerator(SAVE_JSON_AS_MENU_ID))
            .build(app)?;

    let import_excel =
        MenuItemBuilder::with_id(IMPORT_EXCEL_MENU_ID, menu_label(language, "import_excel"))
            .accelerator(shortcut_accelerator(IMPORT_EXCEL_MENU_ID))
            .build(app)?;

    let export_excel =
        MenuItemBuilder::with_id(EXPORT_EXCEL_MENU_ID, menu_label(language, "export_excel"))
            .accelerator(shortcut_accelerator(EXPORT_EXCEL_MENU_ID))
            .build(app)?;

    let import_srt =
        MenuItemBuilder::with_id(IMPORT_SRT_MENU_ID, menu_label(language, "import_srt"))
            .accelerator(shortcut_accelerator(IMPORT_SRT_MENU_ID))
            .build(app)?;

    let export_srt =
        MenuItemBuilder::with_id(EXPORT_SRT_MENU_ID, menu_label(language, "export_srt"))
            .accelerator(shortcut_accelerator(EXPORT_SRT_MENU_ID))
            .build(app)?;

    let go_to_row = MenuItemBuilder::with_id(GO_TO_ROW_MENU_ID, menu_label(language, "go_to_row"))
        .accelerator(shortcut_accelerator(GO_TO_ROW_MENU_ID))
        .build(app)?;

    let open_encoding_manager = MenuItemBuilder::with_id(
        OPEN_ENCODING_MANAGER_MENU_ID,
        menu_label(language, "encoding_manager"),
    )
    .accelerator(shortcut_accelerator(OPEN_ENCODING_MANAGER_MENU_ID))
    .build(app)?;

    let llm_server_settings = MenuItemBuilder::with_id(
        LLM_SERVER_SETTINGS_MENU_ID,
        menu_label(language, "llm_settings"),
    )
    .accelerator(shortcut_accelerator(LLM_SERVER_SETTINGS_MENU_ID))
    .build(app)?;

    let ai_translation = MenuItemBuilder::with_id(
        AI_TRANSLATION_MENU_ID,
        menu_label(language, "ai_translation"),
    )
    .accelerator(shortcut_accelerator(AI_TRANSLATION_MENU_ID))
    .build(app)?;

    let clear_list =
        MenuItemBuilder::with_id(CLEAR_LIST_MENU_ID, menu_label(language, "clear_list"))
            .accelerator(shortcut_accelerator(CLEAR_LIST_MENU_ID))
            .build(app)?;

    let delete_selected = MenuItemBuilder::with_id(
        DELETE_SELECTED_MENU_ID,
        menu_label(language, "delete_selected"),
    )
    .accelerator(shortcut_accelerator(DELETE_SELECTED_MENU_ID))
    .build(app)?;

    let bulk_change_state = MenuItemBuilder::with_id(
        BULK_CHANGE_STATE_MENU_ID,
        menu_label(language, "bulk_state"),
    )
    .accelerator(shortcut_accelerator(BULK_CHANGE_STATE_MENU_ID))
    .build(app)?;

    let character_stats = MenuItemBuilder::with_id(
        CHARACTER_STATS_MENU_ID,
        menu_label(language, "character_count"),
    )
    .accelerator(shortcut_accelerator(CHARACTER_STATS_MENU_ID))
    .build(app)?;

    let language_dialog = MenuItemBuilder::with_id(
        OPEN_LANGUAGE_DIALOG_MENU_ID,
        menu_label(language, "language_dialog"),
    )
    .accelerator(shortcut_accelerator(OPEN_LANGUAGE_DIALOG_MENU_ID))
    .build(app)?;

    let tools_menu = SubmenuBuilder::new(app, menu_label(language, "tools"))
        .item(&go_to_row)
        .item(&language_dialog)
        .item(&open_encoding_manager)
        .item(&llm_server_settings)
        .item(&ai_translation)
        .item(&clear_list)
        .item(&delete_selected)
        .item(&bulk_change_state)
        .build()?;

    let statistics_menu = SubmenuBuilder::new(app, menu_label(language, "statistics"))
        .item(&character_stats)
        .build()?;

    let file_menu = SubmenuBuilder::new(app, menu_label(language, "file"))
        .item(&read_json)
        .item(&save_json)
        .item(&save_json_as)
        .item(&import_excel)
        .item(&export_excel)
        .item(&import_srt)
        .item(&export_srt)
        .build()?;

    let menu = Menu::default(app)?;
    menu.append(&file_menu)?;
    menu.append(&tools_menu)?;
    menu.append(&statistics_menu)?;
    Ok(menu)
}

#[tauri::command]
fn open_encoding_manager_window(app: AppHandle) -> Result<(), String> {
    open_encoding_manager(&app).map_err(|error| error.to_string())
}

#[cfg(target_os = "macos")]
fn set_main_menu<R: Runtime>(app: &AppHandle<R>) {
    if let Ok(menu) = build_main_menu(app) {
        let _ = app.set_menu(menu);
    }
}

#[cfg(target_os = "macos")]
fn set_encoding_menu<R: Runtime>(app: &AppHandle<R>) {
    if let Ok(menu) = build_encoding_menu(app) {
        let _ = app.set_menu(menu);
    }
}

fn emit_encoding_menu_event<R: Runtime, T: Emitter<R>>(target: &T, menu_id: &str) {
    // Menu handlers emit frontend events instead of invoking JS directly, which
    // keeps Rust platform routing separate from Vue workflow logic.
    match menu_id {
        ENCODING_READ_JSON_MENU_ID => {
            let _ = target.emit("encoding-read-json", ());
        }
        ENCODING_SAVE_JSON_MENU_ID => {
            let _ = target.emit("encoding-save-json", ());
        }
        ENCODING_SAVE_JSON_AS_MENU_ID => {
            let _ = target.emit("encoding-save-json-as", ());
        }
        ENCODING_IMPORT_MENU_ID => {
            let _ = target.emit("encoding-import", ());
        }
        ENCODING_IMPORT_EXCEL_MENU_ID => {
            let _ = target.emit("encoding-import-excel", ());
        }
        ENCODING_EXPORT_MENU_ID => {
            let _ = target.emit("encoding-export", ());
        }
        ENCODING_EXPORT_EXCEL_MENU_ID => {
            let _ = target.emit("encoding-export-excel", ());
        }
        ENCODING_GO_TO_ROW_MENU_ID => {
            let _ = target.emit("encoding-open-go-to-row", ());
        }
        ENCODING_CLEAR_LIST_MENU_ID => {
            let _ = target.emit("encoding-clear-list", ());
        }
        ENCODING_DELETE_SELECTED_MENU_ID => {
            let _ = target.emit("encoding-delete-selected", ());
        }
        ENCODING_UNMAPPED_CHARACTERS_MENU_ID => {
            let _ = target.emit("encoding-open-unmapped-characters", ());
        }
        ENCODING_UNUSED_ENCODINGS_MENU_ID => {
            let _ = target.emit("encoding-open-unused-encodings", ());
        }
        ENCODING_LINE_LENGTH_MENU_ID => {
            let _ = target.emit("encoding-open-line-length", ());
        }
        OPEN_LANGUAGE_DIALOG_MENU_ID => {
            let _ = target.emit("open-language-dialog", ());
        }
        LANGUAGE_EN_MENU_ID => {
            let _ = target.emit("set-language", serde_json::json!({ "language": "en" }));
        }
        LANGUAGE_ZH_HANS_MENU_ID => {
            let _ = target.emit("set-language", serde_json::json!({ "language": "zh-Hans" }));
        }
        _ => {}
    }
}

fn emit_main_menu_event<R: Runtime, T: Emitter<R>>(app: &AppHandle<R>, target: &T, menu_id: &str) {
    match menu_id {
        GO_TO_ROW_MENU_ID => {
            let _ = target.emit("open-go-to-row", ());
        }
        OPEN_ENCODING_MANAGER_MENU_ID => {
            let _ = open_encoding_manager(app);
        }
        LLM_SERVER_SETTINGS_MENU_ID => {
            let _ = target.emit("open-llm-settings", ());
        }
        AI_TRANSLATION_MENU_ID => {
            let _ = target.emit("open-ai-translation", ());
        }
        READ_JSON_MENU_ID => {
            let _ = target.emit("read-json", ());
        }
        SAVE_JSON_MENU_ID => {
            let _ = target.emit("save-json", ());
        }
        SAVE_JSON_AS_MENU_ID => {
            let _ = target.emit("save-json-as", ());
        }
        IMPORT_EXCEL_MENU_ID => {
            let _ = target.emit("import-excel", ());
        }
        EXPORT_EXCEL_MENU_ID => {
            let _ = target.emit("export-excel", ());
        }
        IMPORT_SRT_MENU_ID => {
            let _ = target.emit("import-srt", ());
        }
        EXPORT_SRT_MENU_ID => {
            let _ = target.emit("export-srt", ());
        }
        OPEN_LANGUAGE_DIALOG_MENU_ID => {
            let _ = target.emit("open-language-dialog", ());
        }
        LANGUAGE_EN_MENU_ID => {
            let _ = target.emit("set-language", serde_json::json!({ "language": "en" }));
        }
        LANGUAGE_ZH_HANS_MENU_ID => {
            let _ = target.emit("set-language", serde_json::json!({ "language": "zh-Hans" }));
        }
        UNDO_TABLE_CHANGE_MENU_ID => {
            let _ = target.emit("undo-table-change", ());
        }
        REDO_TABLE_CHANGE_MENU_ID => {
            let _ = target.emit("redo-table-change", ());
        }
        CLEAR_LIST_MENU_ID => {
            let _ = target.emit("clear-list", ());
        }
        DELETE_SELECTED_MENU_ID => {
            let _ = target.emit("delete-selected", ());
        }
        BULK_CHANGE_STATE_MENU_ID => {
            let _ = target.emit("bulk-change-state", ());
        }
        CHARACTER_STATS_MENU_ID => {
            let _ = target.emit("open-character-stats", ());
        }
        _ => {}
    }
}

fn open_encoding_manager<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    if let Some(window) = app.get_webview_window("encoding") {
        // The encoding manager is a singleton auxiliary window; menu access
        // should focus the existing one instead of opening duplicates.
        window.set_focus()?;
        return Ok(());
    }

    let window = WebviewWindowBuilder::new(
        app,
        "encoding",
        WebviewUrl::App("index.html#/encoding".into()),
    )
    .title("Encoding Manager")
    .inner_size(760.0, 860.0)
    .build()?;

    #[cfg(target_os = "windows")]
    {
        window.set_menu(build_encoding_menu(app)?)?;
    }

    #[cfg(target_os = "linux")]
    {
        // Linux native window menus are inconsistent across desktop shells and
        // have caused the auxiliary window to hang on open. The Encoding UI and
        // frontend shortcut fallback remain available without attaching a menu.
    }

    #[cfg(target_os = "macos")]
    {
        set_encoding_menu(app);
        let app_handle = app.clone();
        window.on_window_event(move |event| match event {
            WindowEvent::Focused(true) => {
                // macOS menu bar follows the focused window.
                set_encoding_menu(&app_handle);
            }
            WindowEvent::Destroyed => {
                // Return the global menu to main-window actions after the
                // auxiliary window closes.
                set_main_menu(&app_handle);
            }
            _ => {}
        });
    }

    window.on_menu_event(|window, event| {
        emit_encoding_menu_event(window, event.id().as_ref());
    });

    Ok(())
}

fn exit_from_main_window<R: Runtime>(app: &AppHandle<R>) {
    // Treat the main window as the document owner. Closing it exits the full app
    // so auxiliary windows cannot keep the process alive differently per OS.
    app.exit(0);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(SentenceCoverageStore::default())
        .menu(build_main_menu)
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                #[cfg(not(target_os = "macos"))]
                {
                    window.set_menu(build_main_menu(app.handle())?)?;
                }

                let menu_app_handle = app.handle().clone();
                window.on_menu_event(move |window, event| {
                    emit_main_menu_event(&menu_app_handle, window, event.id().as_ref());
                });

                let app_handle = app.handle().clone();
                window.on_window_event(move |event| match event {
                    WindowEvent::CloseRequested { api, .. } => {
                        api.prevent_close();
                        exit_from_main_window(&app_handle);
                    }
                    #[cfg(target_os = "macos")]
                    WindowEvent::Focused(true) => {
                        set_main_menu(&app_handle);
                    }
                    _ => {}
                });
            }

            Ok(())
        })
        .on_menu_event(|app, event| {
            #[cfg(not(target_os = "macos"))]
            {
                return;
            }

            #[cfg(target_os = "macos")]
            {
                if let Some(window) = app.get_webview_window("encoding") {
                    let encoding_is_focused = window.is_focused().unwrap_or(false);

                    if encoding_is_focused {
                        match event.id().as_ref() {
                            ENCODING_READ_JSON_MENU_ID
                            | ENCODING_SAVE_JSON_MENU_ID
                            | ENCODING_SAVE_JSON_AS_MENU_ID
                            | ENCODING_IMPORT_MENU_ID
                            | ENCODING_IMPORT_EXCEL_MENU_ID
                            | ENCODING_EXPORT_MENU_ID
                            | ENCODING_EXPORT_EXCEL_MENU_ID
                            | ENCODING_GO_TO_ROW_MENU_ID
                            | ENCODING_CLEAR_LIST_MENU_ID
                            | ENCODING_DELETE_SELECTED_MENU_ID
                            | ENCODING_UNMAPPED_CHARACTERS_MENU_ID
                            | ENCODING_UNUSED_ENCODINGS_MENU_ID
                            | ENCODING_LINE_LENGTH_MENU_ID
                            | OPEN_LANGUAGE_DIALOG_MENU_ID
                            | LANGUAGE_EN_MENU_ID
                            | LANGUAGE_ZH_HANS_MENU_ID => {
                                emit_encoding_menu_event(&window, event.id().as_ref());
                                return;
                            }
                            GO_TO_ROW_MENU_ID => {
                                let _ = window.emit("encoding-open-go-to-row", ());
                                return;
                            }
                            _ => {}
                        }
                    }
                }

                if let Some(window) = app.get_webview_window("main") {
                    emit_main_menu_event(app, &window, event.id().as_ref());
                }
            }
        })
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            delete_app_draft,
            delete_llm_api_key,
            get_sentence_coverage_source,
            has_llm_api_key,
            open_encoding_manager_window,
            read_app_draft,
            save_llm_api_key,
            set_app_language_menu,
            set_sentence_coverage_source,
            set_history_menu_enabled,
            test_llm_connection,
            translate_with_llm,
            write_app_draft
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_extra_request_json_object() {
        let value =
            parse_extra_request_json(r#"{ "chat_template_kwargs": { "enable_thinking": false } }"#)
                .expect("extra request object should parse");

        assert_eq!(
            value["chat_template_kwargs"]["enable_thinking"],
            serde_json::Value::Bool(false)
        );
    }

    #[test]
    fn parses_extra_request_json_field_fragment() {
        let value =
            parse_extra_request_json(r#""chat_template_kwargs": { "enable_thinking": false }"#)
                .expect("extra request field fragment should parse");

        assert_eq!(
            value["chat_template_kwargs"]["enable_thinking"],
            serde_json::Value::Bool(false)
        );
    }
}
