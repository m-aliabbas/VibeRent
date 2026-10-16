#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::collections::HashMap;
use std::fs::OpenOptions;
use std::io::Write;
use std::net::{TcpStream, UdpSocket};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use mdns_sd::{ServiceDaemon, ServiceInfo};
use serde::Serialize;
use sha2::{Digest, Sha256};
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Manager, RunEvent};
use tauri_plugin_opener::OpenerExt;
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

struct LauncherState {
    process: Mutex<Option<CommandChild>>,
    mdns: Mutex<Option<ServiceDaemon>>,
    status: Mutex<LauncherStatus>,
    lifecycle: tokio::sync::Mutex<()>,
    generation: AtomicU64,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct LauncherStatus {
    message: String,
    detail: String,
    url: String,
    ready: bool,
    busy: bool,
    failed: bool,
}

impl Default for LauncherState {
    fn default() -> Self {
        Self {
            process: Mutex::new(None),
            mdns: Mutex::new(None),
            status: Mutex::new(LauncherStatus {
                message: "Starting VibeRent…".into(),
                detail: "Preparing local services".into(),
                url: PREFERRED_APP_URL.into(),
                ready: false,
                busy: true,
                failed: false,
            }),
            lifecycle: tokio::sync::Mutex::new(()),
            generation: AtomicU64::new(0),
        }
    }
}

const DESKTOP_PORT: u16 = 80;
const DESKTOP_HOSTNAME: &str = "rent.local";
const PREFERRED_APP_URL: &str = "http://rent.local";
const FALLBACK_APP_URL: &str = "http://localhost";
const HEALTH_URL: &str = "http://127.0.0.1/health";

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

#[derive(PartialEq, Eq)]
enum HealthProbe {
    VibeRent,
    Occupied,
    Unavailable,
}

async fn health_probe() -> HealthProbe {
    if TcpStream::connect_timeout(
        &([127, 0, 0, 1], DESKTOP_PORT).into(),
        Duration::from_millis(300),
    )
    .is_err()
    {
        return HealthProbe::Unavailable;
    }

    let client = match reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(1))
        .timeout(Duration::from_secs(2))
        .build()
    {
        Ok(client) => client,
        Err(_) => return HealthProbe::Occupied,
    };
    match client.get(HEALTH_URL).send().await {
        Ok(response)
            if response.status().is_success()
                && response
                    .headers()
                    .get("x-viberent-service")
                    .and_then(|value| value.to_str().ok())
                    == Some("viberent") =>
        {
            HealthProbe::VibeRent
        }
        _ => HealthProbe::Occupied,
    }
}

async fn is_viberent_url(url: &str) -> bool {
    let Ok(client) = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(1))
        .timeout(Duration::from_secs(2))
        .build()
    else {
        return false;
    };
    matches!(
        client.get(format!("{url}/health")).send().await,
        Ok(response)
            if response.status().is_success()
                && response
                    .headers()
                    .get("x-viberent-service")
                    .and_then(|value| value.to_str().ok())
                    == Some("viberent")
    )
}

async fn select_browser_url() -> &'static str {
    let started = Instant::now();
    while started.elapsed() < Duration::from_secs(4) {
        if is_viberent_url(PREFERRED_APP_URL).await {
            return PREFERRED_APP_URL;
        }
        tokio::time::sleep(Duration::from_millis(300)).await;
    }
    FALLBACK_APP_URL
}

async fn wait_for_server(timeout: Duration) -> bool {
    let started = Instant::now();
    while started.elapsed() < timeout {
        if health_probe().await == HealthProbe::VibeRent {
            return true;
        }
        tokio::time::sleep(Duration::from_millis(350)).await;
    }
    false
}

fn set_status(app: &AppHandle, message: &str, detail: &str, ready: bool, busy: bool, failed: bool) {
    let state = app.state::<LauncherState>();
    let current_url = state
        .status
        .lock()
        .expect("launcher status lock")
        .url
        .clone();
    *state.status.lock().expect("launcher status lock") = LauncherStatus {
        message: message.into(),
        detail: detail.into(),
        url: current_url,
        ready,
        busy,
        failed,
    };
}

fn set_browser_url(app: &AppHandle, url: &str) {
    app.state::<LauncherState>()
        .status
        .lock()
        .expect("launcher status lock")
        .url = url.into();
}

