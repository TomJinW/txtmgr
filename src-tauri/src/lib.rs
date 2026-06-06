// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use tauri::{
    menu::{Menu, MenuItemBuilder, MenuItemKind, SubmenuBuilder},
    utils::config::WebviewUrl,
    AppHandle, Emitter, Manager, Runtime,
    WebviewWindowBuilder, WindowEvent,
};

const REFRESH_FILTERS_MENU_ID: &str = "refresh_filters";
const GO_TO_ROW_MENU_ID: &str = "go_to_row";
const OPEN_ENCODING_MANAGER_MENU_ID: &str = "open_encoding_manager";
const READ_JSON_MENU_ID: &str = "read_json";
const SAVE_JSON_MENU_ID: &str = "save_json";
const IMPORT_EXCEL_MENU_ID: &str = "import_excel";
const EXPORT_EXCEL_MENU_ID: &str = "export_excel";
const UNDO_TABLE_CHANGE_MENU_ID: &str = "undo_table_change";
const REDO_TABLE_CHANGE_MENU_ID: &str = "redo_table_change";
const CLEAR_LIST_MENU_ID: &str = "clear_list";
const DELETE_SELECTED_MENU_ID: &str = "delete_selected";
const ENCODING_IMPORT_MENU_ID: &str = "encoding_import";
const ENCODING_EXPORT_MENU_ID: &str = "encoding_export";
const ENCODING_GO_TO_ROW_MENU_ID: &str = "encoding_go_to_row";
const ENCODING_CLEAR_LIST_MENU_ID: &str = "encoding_clear_list";
const ENCODING_DELETE_SELECTED_MENU_ID: &str = "encoding_delete_selected";

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

fn refresh_filters_accelerator() -> &'static str {
    #[cfg(target_os = "macos")]
    {
        "Cmd+R"
    }

    #[cfg(not(target_os = "macos"))]
    {
        "F5"
    }
}

fn go_to_row_accelerator() -> &'static str {
    #[cfg(target_os = "macos")]
    {
        "Cmd+G"
    }

    #[cfg(not(target_os = "macos"))]
    {
        "Ctrl+G"
    }
}

fn read_json_accelerator() -> &'static str {
    #[cfg(target_os = "macos")]
    {
        "Cmd+O"
    }

    #[cfg(not(target_os = "macos"))]
    {
        "Ctrl+O"
    }
}

fn save_json_accelerator() -> &'static str {
    #[cfg(target_os = "macos")]
    {
        "Cmd+S"
    }

    #[cfg(not(target_os = "macos"))]
    {
        "Ctrl+S"
    }
}

fn read_excel_accelerator() -> &'static str {
    #[cfg(target_os = "macos")]
    {
        "Cmd+Shift+O"
    }

    #[cfg(not(target_os = "macos"))]
    {
        "Ctrl+Shift+O"
    }
}

fn save_excel_accelerator() -> &'static str {
    #[cfg(target_os = "macos")]
    {
        "Cmd+Shift+S"
    }

    #[cfg(not(target_os = "macos"))]
    {
        "Ctrl+Shift+S"
    }
}


fn clear_list_accelerator() -> &'static str {
    #[cfg(target_os = "macos")]
    {
        "Cmd+Shift+Backspace"
    }

    #[cfg(not(target_os = "macos"))]
    {
        "Ctrl+Shift+Delete"
    }
}

fn delete_selected_accelerator() -> &'static str {
    #[cfg(target_os = "macos")]
    {
        "Cmd+Backspace"
    }

    #[cfg(not(target_os = "macos"))]
    {
        "Ctrl+Delete"
    }
}

