#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::collections::HashMap;
use std::fs::OpenOptions;
use std::io::Write;
use std::net::{TcpStream, UdpSocket};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use mdns_sd::{ServiceDaemon, ServiceInfo};
use sha2::{Digest, Sha256};
use tauri::{Manager, RunEvent};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

struct ServerProcess(Mutex<Option<CommandChild>>);
struct MdnsResponder(Mutex<Option<ServiceDaemon>>);

const DESKTOP_PORT: u16 = 80;
const DESKTOP_HOSTNAME: &str = "rent.local";

#[tauri::command]
fn save_download(
    app: tauri::AppHandle,
    filename: String,
    bytes: Vec<u8>,
) -> Result<String, String> {
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
        .map(|character| {
            if matches!(
                character,
                '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*'
            ) {
                '_'
            } else {
                character
            }
        })
        .collect();
    let safe_name = safe_name.trim().trim_matches('.');
    let safe_name = if safe_name.is_empty() {
        "viberent-download"
    } else {
        safe_name
    };
    let directory = app
        .path()
        .download_dir()
        .map_err(|error| error.to_string())?;
    std::fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    let requested = Path::new(safe_name);
    let stem = requested
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("viberent-download");
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
        match OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(&candidate)
        {
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

#[tauri::command]
async fn download_update(
    app: tauri::AppHandle,
    url: String,
    filename: String,
    sha256: String,
) -> Result<String, String> {
    const MAX_UPDATE_BYTES: u64 = 1024 * 1024 * 1024;
    let parsed = reqwest::Url::parse(&url).map_err(|_| "The update URL is invalid.".to_string())?;
    let allowed_path = "/m-aliabbas/viberent-releases/releases/download/";
    if parsed.scheme() != "https"
        || parsed.host_str() != Some("github.com")
        || !parsed.path().starts_with(allowed_path)
    {
        return Err("The update URL is not an official VibeRent release.".into());
    }
    if filename.is_empty()
        || !filename.ends_with("_x64-setup.exe")
        || filename.chars().any(|character| {
            !character.is_ascii_alphanumeric() && !matches!(character, '.' | '_' | '-')
        })
        || parsed.path_segments().and_then(|segments| segments.last()) != Some(filename.as_str())
    {
        return Err("The update filename is invalid.".into());
    }
    if sha256.len() != 64
        || !sha256
            .chars()
            .all(|character| character.is_ascii_hexdigit())
    {
        return Err("The update checksum is invalid.".into());
    }

    let directory = app
        .path()
        .download_dir()
        .map_err(|error| error.to_string())?;
    std::fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    let requested = Path::new(&filename);
    let stem = requested
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("VibeRent-update");
    let extension = requested
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("exe");
    let mut destination = None;
    let mut temporary = None;
    for index in 0..10_000 {
        let candidate_name = if index == 0 {
            filename.clone()
        } else {
            format!("{stem} ({index}).{extension}")
        };
        let candidate = directory.join(candidate_name);
        let partial = directory.join(format!(
            "{}.part",
            candidate
                .file_name()
                .and_then(|value| value.to_str())
                .unwrap_or("VibeRent-update.exe")
        ));
        if !candidate.exists() && !partial.exists() {
            destination = Some(candidate);
            temporary = Some(partial);
            break;
        }
    }
    let destination = destination.ok_or("Could not choose an available filename in Downloads.")?;
    let temporary = temporary.ok_or("Could not choose an available temporary filename.")?;

    let result: Result<(), String> = async {
        let client = reqwest::Client::builder()
            .user_agent(format!("VibeRent/{}", env!("CARGO_PKG_VERSION")))
            .timeout(Duration::from_secs(30 * 60))
            .build()
            .map_err(|error| error.to_string())?;
        let mut response = client
            .get(parsed)
            .send()
            .await
            .map_err(|error| format!("The update download failed: {error}"))?
            .error_for_status()
            .map_err(|error| format!("GitHub rejected the update download: {error}"))?;
        if response
            .content_length()
            .is_some_and(|size| size == 0 || size > MAX_UPDATE_BYTES)
        {
            return Err("The update file size is invalid.".into());
        }
        let mut file = OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(&temporary)
            .map_err(|error| error.to_string())?;
        let mut hasher = Sha256::new();
        let mut downloaded = 0_u64;
        while let Some(chunk) = response
            .chunk()
            .await
            .map_err(|error| format!("The update download was interrupted: {error}"))?
        {
            downloaded = downloaded.saturating_add(chunk.len() as u64);
            if downloaded > MAX_UPDATE_BYTES {
                return Err("The update file is too large.".into());
            }
            hasher.update(&chunk);
            file.write_all(&chunk).map_err(|error| error.to_string())?;
        }
        file.flush().map_err(|error| error.to_string())?;
        if downloaded == 0 || format!("{:x}", hasher.finalize()) != sha256.to_ascii_lowercase() {
            return Err(
                "The downloaded installer did not match the published SHA-256 checksum.".into(),
            );
        }
        Ok(())
    }
    .await;

    if let Err(error) = result {
        let _ = std::fs::remove_file(&temporary);
        return Err(error);
    }
    std::fs::rename(&temporary, &destination).map_err(|error| {
        let _ = std::fs::remove_file(&temporary);
        error.to_string()
    })?;
    Ok(destination.to_string_lossy().to_string())
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

fn http_origin(host: &str, port: u16) -> String {
    if port == 80 {
        format!("http://{host}")
    } else {
        format!("http://{host}:{port}")
    }
}

fn start_mdns(port: u16) -> Result<ServiceDaemon, String> {
    let responder = ServiceDaemon::new().map_err(|error| error.to_string())?;
    let service = ServiceInfo::new(
        "_http._tcp.local.",
        "VibeRent",
        "rent.local.",
        (),
        port,
        &[("application", "viberent"), ("path", "/")][..],
    )
    .map_err(|error| error.to_string())?
    .enable_addr_auto();
    responder
        .register(service)
        .map_err(|error| error.to_string())?;
    Ok(responder)
}

fn standalone_directory(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let resources = app
        .path()
        .resource_dir()
        .map_err(|error| error.to_string())?;
    let candidates = [
        resources.join("_up_").join(".next").join("standalone"),
        resources.join(".next").join("standalone"),
    ];
    for candidate in candidates {
        if candidate.join("server.js").is_file() {
            return Ok(candidate);
        }
    }
    Err(format!(
        "The packaged Next.js server was not found under {}",
        resources.display()
    ))
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
        .invoke_handler(tauri::generate_handler![save_download, download_update])
        .manage(ServerProcess(Mutex::new(None)))
        .manage(MdnsResponder(Mutex::new(None)))
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
                    append_log(&log_path, "Startup blocked because port 80 is already in use.");
                    let _ = window.eval("document.body.innerHTML='<main style=\"font-family:system-ui;padding:48px\"><h2>VibeRent could not start</h2><p>Port 80 is already in use. Close the other application, IIS, or HTTP.sys reservation and start VibeRent again.</p></main>'");
                    return Ok(());
                }

                let standalone = standalone_directory(&handle).map_err(std::io::Error::other)?;
                let mut command = handle
                    .shell()
                    .sidecar("next-server")?
                    .current_dir(&standalone)
                    .arg("server.js");
                let environment = packaged_environment(&handle);
                for (key, value) in environment {
                    command = command.env(key, value);
                }
                let mut trusted_origins = vec![
                    http_origin(DESKTOP_HOSTNAME, port),
                    http_origin("127.0.0.1", port),
                    http_origin("localhost", port),
                ];
                if let Some(ip) = local_lan_ip() {
                    trusted_origins.push(http_origin(&ip.to_string(), port));
                }
                let application_origin = http_origin(DESKTOP_HOSTNAME, port);
                let loopback_origin = http_origin("127.0.0.1", port);
                command = command
                    .env("PORT", port.to_string())
                    .env("HOSTNAME", "0.0.0.0")
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
                    .env("BETTER_AUTH_URL", &application_origin)
                    .env("GOOGLE_DRIVE_REDIRECT_URI", &loopback_origin)
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

                let handle_for_ready = handle.clone();
                let log_for_ready = log_path.clone();
                tauri::async_runtime::spawn(async move {
                    if wait_for_server(port, Duration::from_secs(60)).await {
                        let navigation_origin = match start_mdns(port) {
                            Ok(responder) => {
                                append_log(&log_for_ready, "VibeRent advertised at http://rent.local via mDNS.");
                                *handle_for_ready
                                    .state::<MdnsResponder>()
                                    .0
                                    .lock()
                                    .expect("mDNS responder lock") = Some(responder);
                                application_origin
                            }
                            Err(error) => {
                                append_log(
                                    &log_for_ready,
                                    &format!("MDNS_ERROR: Could not advertise rent.local: {error}"),
                                );
                                loopback_origin
                            }
                        };
                        let _ = window.eval(&format!(
                            "window.location.replace('{navigation_origin}')"
                        ));
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
            if let Some(responder) = handle
                .state::<MdnsResponder>()
                .0
                .lock()
                .expect("mDNS responder lock")
                .take()
            {
                let _ = responder.shutdown();
            }
            if let Some(child) = handle
                .state::<ServerProcess>()
                .0
                .lock()
                .expect("server process lock")
                .take()
            {
                let _ = child.kill();
            }
        }
    });
}
