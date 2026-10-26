# VibeRent Linux Server Deployment

This guide deploys the hosted VibeRent web application on a Linux server using Docker Compose and PostgreSQL. The Windows desktop build is separate and continues to use SQLite.

## 1. What the stack runs

The Compose stack contains:

- `web`: the Next.js VibeRent application configured for PostgreSQL (`VIBERENT_ROLE=web`, HTTP only)
- `worker`: background jobs from the same image: rendering receipts and agreements, owner WhatsApp commands and CNIC photos, recurring expenses, the daily report and maintenance
- `wa-gateway`: owns the agencies' WhatsApp connections and sends queued messages; run exactly one
- `postgres`: PostgreSQL 17
- `postgres_data`: a Docker named volume containing the PostgreSQL database
- `private_files`: a Docker named volume containing uploaded private files
- `app_data`: a Docker named volume containing runtime state such as linked WhatsApp sessions

The application runs PostgreSQL migrations automatically before the web server starts. `worker` and `wa-gateway` wait for `web` to be healthy, so they always start on a migrated database. Every service has a health check and uses `restart: unless-stopped`.

Background jobs are stored in PostgreSQL (pg-boss, schema `pgboss`), so a receipt queued just before a restart is still delivered afterwards. If `wa-gateway` is down, messages wait in the queue and the WhatsApp page shows the service as offline. Check the background services with:

```bash
docker compose --env-file .env.docker logs --tail 100 worker wa-gateway
```

## 2. Server requirements

Use a supported 64-bit Linux server with:

- Docker Engine
- Docker Compose plugin (`docker compose`)
- Git
- A DNS record pointing the public hostname to the server
- A TLS reverse proxy such as Caddy, Nginx, or the hosting provider's proxy

Allow inbound ports 80 and 443 through the firewall. Port 3000 only needs to be public when VibeRent is not behind a reverse proxy.

Confirm Docker is available:

```bash
docker --version
docker compose version
```

## 3. Get the application

Clone the repository and switch to the PostgreSQL web branch:

```bash
git clone YOUR_PRIVATE_REPOSITORY_URL viberent
cd viberent
git checkout codex/postgresql-web
```

For a production release, prefer deploying a reviewed tag or commit rather than following a moving branch.

## 4. Configure secrets

Create the private Docker environment file:

```bash
cp .env.docker.example .env.docker
nano .env.docker
```

At minimum, replace these values:

```dotenv
POSTGRES_DB=viberent
POSTGRES_USER=viberent
POSTGRES_PASSWORD=GENERATE_A_LONG_RANDOM_ALPHANUMERIC_PASSWORD
POSTGRES_URL=postgresql://viberent:SAME_PASSWORD@postgres:5432/viberent

BETTER_AUTH_URL=https://rent.example.com
BETTER_AUTH_SECRET=GENERATE_AT_LEAST_32_RANDOM_CHARACTERS
BETTER_AUTH_TRUSTED_ORIGINS=https://rent.example.com

RESEND_API_KEY=YOUR_RESEND_API_KEY
AUTH_EMAIL_FROM=VibeRent <auth@example.com>
```

`POSTGRES_PASSWORD` and the password inside `POSTGRES_URL` must match. Use an alphanumeric database password unless the password is properly URL-encoded in `POSTGRES_URL`.

Protect the file:

```bash
chmod 600 .env.docker
```

Never commit `.env.docker`. It is excluded by `.gitignore`.

## 5. Start VibeRent

Build and start both services:

```bash
docker compose --env-file .env.docker up -d --build
```

Check their status:

```bash
docker compose --env-file .env.docker ps
docker compose --env-file .env.docker logs --tail 100 web
```

The first web startup should report:

```text
PostgreSQL migrations applied.
Ready
```

Verify the local health endpoint:

```bash
curl --fail http://127.0.0.1:3000/health
```

## 6. HTTPS and reverse proxy

Put VibeRent behind an HTTPS reverse proxy and forward traffic to `127.0.0.1:3000`. The proxy must preserve the original host and forwarding headers.

Example Nginx location:

