# VibeRent Windows desktop release

VibeRent is packaged as a Tauri v2 launcher. The installer contains the standalone Next.js server and a Node.js sidecar; it does not contain a second FastAPI backend. Tauri displays only a small service-status window. The complete application runs in the user's default browser at `http://rent.local`, with `http://localhost` as an automatic fallback.

The installer does not download WebView2. The small Tauri launcher still requires the WebView2 runtime that is included with supported Windows 10 and Windows 11 installations; repair or install WebView2 separately on an unusually stripped-down machine.

## Runtime data

The Tauri launcher starts one server on TCP port `80`, binds it to `0.0.0.0`, and verifies `http://127.0.0.1/health`. It then verifies `http://rent.local/health`; when that signed response succeeds it opens `http://rent.local`, otherwise it opens `http://localhost`. Trusted LAN clients use the port-free `rent.local` URL through mDNS. If port 80 already exposes the signed VibeRent health response, the launcher connects without starting a second server; any other listener produces a friendly port-conflict error. Permit inbound TCP 80 and UDP 5353 only on private networks in Windows Firewall; do not expose the service to public networks or the internet. Runtime state is stored outside the installation directory under the current user's Tauri local-data directory (`com.vibeexe.viberent`):

- `data/viberent.db` — SQLite database
- `data/private-files/` — vehicle photos and documents
- `data/license-cache.enc` — per-installation encrypted offline license cache
- `data/google-drive-session.enc` — locally encrypted Google OAuth session
- `backups/` — manual, automatic, and pre-restore archives
- `startup.log` — desktop startup diagnostics

The launcher owns only the Node sidecar it starts. Restart, launcher-window close, **Stop & Exit**, and tray **Exit** terminate that owned process. Closing a browser tab does not stop VibeRent. The official Tauri single-instance plugin prevents duplicate launchers; opening the executable again asks the running launcher to reopen the browser instead.

Installing an update does not replace these files. Do not move the SQLite database to OneDrive, Google Drive sync, or a network share. Use the application backup workflow instead.

For 1.0.19, the installer includes the complete SQLite migration history through `0023_early_rhodey`. The 1.0.18 migrations through `0022_salty_wallflower` remain unchanged, so an existing client database advances in place. Desktop startup makes a pre-migration archive containing the database and private files, then applies pending migrations and checks SQLite integrity and foreign keys. The release workflow tests a 1.0.18 database upgrade and a fresh install. Keep the application data directory and a separate backup when updating customer PCs.

## Encrypted Firebase license credentials

The desktop runtime reads the Firebase Admin service account from `k1.json.enc`. The file uses Fernet encryption and is decrypted only inside the local Node.js server. The shared compatibility key follows the VibePOS packaging model and can be overridden with `FIREBASE_CREDENTIALS_KEY` when rotating credentials.

1. Create or select the Firebase project, enable Firestore, and download a least-privilege service-account JSON file.
2. Encrypt it without committing the plaintext:

   ```bash
   npm run credentials:encrypt -- \
     --input /secure/path/firebase-service-account.json \
     --output k1.json.enc
   ```

3. Start VibeRent on the customer PC. The first online check creates a pending document in `viberent_licenses`.
4. The registration includes a 30-day `expireDate` and a `fingerprint_payload` map containing the hostname, OS, processor, user, and MAC diagnostics. In Firestore, set `approved: true`, keep `disabled: false`, and optionally adjust `expireDate` or add `customerName`.
5. Select **Check license again** on the desktop license screen.

Older VibeRent documents that do not contain `expireDate` are backfilled with a 30-day expiry on their next check. The validator also accepts the VibePOS-compatible `expire_date` field.

Before producing a Windows installer, exercise the same license screen and Firebase code through the local web server:

```bash
npm run license:test
npm run license:test:web
```

Open `http://localhost:3000/license`, confirm the system-information panel, approve the generated document in Firestore, and select **Check license again**. A successful approval redirects away from the license screen. The web-test command uses `.data/license-web-test` and does not use the normal development database.

