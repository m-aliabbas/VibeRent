# VibeRent Windows desktop release

VibeRent is packaged as a Tauri v2 application. The installer contains the standalone Next.js server and a Node.js sidecar; it does not contain a second FastAPI backend.

## Runtime data

The Tauri shell starts one local server on port `4321`. It binds only to `127.0.0.1` by default. Set `VIBERENT_LAN_ENABLED=true` in the protected desktop environment only when other trusted devices must connect, and restrict port `4321` to the private network in Windows Firewall. Runtime state is stored outside the installation directory under the current user's Tauri local-data directory (`com.vibeexe.viberent`):

- `data/viberent.db` — SQLite database
- `data/private-files/` — vehicle photos and documents
- `data/license-token.json` — signed offline license token
- `data/google-drive-session.enc` — locally encrypted Google OAuth session
- `backups/` — manual, automatic, and pre-restore archives
- `startup.log` — desktop startup diagnostics

Installing an update does not replace these files. Do not move the SQLite database to OneDrive, Google Drive sync, or a network share. Use the application backup workflow instead.

## Firebase license service

The installer does not contain a Firebase Admin service-account key. The Firebase HTTPS function checks `viberent_licenses/{deviceFingerprint}` and returns a short-lived RS256-signed license. The desktop application verifies the signature with a bundled public key and can use that signed token offline until its expiry, for at most 30 days.

1. Create or select the Firebase project and enable Firestore and Cloud Functions.
2. Generate a dedicated signing pair:

   ```bash
   openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:3072 -out license-private.pem
   openssl rsa -pubout -in license-private.pem -out license-public.pem
   ```

3. Never commit either generated key. Store the private key as the Cloud Functions secret:

   ```bash
   cd firebase
   firebase functions:secrets:set LICENSE_SIGNING_PRIVATE_KEY
   cp .firebaserc.example .firebaserc
   cd functions && npm ci && npm run build && cd ..
   firebase deploy --only functions:viberentLicense,firestore:rules
   ```

4. Base64-encode `license-public.pem` and place it in the desktop environment as `LICENSE_PUBLIC_KEY_BASE64`.
5. Set `LICENSE_ENDPOINT_URL` to the deployed `viberentLicense` URL.
6. Start VibeRent on the customer PC. The first check creates a pending document in `viberent_licenses`.
7. In Firestore, set `approved: true`, `disabled: false`, `expireDate` to a Firestore timestamp, and optionally `customerName`.
8. Select **Check license again** on the desktop license screen.

Revoking a device prevents the next online renewal. A previously issued offline token remains valid until its signed expiry. Desktop licensing is a commercial control, not unbreakable DRM; determined users with control of the machine can patch any local executable.

## Google Drive backup

1. Enable Google Drive API in the Google Cloud project.
2. Configure the OAuth consent screen.
3. Create an OAuth client of type **Desktop app**.
4. Put its client ID and client secret in `desktop/.env` or the protected GitHub Actions environment.
5. Keep the redirect URI as `http://127.0.0.1:4321/api/v1/backups/google-drive/callback`.

VibeRent requests only `https://www.googleapis.com/auth/drive.file`. The refresh token is encrypted with a random key created on the customer PC. A backup contains a SQLite online snapshot, a manifest and checksum, and private attachments. Automatic backups run daily and retain seven days locally by default; connected installations also upload them to the `VibeRent Backups` Drive folder.

Restore is deliberately restart-only. VibeRent validates the archive, checks its checksum and SQLite integrity, creates a pre-restore safety backup, and stages the restore. The database and attachments are replaced before SQLite opens on the next application start.

## Local build

Create the protected build configuration:

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

Configure these source-repository secrets:

- `DESKTOP_ENV_FILE_BASE64` — Base64 of the production `desktop/.env` file.
- `RELEASE_REPO_TOKEN` — fine-grained token with **Contents: Read and write** for only `m-aliabbas/viberent-releases`.

For PowerShell:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("desktop\.env")) | Set-Clipboard
```

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
