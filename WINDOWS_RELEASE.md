# VibeRent Windows desktop release

VibeRent is packaged as a Tauri v2 application. The installer contains the standalone Next.js server and a Node.js sidecar; it does not contain a second FastAPI backend.

## Runtime data

The Tauri shell starts one local server on port `4322`, separate from VibePOS on `4321`. It binds only to `127.0.0.1` by default and refuses to open another application's server if the port is occupied. Set `VIBERENT_LAN_ENABLED=true` in the protected desktop environment only when other trusted devices must connect, and restrict port `4322` to the private network in Windows Firewall. Runtime state is stored outside the installation directory under the current user's Tauri local-data directory (`com.vibeexe.viberent`):

- `data/viberent.db` — SQLite database
- `data/private-files/` — vehicle photos and documents
- `data/license-cache.enc` — per-installation encrypted offline license cache
- `data/google-drive-session.enc` — locally encrypted Google OAuth session
- `backups/` — manual, automatic, and pre-restore archives
- `startup.log` — desktop startup diagnostics

Installing an update does not replace these files. Do not move the SQLite database to OneDrive, Google Drive sync, or a network share. Use the application backup workflow instead.

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

5. Keep the runtime redirect URI as `http://127.0.0.1:4322/api/v1/backups/google-drive/callback`.

VibeRent requests only `https://www.googleapis.com/auth/drive.file`. The refresh token is encrypted with a random key created on the customer PC. A backup contains a SQLite online snapshot, a manifest and checksum, and private attachments. Automatic backups run daily and retain seven days locally by default; connected installations also upload them to the `VibeRent Backups` Drive folder.

Restore is deliberately restart-only. VibeRent validates the archive, checks its checksum and SQLite integrity, creates a pre-restore safety backup, and stages the restore. The database and attachments are replaced before SQLite opens on the next application start.

## OpenAI OCR credential

The desktop build reads the CNIC OCR API key from `o1.json.enc`; it does not require `OPENAI_API_KEY` in the packaged `.env`. Generate or rotate the encrypted file directly from the ignored local environment without creating a plaintext JSON file:

```bash
npm run credentials:encrypt:openai
```

The command reads `OPENAI_API_KEY` from `.env.local`, writes only the encrypted `{ "api_key": "..." }` document, and the desktop packager requires and copies `o1.json.enc` into the standalone server bundle. Local web development continues to use `OPENAI_API_KEY` from `.env.local`.

## Local build

Optionally create a local desktop configuration. If it is absent, the packager writes safe non-secret desktop defaults and the application generates its Better Auth secret on first launch:

```bash
cp desktop/.env.example desktop/.env
npm ci
npm run lint
npm run typecheck
npm run build
npm run desktop:prepare
npm run desktop:build -- --bundles nsis
```

NSIS installers must be built on Windows. `cargo check --release --manifest-path src-tauri/Cargo.toml` validates the Rust shell on a development machine.

## GitHub Actions setup

Create a public release-only repository named `m-aliabbas/viberent-releases`. Keep it empty except for `README.md`; the workflow refuses to publish if it contains other files.

Configure `RELEASE_REPO_TOKEN`, a fine-grained token with **Contents: Read and write** for only `m-aliabbas/viberent-releases`. The release no longer requires `DESKTOP_ENV_FILE_BASE64`; the three encrypted credential resources are packaged directly.

A manual **Windows Release** run creates a private 90-day Actions artifact. It does not publish publicly. A `v*` tag publishes only the installer, `SHA256SUMS.txt`, and `latest.json` to the release-only repository.

Set and publish a release:

```bash
npm run release:set -- 0.2.0
npm run release:check
git add package.json package-lock.json src-tauri .github WINDOWS_RELEASE.md
git commit -m "release: v0.2.0"
git tag v0.2.0
git push origin main --tags
```

The current installer is unsigned. Add Windows Authenticode signing before broad distribution; keep the certificate and password only in GitHub Actions secrets.
