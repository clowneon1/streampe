use std::sync::{Arc, Mutex};
use std::time::Duration;

use tauri::{
    menu::{MenuBuilder, MenuItemBuilder, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, Runtime, WebviewWindowBuilder,
};
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_plugin_autostart::MacosLauncher;
use tauri_plugin_notification::NotificationExt;
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;

// ── State ─────────────────────────────────────────────────────────────
struct AppState {
    server_port: Option<u16>,
    is_quitting: bool,
    child_process: Option<tauri_plugin_shell::process::CommandChild>,
}

impl AppState {
    fn new() -> Self {
        Self {
            server_port: None,
            is_quitting: false,
            child_process: None,
        }
    }
}

type SharedState = Arc<Mutex<AppState>>;

// ── Port resolver ─────────────────────────────────────────────────────
/// Poll /api/network-info until the embedded server is ready, then return
/// the actual port it's listening on (handles random fallback ports too).
async fn resolve_server_port(preferred: u16) -> u16 {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(1))
        .build()
        .unwrap_or_default();

    for _ in 0..20 {
        let url = format!("http://127.0.0.1:{preferred}/api/network-info");
        if let Ok(resp) = client.get(&url).send().await {
            if let Ok(json) = resp.json::<serde_json::Value>().await {
                if let Some(port) = json.get("port").and_then(|p| p.as_u64()) {
                    return port as u16;
                }
            }
            return preferred;
        }
        tokio::time::sleep(Duration::from_millis(500)).await;
    }
    preferred
}

async fn check_start_minimized(port: u16) -> bool {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_millis(600))
        .build()
        .unwrap_or_default();
    let url = format!("http://127.0.0.1:{port}/api/system/start-minimized");
    if let Ok(resp) = client.get(&url).send().await {
        if let Ok(json) = resp.json::<serde_json::Value>().await {
            return json.get("enabled").and_then(|v| v.as_bool()).unwrap_or(false);
        }
    }
    false
}

// ── Tray builder ──────────────────────────────────────────────────────
fn build_tray<R: Runtime>(app: &AppHandle<R>, port: u16) -> tauri::Result<()> {
    let primary_ip = get_primary_ip();
    let connect_url = format!("http://{}:{}", primary_ip, port);

    let open_window = MenuItemBuilder::with_id("open", "⚡ Open Main Window")
        .build(app)?;
    let open_browser = MenuItemBuilder::with_id("browser", "🌐 Open Control Panel in Browser")
        .build(app)?;
    let copy_ip = MenuItemBuilder::with_id(
        "copy_ip",
        format!("📋 Copy Connection IP ({}:{})", primary_ip, port),
    )
    .build(app)?;
    let sep = PredefinedMenuItem::separator(app)?;
    let quit = MenuItemBuilder::with_id("quit", "❌ Quit StreamPe").build(app)?;

    let menu = MenuBuilder::new(app)
        .items(&[&open_window, &open_browser, &copy_ip, &sep, &quit])
        .build()?;

    let tray_icon = app.default_window_icon().cloned()
        .unwrap_or_else(|| {
            tauri::image::Image::from_bytes(include_bytes!("../icons/32x32.png")).expect("icon missing")
        });

    let tray = TrayIconBuilder::with_id("main-tray")
        .icon(tray_icon)
        .tooltip("StreamPe")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_tray_icon_event({
            let app = app.clone();
            move |_tray, event| {
                if let TrayIconEvent::Click {
                    button: MouseButton::Left,
                    button_state: MouseButtonState::Up,
                    ..
                } = event
                {
                    show_main_window(&app);
                }
            }
        })
        .on_menu_event({
            let _app = app.clone();
            let connect_url = connect_url.clone();
            move |app, event| match event.id().as_ref() {
                "open" => show_main_window(app),
                "browser" => {
                    let _ = tauri_plugin_opener::open_url(
                        format!("http://127.0.0.1:{}/config", port),
                        None::<&str>,
                    );
                }
                "copy_ip" => {
                    let _ = app.clipboard().write_text(connect_url.clone());
                    // Show a toast in the window if it's open
                    if let Some(win) = app.get_webview_window("main") {
                        let msg = format!("📋 Copied Mobile IP: {}", connect_url);
                        let _ = win.eval(&format!(
                            "if(window.showToast) window.showToast('{msg}')"
                        ));
                    }
                }
                "quit" => {
                    if let Some(state) = app.try_state::<SharedState>() {
                        let mut s = state.lock().unwrap();
                        s.is_quitting = true;
                        if let Some(child) = s.child_process.take() {
                            let _ = child.kill();
                        }
                    }
                    app.exit(0);
                }
                _ => {}
            }
        })
        .build(app)?;

    // Store tray so it isn't dropped
    app.manage(tray);
    Ok(())
}

// ── Window helpers ────────────────────────────────────────────────────
fn show_main_window<R: Runtime>(app: &AppHandle<R>) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.show();
        let _ = win.unminimize();
        let _ = win.set_focus();
    }
}