fn encoding_manager_accelerator() -> &'static str {
    #[cfg(target_os = "macos")]
    {
        "Cmd+Shift+E"
    }

    #[cfg(not(target_os = "macos"))]
    {
        "Ctrl+Shift+E"
    }
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
fn set_history_menu_enabled(
    app: AppHandle,
    can_undo: bool,
    can_redo: bool,
) -> Result<(), String> {
    set_menu_item_enabled(&app, UNDO_TABLE_CHANGE_MENU_ID, can_undo)
        .map_err(|error| error.to_string())?;
    set_menu_item_enabled(&app, REDO_TABLE_CHANGE_MENU_ID, can_redo)
        .map_err(|error| error.to_string())?;
    Ok(())
}

fn build_encoding_menu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    let import_encoding =
        MenuItemBuilder::with_id(ENCODING_IMPORT_MENU_ID, "Import...")
            .build(app)?;

    let export_encoding =
        MenuItemBuilder::with_id(ENCODING_EXPORT_MENU_ID, "Export...")
            .build(app)?;

    let go_to_row =
        MenuItemBuilder::with_id(ENCODING_GO_TO_ROW_MENU_ID, "Go to Row...")
            .accelerator(go_to_row_accelerator())
            .build(app)?;

    let clear_list =
        MenuItemBuilder::with_id(ENCODING_CLEAR_LIST_MENU_ID, "Clear List")
            .build(app)?;

    let delete_selected =
        MenuItemBuilder::with_id(ENCODING_DELETE_SELECTED_MENU_ID, "Delete Selected")
            .build(app)?;

    let file_menu = SubmenuBuilder::new(app, "File")
        .item(&import_encoding)
        .item(&export_encoding)
        .build()?;

    let tools_menu = SubmenuBuilder::new(app, "Tools")
        .item(&go_to_row)
        .item(&clear_list)
        .item(&delete_selected)
        .build()?;

    let menu = Menu::default(app)?;
    menu.append(&file_menu)?;
    menu.append(&tools_menu)?;
    Ok(menu)
}

fn build_main_menu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    let undo_table_change =
        MenuItemBuilder::with_id(UNDO_TABLE_CHANGE_MENU_ID, "Undo Table Change")
            .enabled(false)
            .build(app)?;

    let redo_table_change =
        MenuItemBuilder::with_id(REDO_TABLE_CHANGE_MENU_ID, "Redo Table Change")
            .enabled(false)
            .build(app)?;

    let read_json =
        MenuItemBuilder::with_id(READ_JSON_MENU_ID, "Read JSON...")
            .accelerator(read_json_accelerator())
            .build(app)?;

    let save_json =
        MenuItemBuilder::with_id(SAVE_JSON_MENU_ID, "Save JSON")
            .accelerator(save_json_accelerator())
            .build(app)?;

    let import_excel =
        MenuItemBuilder::with_id(IMPORT_EXCEL_MENU_ID, "Import Excel...")
            .accelerator(read_excel_accelerator())
            .build(app)?;

    let export_excel =
        MenuItemBuilder::with_id(EXPORT_EXCEL_MENU_ID, "Export Excel...")
            .accelerator(save_excel_accelerator())
            .build(app)?;

    let go_to_row =
        MenuItemBuilder::with_id(GO_TO_ROW_MENU_ID, "Go to Row...")
            .accelerator(go_to_row_accelerator())
            .build(app)?;

    let open_encoding_manager =
        MenuItemBuilder::with_id(OPEN_ENCODING_MANAGER_MENU_ID, "Encoding Manager...")
            .accelerator(encoding_manager_accelerator())
            .build(app)?;

    let refresh_filters =
        MenuItemBuilder::with_id(REFRESH_FILTERS_MENU_ID, "Refresh Filters")
            .accelerator(refresh_filters_accelerator())
            .build(app)?;

    let clear_list =
        MenuItemBuilder::with_id(CLEAR_LIST_MENU_ID, "Clear List")
            .accelerator(clear_list_accelerator())
            .build(app)?;

    let delete_selected =
        MenuItemBuilder::with_id(DELETE_SELECTED_MENU_ID, "Delete Selected")
            .accelerator(delete_selected_accelerator())
            .build(app)?;

    let tools_menu = SubmenuBuilder::new(app, "Tools")
        .item(&undo_table_change)
        .item(&redo_table_change)
        .item(&go_to_row)
        .item(&open_encoding_manager)
        .item(&refresh_filters)
        .item(&clear_list)
        .item(&delete_selected)
        .build()?;

    let file_menu = SubmenuBuilder::new(app, "File")
        .item(&read_json)
        .item(&save_json)
        .item(&import_excel)
        .item(&export_excel)
        .build()?;

    let menu = Menu::default(app)?;
    menu.append(&file_menu)?;
    menu.append(&tools_menu)?;
    Ok(menu)
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
    match menu_id {
        ENCODING_IMPORT_MENU_ID => {
            let _ = target.emit("encoding-import", ());
        }
        ENCODING_EXPORT_MENU_ID => {
            let _ = target.emit("encoding-export", ());
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
        _ => {}
    }
}

