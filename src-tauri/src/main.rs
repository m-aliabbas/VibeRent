#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::collections::HashMap;
use std::fs::OpenOptions;
use std::io::Write;
use std::net::{TcpStream, UdpSocket};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use tauri::{Manager, RunEvent};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

struct ServerProcess(Mutex<Option<CommandChild>>);

const DESKTOP_PORT: u16 = 4322;

#[tauri::command]
fn save_download(app: tauri::AppHandle, filename: String, bytes: Vec<u8>) -> Result<String, String> {
    if bytes.is_empty() {
        return Err("The downloaded file is empty.".into());
    }
    if bytes.len() > 1024 * 1024 * 1024 {
        return Err("The downloaded file is too large.".into());
    }
    let safe_name: String = Path::new(&filename)
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("viberent-download")
        .chars()
        .map(|character| if matches!(character, '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*') { '_' } else { character })
        .collect();
    let safe_name = safe_name.trim().trim_matches('.');
    let safe_name = if safe_name.is_empty() { "viberent-download" } else { safe_name };
    let directory = app.path().download_dir().map_err(|error| error.to_string())?;
    std::fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    let requested = Path::new(safe_name);
    let stem = requested.file_stem().and_then(|value| value.to_str()).unwrap_or("viberent-download");
    let extension = requested.extension().and_then(|value| value.to_str());
    for index in 0..10_000 {
        let candidate_name = if index == 0 {
            safe_name.to_string()
        } else if let Some(extension) = extension {
            format!("{stem} ({index}).{extension}")
        } else {
            format!("{stem} ({index})")
        };
        let candidate = directory.join(candidate_name);
        match OpenOptions::new().create_new(true).write(true).open(&candidate) {
            Ok(mut file) => {
                file.write_all(&bytes).map_err(|error| error.to_string())?;
                return Ok(candidate.to_string_lossy().to_string());
            }
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(error.to_string()),
        }
    }
    Err("Could not choose an available filename in Downloads.".into())
}

fn append_log(path: &Path, message: &str) {
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let _ = OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .and_then(|mut file| writeln!(file, "{message}"));
}

fn local_lan_ip() -> Option<std::net::IpAddr> {
    let socket = UdpSocket::bind("0.0.0.0:0").ok()?;
    socket.connect("8.8.8.8:80").ok()?;
    Some(socket.local_addr().ok()?.ip())
}

fn standalone_directory(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let resources = app.path().resource_dir().map_err(|error| error.to_string())?;
    let candidates = [
        resources.join("_up_").join(".next").join("standalone"),
        resources.join(".next").join("standalone"),
    ];
    for candidate in candidates {
        if candidate.join("server.js").is_file() {
            return Ok(candidate);
        }
    }
    Err(format!("The packaged Next.js server was not found under {}", resources.display()))
}

fn packaged_environment(app: &tauri::AppHandle) -> HashMap<String, String> {
    let Ok(resources) = app.path().resource_dir() else {
        return HashMap::new();
    };
    let candidates = [resources.join("bin").join(".env"), resources.join(".env")];
    for candidate in candidates {
        if !candidate.is_file() {
            continue;
        }
        if let Ok(iter) = dotenvy::from_path_iter(candidate) {
            return iter.filter_map(Result::ok).collect();
        }
    }
    HashMap::new()
}

async fn wait_for_server(port: u16, timeout: Duration) -> bool {
    let started = Instant::now();
    while started.elapsed() < timeout {
        if TcpStream::connect(("127.0.0.1", port)).is_ok() {
            return true;
        }
        tokio::time::sleep(Duration::from_millis(250)).await;
    }
    false
}