```nginx
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

After changing the public hostname, update `BETTER_AUTH_URL` and `BETTER_AUTH_TRUSTED_ORIGINS`, then recreate the web container:

```bash
docker compose --env-file .env.docker up -d --force-recreate web
```

## 7. Data persistence and server restarts

VibeRent data is not stored inside disposable container layers. Docker named volumes hold the durable data:

- `viberent_postgres_data`: agencies, users, bookings, vehicles, customers, payments, expenses, and other PostgreSQL records
- `viberent_private_files`: uploaded private documents and images stored by the application
- `viberent_app_data`: runtime state in `/app/.data`, including linked WhatsApp sessions (`whatsapp.db`) and the Google Drive session, so agencies do not need to scan the WhatsApp QR code again after a deployment

If the application crashes, the server loses power, or Linux is restarted, the data remains on the server disk in these volumes. When Docker and the Compose stack start again, VibeRent reconnects to the same data.

This means the data remains available when:

- The web process crashes and Docker restarts it
- PostgreSQL restarts
- The Linux server reboots
- Containers are recreated
- A new VibeRent image is built and deployed
- `docker compose down` is followed by `docker compose up -d`

The Compose file uses the fixed project name `viberent`, so the same named volumes are reattached when the stack is started again from the project directory.

Enable Docker at boot so services return after a Linux restart:

```bash
sudo systemctl enable --now docker
```

After rebooting the server, verify:

```bash
docker compose --env-file .env.docker ps
curl --fail http://127.0.0.1:3000/health
```

### Commands that can delete persistent data

Normal `docker compose down` does not delete named volumes. The following operations are destructive and must not be used during a routine deployment:

```bash
docker compose --env-file .env.docker down --volumes
docker volume rm viberent_postgres_data
docker volume rm viberent_private_files
docker volume rm viberent_app_data
docker system prune --volumes
```

Container persistence does not protect against server-disk failure, accidental volume deletion, theft, or a complete server rebuild. Maintain encrypted backups on a different server or storage provider.

## 8. Backups

Create a backup directory that is not inside a disposable container:

```bash
mkdir -p backups
chmod 700 backups
```

### PostgreSQL backup

```bash
docker compose --env-file .env.docker exec -T postgres \
  sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom' \
  > "backups/viberent-postgres-$(date -u +%Y%m%dT%H%M%SZ).dump"
```

### Private-file backup

```bash
docker compose --env-file .env.docker exec -T web \
  tar -C /app/.data/private-files -czf - . \
  > "backups/viberent-private-files-$(date -u +%Y%m%dT%H%M%SZ).tar.gz"
```

Copy both backup files to encrypted off-server storage. For a strictly consistent database-and-file recovery set, take both during a short maintenance window when users cannot upload or modify data. Schedule regular backups and periodically test restoration on a non-production stack.

The per-agency SQLite export available through `/api/v1/agency-backup` is useful for an individual agency's portable data. It does not replace full PostgreSQL and private-file infrastructure backups.

## 9. Restore after a server failure

If the original server disk and Docker volumes are intact, reinstall/start Docker, restore the repository and `.env.docker`, then run:

```bash
docker compose --env-file .env.docker up -d --build
```

Docker reattaches the existing named volumes automatically.

If the server disk or volumes were lost:

1. Provision a new Linux server.
2. Install Docker and clone the same VibeRent release.
3. Restore the original `.env.docker` securely.
4. Start only PostgreSQL first:

   ```bash
   docker compose --env-file .env.docker up -d postgres
   ```

5. Restore the PostgreSQL dump:

   ```bash
   docker compose --env-file .env.docker exec -T postgres \
     sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner' \
     < backups/YOUR_POSTGRES_BACKUP.dump
   ```

6. Restore private files through a temporary web container, then start the web service:

   ```bash
   docker compose --env-file .env.docker run --rm --no-deps -T web \
     tar -C /app/.data/private-files -xzf - \
     < backups/YOUR_PRIVATE_FILES_BACKUP.tar.gz
   docker compose --env-file .env.docker up -d web
   ```

7. Check service health, authentication, recent bookings, payments, and a private-file download.

Perform destructive restore operations only during a maintenance window and keep the original backup until the restored system has been verified.

## 10. Deploy an update

Back up the database and private files first. Then update and rebuild:

```bash
git fetch --all --tags
git checkout YOUR_REVIEWED_TAG_OR_COMMIT
docker compose --env-file .env.docker up -d --build
docker compose --env-file .env.docker ps
docker compose --env-file .env.docker logs --tail 100 web
curl --fail http://127.0.0.1:3000/health
```

The new containers reuse the existing named volumes. PostgreSQL migrations run before the updated application starts.

### GitHub Actions deployment

The manual `Deploy Linux Web` workflow uploads the selected Git revision to `/home/vibeadmin/viberent`, preserves `.env.docker` and server backups, creates pre-deployment backups when services are already running, rebuilds the Compose stack, and checks the health endpoint.

In the repository's GitHub settings, create a `production` environment and add these environment secrets:

- `DEPLOY_PASSWORD`: the Linux deployment user's current SSH password
- `DEPLOY_KNOWN_HOSTS`: the verified SSH host-key line for the production server

Generate the known-host line from a trusted administrator machine:

```bash
ssh-keyscan -H 169.58.79.57
```

Verify the reported fingerprint through the server provider or console before saving it as `DEPLOY_KNOWN_HOSTS`. Configure required reviewers on the `production` environment so a deployment needs approval.

The deployment account must be able to run Docker without an interactive `sudo` prompt. Configure this once through the server console, then sign out and back in:

```bash
sudo usermod -aG docker vibeadmin
```

Before the first workflow run, create the deployment directory and upload the environment template from a trusted administrator machine:

```bash
ssh vibeadmin@169.58.79.57 'mkdir -p /home/vibeadmin/viberent'
scp .env.docker.example vibeadmin@169.58.79.57:/home/vibeadmin/viberent/.env.docker
ssh -t vibeadmin@169.58.79.57 'chmod 600 /home/vibeadmin/viberent/.env.docker && nano /home/vibeadmin/viberent/.env.docker'
```

Replace every `CHANGE_ME` value. The workflow deliberately never uploads or overwrites `.env.docker`.

Run the workflow from GitHub under **Actions → Deploy Linux Web → Run workflow**. Password authentication is supported for initial setup, but an SSH deployment key should replace it later. Rotate any password that has been shared through chat, email, or another non-secret channel before adding it to GitHub.

## 11. Useful operational commands

```bash
# Follow application logs
docker compose --env-file .env.docker logs -f web