fn open_encoding_manager<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    if let Some(window) = app.get_webview_window("encoding") {
        window.set_focus()?;
        return Ok(());
    }

    let window = WebviewWindowBuilder::new(
        app,
        "encoding",
        WebviewUrl::App("index.html#/encoding".into()),
    )
    .title("Encoding Manager")
    .inner_size(780.0, 700.0)
    .build()?;

    #[cfg(not(target_os = "macos"))]
    {
        window.set_menu(build_encoding_menu(app)?)?;
    }

    #[cfg(target_os = "macos")]
    {
        set_encoding_menu(app);
        let app_handle = app.clone();
        window.on_window_event(move |event| match event {
            WindowEvent::Focused(true) => {
                set_encoding_menu(&app_handle);
            }
            WindowEvent::Destroyed => {
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .menu(build_main_menu)
        .setup(|app| {
            #[cfg(target_os = "macos")]
            if let Some(window) = app.get_webview_window("main") {
                let app_handle = app.handle().clone();
                window.on_window_event(move |event| {
                    if matches!(event, WindowEvent::Focused(true)) {
                        set_main_menu(&app_handle);
                    }
                });
            }

            Ok(())
        })
        .on_menu_event(|app, event| {
            if let Some(window) = app.get_webview_window("encoding") {
                let encoding_is_focused = window.is_focused().unwrap_or(false);

                if encoding_is_focused {
                    match event.id().as_ref() {
                        ENCODING_IMPORT_MENU_ID
                        | ENCODING_EXPORT_MENU_ID
                        | ENCODING_GO_TO_ROW_MENU_ID
                        | ENCODING_CLEAR_LIST_MENU_ID
                        | ENCODING_DELETE_SELECTED_MENU_ID => {
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
                match event.id().as_ref() {
                    REFRESH_FILTERS_MENU_ID => {
                        let _ = window.emit("refresh-filters", ());
                    }
                    GO_TO_ROW_MENU_ID => {
                        let _ = window.emit("open-go-to-row", ());
                    }
                    OPEN_ENCODING_MANAGER_MENU_ID => {
                        let _ = open_encoding_manager(app);
                    }
                    READ_JSON_MENU_ID => {
                        let _ = window.emit("read-json", ());
                    }
                    SAVE_JSON_MENU_ID => {
                        let _ = window.emit("save-json", ());
                    }
                    IMPORT_EXCEL_MENU_ID => {
                        let _ = window.emit("import-excel", ());
                    }
                    EXPORT_EXCEL_MENU_ID => {
                        let _ = window.emit("export-excel", ());
                    }
                    UNDO_TABLE_CHANGE_MENU_ID => {
                        let _ = window.emit("undo-table-change", ());
                    }
                    REDO_TABLE_CHANGE_MENU_ID => {
                        let _ = window.emit("redo-table-change", ());
                    }
                    CLEAR_LIST_MENU_ID => {
                        let _ = window.emit("clear-list", ());
                    }
                    DELETE_SELECTED_MENU_ID => {
                        let _ = window.emit("delete-selected", ());
                    }
                    _ => {}
                }
            }
        })
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![greet, set_history_menu_enabled])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
