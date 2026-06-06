// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use tauri::{
    menu::{Menu, MenuItemBuilder, SubmenuBuilder},
    Emitter, Manager,
};

const REFRESH_FILTERS_MENU_ID: &str = "refresh_filters";

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .menu(|app| {
            let refresh_filters = MenuItemBuilder::with_id(
                REFRESH_FILTERS_MENU_ID,
                "Refresh Filters",
            )
            .accelerator(refresh_filters_accelerator())
            .build(app)?;

            let tools_menu = SubmenuBuilder::new(app, "Tools")
                .item(&refresh_filters)
                .build()?;

            let menu = Menu::default(app)?;
            menu.append(&tools_menu)?;
            Ok(menu)
        })
        .on_menu_event(|app, event| {
            if event.id().as_ref() == REFRESH_FILTERS_MENU_ID {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.emit("refresh-filters", ());
                }
            }
        })
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![greet])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
