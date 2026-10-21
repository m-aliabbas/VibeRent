export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.VIBERENT_DESKTOP === "1") {
    const { prepareDesktopRuntime } = await import("@/server/desktop/startup");
    await prepareDesktopRuntime();
    await startRecurringExpenses();
    return;
  }
  const { startConfiguredWhatsAppRuntimes } = await import("@/server/services/whatsapp-settings-service");
  await startConfiguredWhatsAppRuntimes();
  await startRecurringExpenses();
}

// Started after any desktop restore and migrations so the database is final before it is opened.
async function startRecurringExpenses() {
  try {
    const { startRecurringExpenseScheduler } = await import("@/server/services/recurring-expense-service");
    startRecurringExpenseScheduler();
  } catch (error) {
    console.error(JSON.stringify({ event: "recurring_expense.scheduler_start_failed", message: error instanceof Error ? error.message : String(error) }));
  }
}
