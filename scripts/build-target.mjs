import { spawn } from "node:child_process";
import process from "node:process";

const target = process.argv[2];
if (target !== "postgres" && target !== "sqlite") {
  throw new Error("Usage: node scripts/build-target.mjs <postgres|sqlite>");
}

const nextBin = process.platform === "win32" ? "next.cmd" : "next";
const child = spawn(nextBin, ["build", "--webpack"], {
  stdio: "inherit",
  env: {
    ...process.env,
    VIBERENT_DATABASE: target,
    ...(target === "sqlite" ? { VIBERENT_DESKTOP: "1" } : {}),
  },
});

child.on("error", error => {
  console.error(error);
  process.exitCode = 1;
});

child.on("exit", code => {
  process.exitCode = code ?? 1;
});