fn log_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_local_data_dir()
        .map_err(|error| error.to_string())?
        .join("startup.log"))
}

fn open_browser(app: &AppHandle) -> Result<(), String> {
    let url = app
        .state::<LauncherState>()
        .status
        .lock()
        .expect("launcher status lock")
        .url
        .clone();
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|error| error.to_string())
}

fn stop_owned_services(app: &AppHandle) -> bool {
    let state = app.state::<LauncherState>();
    state.generation.fetch_add(1, Ordering::SeqCst);
    if let Some(responder) = state.mdns.lock().expect("mDNS responder lock").take() {
        let _ = responder.shutdown();
    }
    let stopped = if let Some(child) = state.process.lock().expect("server process lock").take() {
        let _ = child.kill();
        true
    } else {
        false
    };
    stopped
}

async fn start_services_unlocked(app: AppHandle, open_when_ready: bool) -> Result<(), String> {
    let state = app.state::<LauncherState>();
    let log = log_path(&app)?;

    match health_probe().await {
        HealthProbe::VibeRent => {
            append_log(
                &log,
                "Connected to an existing VibeRent service on port 80.",
            );
            let browser_url = select_browser_url().await;
            set_browser_url(&app, browser_url);
            set_status(
                &app,
                "VibeRent services are running",
                browser_url,
                true,
                false,
                false,
            );
            if open_when_ready {
                open_browser(&app)?;
            }
            return Ok(());
        }
        HealthProbe::Occupied => {
            let detail = "Port 80 is being used by another application. Close it, then select Restart Services.";
            append_log(&log, detail);
            set_status(
                &app,
                "Failed to start — View Logs",
                detail,
                false,
                false,
                true,
            );
            return Err(detail.into());
        }
        HealthProbe::Unavailable => {}
    }

    set_status(
        &app,
        "Starting database…",
        "Preparing VibeRent local data",
        false,
        true,
        false,
    );
    append_log(&log, "Starting database and desktop runtime.");

    let app_data = app
        .path()
        .app_local_data_dir()
        .map_err(|error| error.to_string())?;
    let data = app_data.join("data");
    let backups = app_data.join("backups");
    let private_files = data.join("private-files");
    std::fs::create_dir_all(&data).map_err(|error| error.to_string())?;
    std::fs::create_dir_all(&backups).map_err(|error| error.to_string())?;
    std::fs::create_dir_all(&private_files).map_err(|error| error.to_string())?;

    let standalone = standalone_directory(&app)?;
    set_status(
        &app,
        "Starting backend…",
        "Launching the local VibeRent server",
        false,
        true,
        false,
    );
    let mut command = app
        .shell()
        .sidecar("next-server")
        .map_err(|error| error.to_string())?
        .current_dir(&standalone)
        .arg("server.js");
    for (key, value) in packaged_environment(&app) {
        command = command.env(key, value);
    }
    #[cfg(target_os = "macos")]
    if let Ok(resources) = app.path().resource_dir() {
        command = command.env(
            "DYLD_LIBRARY_PATH",
            resources.join("bin").to_string_lossy().to_string(),
        );
    }
    let mut trusted_origins = vec![
        http_origin(DESKTOP_HOSTNAME, DESKTOP_PORT),
        http_origin("127.0.0.1", DESKTOP_PORT),
        http_origin("localhost", DESKTOP_PORT),
    ];
    if let Some(ip) = local_lan_ip() {
        trusted_origins.push(http_origin(&ip.to_string(), DESKTOP_PORT));
    }
    command = command
        .env("PORT", DESKTOP_PORT.to_string())
        .env("HOSTNAME", "0.0.0.0")
        .env("NODE_ENV", "production")
        .env("NEXT_TELEMETRY_DISABLED", "1")
        .env("VIBERENT_DESKTOP", "1")
        .env("VIBERENT_VERSION", env!("CARGO_PKG_VERSION"))
        .env("VIBERENT_DATA_DIR", data.to_string_lossy().to_string())
        .env(
            "DATABASE_URL",
            data.join("viberent.db").to_string_lossy().to_string(),
        )
        .env(
            "PRIVATE_FILE_STORAGE_ROOT",
            private_files.to_string_lossy().to_string(),
        )
        .env("BACKUP_ROOT", backups.to_string_lossy().to_string())
        .env(
            "LICENSE_CACHE_PATH",
            data.join("license-cache.enc").to_string_lossy().to_string(),
        )
        .env(
            "GOOGLE_DRIVE_SESSION_PATH",
            data.join("google-drive-session.enc")
                .to_string_lossy()
                .to_string(),
        )
        .env(
            "VIBERENT_MIGRATIONS_DIR",
            standalone.join("drizzle").to_string_lossy().to_string(),
        )
        .env("BETTER_AUTH_URL", PREFERRED_APP_URL)
        .env(
            "GOOGLE_DRIVE_REDIRECT_URI",
            http_origin("127.0.0.1", DESKTOP_PORT),
        )
        .env("BETTER_AUTH_TRUSTED_ORIGINS", trusted_origins.join(","));

    let (mut receiver, child) = command.spawn().map_err(|error| error.to_string())?;
    let generation = state.generation.fetch_add(1, Ordering::SeqCst) + 1;
    *state.process.lock().expect("server process lock") = Some(child);
    let output_app = app.clone();
    let output_log = log.clone();
    tauri::async_runtime::spawn(async move {
        while let Some(event) = receiver.recv().await {
            match event {
                CommandEvent::Stdout(bytes) => append_log(
                    &output_log,
                    &format!("SERVER: {}", String::from_utf8_lossy(&bytes)),
                ),
                CommandEvent::Stderr(bytes) => append_log(
                    &output_log,
                    &format!("SERVER_ERROR: {}", String::from_utf8_lossy(&bytes)),
                ),
                CommandEvent::Error(error) => {
                    append_log(&output_log, &format!("SERVER_EVENT_ERROR: {error}"))
                }
                CommandEvent::Terminated(payload) => {
                    append_log(&output_log, &format!("SERVER_EXIT: {:?}", payload.code));
                    if output_app
                        .state::<LauncherState>()
                        .generation
                        .load(Ordering::SeqCst)
                        == generation
                    {
                        set_status(
                            &output_app,
                            "Failed to start — View Logs",
                            "The VibeRent server stopped unexpectedly.",
                            false,
                            false,
                            true,
                        );
                    }
                }
                _ => {}
            }
        }
    });

    set_status(
        &app,
        "Waiting for server…",
        "Checking the local VibeRent health endpoint",
        false,
        true,
        false,
    );
    if !wait_for_server(Duration::from_secs(90)).await {
        let detail = "The local server did not become healthy within 90 seconds.";
        append_log(&log, detail);
        stop_owned_services(&app);
        set_status(
            &app,
            "Failed to start — View Logs",
            detail,
            false,
            false,
            true,
        );
        return Err(detail.into());
    }

    match start_mdns(DESKTOP_PORT) {
        Ok(responder) => {
            append_log(&log, "VibeRent advertised at http://rent.local via mDNS.");
            *state.mdns.lock().expect("mDNS responder lock") = Some(responder);
        }
        Err(error) => append_log(
            &log,
            &format!("MDNS_WARNING: Could not advertise rent.local: {error}"),
        ),
    }
    let browser_url = select_browser_url().await;
    set_browser_url(&app, browser_url);
    if browser_url == FALLBACK_APP_URL {
        append_log(
            &log,
            "MDNS_WARNING: rent.local did not resolve; using http://localhost.",
        );
    }
    append_log(&log, &format!("VibeRent is ready at {browser_url}."));
    set_status(
        &app,
        "VibeRent services are running",
        browser_url,
        true,
        false,
        false,
    );
    if open_when_ready {
        open_browser(&app)?;
    }
    Ok(())
}