Successful checks are cached for offline use for no more than 30 days and never beyond the remote expiry. The cache and Google session use a separate random key created on each customer PC. Bundling an encrypted credential beside the decrypting application protects the file at rest but is not a hard security boundary; use a dedicated restricted service account and rotate it when an installer is retired.

## Google Drive backup

1. Enable Google Drive API in the Google Cloud project.
2. Configure the OAuth consent screen.
3. Create an OAuth client of type **Desktop app** and download its client JSON.
4. Encrypt the JSON with the same Fernet key used for the Firebase credential:

   ```bash
   npm run credentials:encrypt -- \
     --input /secure/path/google-oauth-client.json \
     --output g1.json.enc
   ```

5. Keep the runtime redirect URI as `http://127.0.0.1`. Google returns to the loopback root and the application proxy rewrites the OAuth response to `/api/v1/backups/google-drive/callback`.

VibeRent requests only `https://www.googleapis.com/auth/drive.file`. The refresh token is encrypted with a random key created on the customer PC. A backup contains a SQLite online snapshot, a manifest and checksum, and private attachments. Automatic backups run daily and retain seven days locally by default; connected installations also upload them to the `VibeRent Backups` Drive folder.

Restore is deliberately restart-only. VibeRent validates the archive, checks its checksum and SQLite integrity, creates a pre-restore safety backup, and stages the restore. The database and attachments are replaced before SQLite opens on the next application start.

## OpenAI OCR credential

The desktop build reads the CNIC OCR API key from `o1.json.enc`; it does not require `OPENAI_API_KEY` in the packaged `.env`. Generate or rotate the encrypted file directly from the ignored local environment without creating a plaintext JSON file:

```bash
npm run credentials:encrypt:openai
```

The command reads `OPENAI_API_KEY` from `.env.local`, writes only the encrypted `{ "api_key": "..." }` document, and the desktop packager requires and copies `o1.json.enc` into the standalone server bundle. The local web server also falls back to `o1.json.enc`, so `.env.local` can be removed after the encrypted credential is generated.

## Local build

Optionally create a local desktop configuration. If it is absent, the packager writes safe non-secret desktop defaults and the application generates its Better Auth secret on first launch:

```bash
cp desktop/.env.example desktop/.env
npm ci
npm run lint
npm run typecheck
npm run db:check:desktop-upgrade
npm run build:desktop-server
npm run desktop:prepare
npm run desktop:build -- --bundles nsis
```

NSIS installers must be built on Windows. `cargo check --release --manifest-path src-tauri/Cargo.toml` validates the Rust shell on a development machine.

## GitHub Actions setup

Create a public release-only repository named `m-aliabbas/viberent-releases`. Keep it empty except for `README.md`; the workflow refuses to publish if it contains other files.

Configure `RELEASE_REPO_TOKEN`, a fine-grained token with **Contents: Read and write** for only `m-aliabbas/viberent-releases`. The release no longer requires `DESKTOP_ENV_FILE_BASE64`; the three encrypted credential resources are packaged directly.

A manual **Windows Release** run creates a private 90-day Actions artifact. It does not publish publicly. A `v*` tag publishes only the installer, `SHA256SUMS.txt`, and `latest.json` to the release-only repository.

The desktop app reads `latest.json` from the newest public release in **Settings → Software update**. When a newer semantic version is available, the app downloads the installer to the current user's Downloads folder and verifies its SHA-256 before revealing it in Explorer. The updater never installs silently, and application data remains outside the installation directory. The browser build opens the same official GitHub asset directly.

The installer is currently unsigned, so Windows can show a security warning. Add Authenticode signing before broad distribution; the manifest checksum protects download integrity but is not a substitute for code signing.

Set and publish a release:

```bash
npm run release:set -- 1.0.19
npm run release:check
git add package.json package-lock.json src-tauri drizzle scripts .github WINDOWS_RELEASE.md
git commit -m "release: v1.0.19"
git tag v1.0.19
git push origin HEAD --tags
```

Keep the Authenticode certificate and password only in GitHub Actions secrets.