fn main() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![save_download])
        .manage(ServerProcess(Mutex::new(None)))
        .setup(|app| {
            let handle = app.handle().clone();
            let window = app.get_webview_window("main").ok_or("Main window not found")?;

            #[cfg(not(debug_assertions))]
            {
                let app_data = app.path().app_local_data_dir()?;
                let data = app_data.join("data");
                let backups = app_data.join("backups");
                let private_files = data.join("private-files");
                std::fs::create_dir_all(&data)?;
                std::fs::create_dir_all(&backups)?;
                std::fs::create_dir_all(&private_files)?;
                let log_path = app_data.join("startup.log");
                append_log(&log_path, "=== VibeRent desktop start ===");

                let port = DESKTOP_PORT;
                if TcpStream::connect(("127.0.0.1", port)).is_ok() {
                    append_log(&log_path, &format!("Startup blocked because port {port} is already in use."));
                    let _ = window.eval(&format!("document.body.innerHTML='<main style=\"font-family:system-ui;padding:48px\"><h2>VibeRent could not start</h2><p>Local port {port} is already in use. Close the other application and start VibeRent again.</p></main>'"));
                    return Ok(());
                }

                let standalone = standalone_directory(&handle).map_err(std::io::Error::other)?;
                let mut command = handle
                    .shell()
                    .sidecar("next-server")?
                    .current_dir(&standalone)
                    .arg("server.js");
                let environment = packaged_environment(&handle);
                let lan_enabled = environment
                    .get("VIBERENT_LAN_ENABLED")
                    .map(|value| value.eq_ignore_ascii_case("true"))
                    .unwrap_or(false);
                for (key, value) in environment {
                    command = command.env(key, value);
                }
                let mut trusted_origins = vec![
                    format!("http://127.0.0.1:{port}"),
                    format!("http://localhost:{port}"),
                ];
                if lan_enabled {
                    if let Some(ip) = local_lan_ip() {
                        trusted_origins.push(format!("http://{ip}:{port}"));
                    }
                }
                command = command
                    .env("PORT", port.to_string())
                    .env("HOSTNAME", if lan_enabled { "0.0.0.0" } else { "127.0.0.1" })
                    .env("NODE_ENV", "production")
                    .env("NEXT_TELEMETRY_DISABLED", "1")
                    .env("VIBERENT_DESKTOP", "1")
                    .env("VIBERENT_VERSION", env!("CARGO_PKG_VERSION"))
                    .env("VIBERENT_DATA_DIR", data.to_string_lossy().to_string())
                    .env("DATABASE_URL", data.join("viberent.db").to_string_lossy().to_string())
                    .env("PRIVATE_FILE_STORAGE_ROOT", private_files.to_string_lossy().to_string())
                    .env("BACKUP_ROOT", backups.to_string_lossy().to_string())
                    .env("LICENSE_CACHE_PATH", data.join("license-cache.enc").to_string_lossy().to_string())
                    .env("GOOGLE_DRIVE_SESSION_PATH", data.join("google-drive-session.enc").to_string_lossy().to_string())
                    .env("VIBERENT_MIGRATIONS_DIR", standalone.join("drizzle").to_string_lossy().to_string())
                    .env("BETTER_AUTH_URL", format!("http://127.0.0.1:{port}"))
                    .env("GOOGLE_DRIVE_REDIRECT_URI", format!("http://127.0.0.1:{port}/api/v1/backups/google-drive/callback"))
                    .env("BETTER_AUTH_TRUSTED_ORIGINS", trusted_origins.join(","));

                let (mut receiver, child) = command.spawn()?;
                *app.state::<ServerProcess>().0.lock().expect("server process lock") = Some(child);
                let log_for_output = log_path.clone();
                tauri::async_runtime::spawn(async move {
                    while let Some(event) = receiver.recv().await {
                        match event {
                            CommandEvent::Stdout(bytes) => append_log(&log_for_output, &format!("SERVER: {}", String::from_utf8_lossy(&bytes))),
                            CommandEvent::Stderr(bytes) => append_log(&log_for_output, &format!("SERVER_ERROR: {}", String::from_utf8_lossy(&bytes))),
                            CommandEvent::Error(error) => append_log(&log_for_output, &format!("SERVER_EVENT_ERROR: {error}")),
                            CommandEvent::Terminated(payload) => append_log(&log_for_output, &format!("SERVER_EXIT: {:?}", payload.code)),
                            _ => {}
                        }
                    }
                });

                tauri::async_runtime::spawn(async move {
                    if wait_for_server(port, Duration::from_secs(60)).await {
                        let _ = window.eval(&format!("window.location.replace('http://127.0.0.1:{port}')"));
                    } else {
                        let _ = window.eval("document.body.innerHTML='<main style=\"font-family:system-ui;padding:48px\"><h2>VibeRent could not start</h2><p>Open the startup log in the VibeRent application-data folder.</p></main>'");
                    }
                });
            }

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building VibeRent");

    app.run(|handle, event| {
        if matches!(event, RunEvent::Exit | RunEvent::ExitRequested { .. }) {
            if let Some(child) = handle.state::<ServerProcess>().0.lock().expect("server process lock").take() {
                let _ = child.kill();
            }
        }
    });
}