async fn start_services(app: AppHandle, open_when_ready: bool) -> Result<(), String> {
    let state = app.state::<LauncherState>();
    let _guard = state.lifecycle.lock().await;
    let result = start_services_unlocked(app.clone(), open_when_ready).await;
    if let Err(error) = &result {
        if let Ok(path) = log_path(&app) {
            append_log(&path, &format!("LAUNCHER_ERROR: {error}"));
        }
        if !app
            .state::<LauncherState>()
            .status
            .lock()
            .expect("launcher status lock")
            .failed
        {
            set_status(
                &app,
                "Failed to start — View Logs",
                error,
                false,
                false,
                true,
            );
        }
    }
    result
}

async fn restart_services_inner(app: AppHandle) -> Result<(), String> {
    let state = app.state::<LauncherState>();
    let _guard = state.lifecycle.lock().await;
    set_status(
        &app,
        "Restarting VibeRent…",
        "Stopping local services safely",
        false,
        true,
        false,
    );
    if stop_owned_services(&app) {
        let started = Instant::now();
        while TcpStream::connect(("127.0.0.1", DESKTOP_PORT)).is_ok()
            && started.elapsed() < Duration::from_secs(8)
        {
            tokio::time::sleep(Duration::from_millis(250)).await;
        }
    }
    let result = start_services_unlocked(app.clone(), true).await;
    if let Err(error) = &result {
        if let Ok(path) = log_path(&app) {
            append_log(&path, &format!("RESTART_ERROR: {error}"));
        }
        if !app
            .state::<LauncherState>()
            .status
            .lock()
            .expect("launcher status lock")
            .failed
        {
            set_status(
                &app,
                "Failed to start — View Logs",
                error,
                false,
                false,
                true,
            );
        }
    }
    result
}

