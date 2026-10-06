import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { Bonjour } from "bonjour-service";

const host = process.env.VIBERENT_LOCAL_HOST?.trim() || "rent.local";
const port = Number(process.env.VIBERENT_LOCAL_PORT || 80);
if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error("VIBERENT_LOCAL_PORT must be a valid TCP port.");
}

const origin = `http://${host}${port === 80 ? "" : `:${port}`}`;
const trustedOrigins = new Set(
  (process.env.BETTER_AUTH_TRUSTED_ORIGINS || "")
    .split(",")
    .map(value => value.trim())
    .filter(Boolean),
);
trustedOrigins.add(origin);
trustedOrigins.add(`http://localhost${port === 80 ? "" : `:${port}`}`);

const bonjour = new Bonjour();
const service = bonjour.publish({
  name: "VibeRent",
  host,
  type: "http",
  protocol: "tcp",
  port,
  txt: { application: "viberent" },
});

service.on("up", () => {
  process.stdout.write(`VibeRent is advertised at ${origin}\n`);
});

const nextBin = path.join(process.cwd(), "node_modules", "next", "dist", "bin", "next");
const child = spawn(process.execPath, [nextBin, "dev", "--hostname", "0.0.0.0", "--port", String(port)], {
  stdio: "inherit",
  env: {
    ...process.env,
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL?.trim() || origin,
    BETTER_AUTH_TRUSTED_ORIGINS: [...trustedOrigins].join(","),
  },
});

child.on("error", error => {
  process.stderr.write(`Could not start VibeRent on ${origin}: ${error.message}\n`);
});

child.on("exit", code => {
  service.stop(() => bonjour.destroy());
  process.exitCode = code ?? 1;
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    child.kill(signal);
    service.stop(() => bonjour.destroy());
  });
}