# Follow PostgreSQL logs
docker compose --env-file .env.docker logs -f postgres

# Restart only the web application
docker compose --env-file .env.docker restart web

# Stop containers without deleting persistent volumes
docker compose --env-file .env.docker down

# Start existing containers and volumes again
docker compose --env-file .env.docker up -d

# Show the persistent volumes
docker volume ls --filter name=viberent
```

## 12. Production checklist

- `.env.docker` is mode `600` and not committed
- PostgreSQL and Better Auth secrets are long and unique
- Public traffic uses HTTPS
- Port 5432 is not exposed publicly
- Port 3000 is restricted when a reverse proxy is used
- Docker starts automatically after server reboot
- Both containers report healthy
- Automated PostgreSQL and private-file backups run regularly
- Backups are encrypted and copied off-server
- A restore has been tested outside production
- Monitoring alerts on container health, disk capacity, and failed backups

## Agency owner Google Drive backups

The hosted web Settings page includes a **Cloud backup** tab for agency owners. To enable Google Drive upload, create a Google OAuth **web** client, enable the Google Drive API, and add `https://YOUR_HOST/api/v1/agency-backup/google-drive/callback` as an authorized redirect URI. Set `GOOGLE_DRIVE_WEB_CLIENT_ID` and `GOOGLE_DRIVE_WEB_CLIENT_SECRET` in the private `.env.docker` file, or encrypt a Google web OAuth JSON document as `g1-web.json.enc`, mount it read-only in the web container, and set `GOOGLE_DRIVE_WEB_CLIENT_CONFIG_ENC_PATH` to the container path. The existing desktop `g1.json.enc` contains an installed client with a loopback redirect and cannot authorize the hosted callback. Then restart the web service. The OAuth scope is `drive.file`; each owner authorizes their own Google account. The refresh token is encrypted in the application database using `BETTER_AUTH_SECRET`, so keep that secret stable and backed up. Owners can always download a portable backup without Google configuration.

The portable backup contains agency records, including guarantors and saved external vehicles. It excludes uploaded document bytes, authentication credentials, and WhatsApp state. Back up the private file volume separately for complete recovery. For hosted CNIC OCR, set `OPENAI_API_KEY` in the private environment file or mount the existing encrypted `o1.json.enc` read-only and set `OPENAI_CREDENTIALS_ENC_PATH` to its container path. Set `FIREBASE_CREDENTIALS_KEY` if the encrypted file used a custom key. Encrypted credentials are excluded from the Docker image, so mounts or secret environment values must be configured on the deployment host.
