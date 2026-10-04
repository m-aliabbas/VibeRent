export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.VIBERENT_DESKTOP === "1") {
    const { prepareDesktopRuntime } = await import("@/server/desktop/startup");
    await prepareDesktopRuntime();
  }
}