#[tauri::command]
fn launcher_status(app: AppHandle) -> LauncherStatus {
    app.state::<LauncherState>()
        .status
        .lock()
        .expect("launcher status lock")
        .clone()
}

#[tauri::command]
async fn open_viberent(app: AppHandle) -> Result<(), String> {
    if health_probe().await != HealthProbe::VibeRent {
        let detail = "VibeRent is not responding. Select Restart Services and try again.";
        set_status(
            &app,
            "Failed to start — View Logs",
            detail,
            false,
            false,
            true,
        );
        return Err(detail.into());
    }
    open_browser(&app)
}

#[tauri::command]
async fn restart_services(app: AppHandle) -> Result<(), String> {
    restart_services_inner(app).await
}

#[tauri::command]
fn view_logs(app: AppHandle) -> Result<(), String> {
    let path = log_path(&app)?.to_string_lossy().to_string();
    app.opener()
        .open_path(path, None::<&str>)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn stop_and_exit(app: AppHandle) {
    app.exit(0);
}

fn setup_tray(app: &tauri::App) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open-viberent", "Open VibeRent", true, None::<&str>)?;
    let restart = MenuItem::with_id(
        app,
        "restart-services",
        "Restart Services",
        true,
        None::<&str>,
    )?;
    let separator = PredefinedMenuItem::separator(app)?;
    let exit = MenuItem::with_id(app, "exit", "Exit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &restart, &separator, &exit])?;
    let mut tray = TrayIconBuilder::with_id("viberent-tray")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .tooltip("VibeRent services");
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.on_menu_event(|app, event| match event.id().as_ref() {
        "open-viberent" => {
            let handle = app.clone();
            tauri::async_runtime::spawn(async move {
                if wait_for_server(Duration::from_secs(30)).await {
                    let _ = open_browser(&handle);
                } else if let Some(window) = handle.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            });
        }
        "restart-services" => {
            let handle = app.clone();
            tauri::async_runtime::spawn(async move {
                let _ = restart_services_inner(handle).await;
            });
        }
        "exit" => app.exit(0),
        _ => {}
    })
    .build(app)?;
    Ok(())
}

fn main() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            let handle = app.clone();
            tauri::async_runtime::spawn(async move {
                if wait_for_server(Duration::from_secs(30)).await {
                    let _ = open_browser(&handle);
                } else if let Some(window) = handle.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            });
        }))
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            save_download,
            download_update,
            launcher_status,
            open_viberent,
            restart_services,
            view_logs,
            stop_and_exit
        ])
        .manage(LauncherState::default())
        .on_window_event(|window, event| {
            if matches!(event, tauri::WindowEvent::CloseRequested { .. }) {
                window.app_handle().exit(0);
            }
        })
        .setup(|app| {
            let handle = app.handle().clone();
            setup_tray(app)?;
            if let Ok(path) = log_path(&handle) {
                append_log(&path, "=== VibeRent launcher start ===");
            }
            tauri::async_runtime::spawn(async move {
                let _ = start_services(handle, true).await;
            });
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building VibeRent");

    app.run(|handle, event| {
        if matches!(event, RunEvent::Exit | RunEvent::ExitRequested { .. }) {
            stop_owned_services(handle);
        }
    });
}