fn get_primary_ip() -> String {
    // Connect a UDP socket (no data sent) to determine the preferred outbound interface
    if let Ok(socket) = std::net::UdpSocket::bind("0.0.0.0:0") {
        if socket.connect("8.8.8.8:80").is_ok() {
            if let Ok(addr) = socket.local_addr() {
                let s = addr.ip().to_string();
                if !s.starts_with("127.") && !s.starts_with("169.254") {
                    return s;
                }
            }
        }
    }
    "127.0.0.1".to_string()
}

// ── Tauri commands ────────────────────────────────────────────────────
#[tauri::command]
fn get_server_port(state: tauri::State<SharedState>) -> Option<u16> {
    state.lock().unwrap().server_port
}

// ── Entry point ───────────────────────────────────────────────────────
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let state: SharedState = Arc::new(Mutex::new(AppState::new()));

    tauri::Builder::default()
        // ── Plugins ───────────────────────────────────────────────────
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec![]),
        ))
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            // Second instance launched — focus the existing window
            show_main_window(app);
        }))
        // ── State ─────────────────────────────────────────────────────
        .manage(state.clone())
        // ── Commands ──────────────────────────────────────────────────
        .invoke_handler(tauri::generate_handler![
            get_server_port,
        ])
        // ── Setup ─────────────────────────────────────────────────────
        .setup(move |app| {
            let app_handle = app.handle().clone();
            let state_clone = state.clone();

            // Spawn Node sidecar + wait for it to be ready, then open window
            tauri::async_runtime::spawn(async move {
                // Launch the bun-compiled server sidecar (server.js baked in — no args needed)
                let sidecar_cmd = app_handle
                    .shell()
                    .sidecar("server")
                    .expect("server sidecar not found");

                let (mut rx, child) = sidecar_cmd
                    .spawn()
                    .expect("Failed to spawn node sidecar");

                // Store child process handle so it terminates when the app exits
                state_clone.lock().unwrap().child_process = Some(child);

                // Forward sidecar stdout/stderr to Tauri logs
                let ah2 = app_handle.clone();
                tauri::async_runtime::spawn(async move {
                    while let Some(event) = rx.recv().await {
                        match event {
                            CommandEvent::Stdout(line) => {
                                println!("[Node] {}", String::from_utf8_lossy(&line));
                            }
                            CommandEvent::Stderr(line) => {
                                eprintln!("[Node] {}", String::from_utf8_lossy(&line));
                            }
                            CommandEvent::Error(e) => {
                                eprintln!("[Node] Error: {e}");
                            }
                            CommandEvent::Terminated(status) => {
                                eprintln!("[Node] Sidecar terminated: {:?}", status);
                                // Quit the app if the server dies
                                ah2.exit(1);
                            }
                            _ => {}
                        }
                    }
                });

                // Poll until the embedded Express server is ready
                const PREFERRED_PORT: u16 = 2907;
                let port = resolve_server_port(PREFERRED_PORT).await;

                // Store resolved port in shared state
                state_clone.lock().unwrap().server_port = Some(port);

                // Build system tray
                build_tray(&app_handle, port).expect("Failed to build tray");

                let should_start_minimized = check_start_minimized(port).await;

                // Create or navigate the main window
                let _win = if let Some(existing_win) = app_handle.get_webview_window("main") {
                    let _ = existing_win.navigate(
                        format!("http://127.0.0.1:{port}/app")
                            .parse()
                            .unwrap(),
                    );
                    if !should_start_minimized {
                        let _ = existing_win.show();
                        let _ = existing_win.set_focus();
                    }
                    existing_win
                } else {
                    let w = WebviewWindowBuilder::new(
                        &app_handle,
                        "main",
                        tauri::WebviewUrl::External(
                            format!("http://127.0.0.1:{port}/app")
                                .parse()
                                .unwrap(),
                        ),
                    )
                    .title("StreamPe")
                    .inner_size(480.0, 640.0)
                    .min_inner_size(440.0, 580.0)
                    .resizable(true)
                    .center()
                    .build()
                    .expect("Failed to create main window");
                    if !should_start_minimized {
                        let _ = w.show();
                        let _ = w.set_focus();
                    }
                    w
                };


            });

            Ok(())
        })
        .on_window_event(|win, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let quitting = if let Some(state) = win.app_handle().try_state::<SharedState>() {
                    state.lock().unwrap().is_quitting
                } else {
                    false
                };

                if !quitting {
                    api.prevent_close();
                    let _ = win.hide();
                    let _ = win.app_handle().notification()
                        .builder()
                        .title("StreamPe")
                        .body("App is running in the background. Access it from the system tray.")
                        .show();
                    return;
                }

                // If quitting from tray menu, kill sidecar and exit app completely
                if let Some(state) = win.app_handle().try_state::<SharedState>() {
                    let mut s = state.lock().unwrap();
                    if let Some(child) = s.child_process.take() {
                        let _ = child.kill();
                    }
                }
                win.app_handle().exit(0);
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
