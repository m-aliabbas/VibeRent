export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.VIBERENT_DESKTOP === "1") {
    const { prepareDesktopRuntime } = await import("@/server/desktop/startup");
    await prepareDesktopRuntime();
    return;
  }
  const { startConfiguredWhatsAppRuntimes } = await import("@/server/services/whatsapp-settings-service");
  await startConfiguredWhatsAppRuntimes();
}
