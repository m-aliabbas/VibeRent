import "server-only";

import { sqlite } from "@/db/connection";

type CommandResult = { handled: boolean; reply?: string };

export function runOwnerCommand(agencyId: string, rawText: string | undefined): CommandResult {
  const text = rawText?.trim();
  if (!text?.startsWith("/")) return { handled: false };
  const [command, ...args] = text.slice(1).trim().split(/\s+/);
  const name = command.toLowerCase();
  try {
    switch (name) {
      case "help": return { handled: true, reply: help() };
      case "summary": return { handled: true, reply: summary(agencyId) };
      case "today": return { handled: true, reply: today(agencyId) };
      case "income": return { handled: true, reply: income(agencyId, args[0]) };
      case "expense":
      case "expenses": return { handled: true, reply: expenses(agencyId, args[0]) };
      case "cars": return { handled: true, reply: cars(agencyId) };
      case "car": return { handled: true, reply: car(agencyId, args.join(" ")) };
      case "booking": return { handled: true, reply: booking(agencyId, args[0]) };
      case "pickups": return { handled: true, reply: movements(agencyId, "pickup") };
      case "returns": return { handled: true, reply: movements(agencyId, "return") };
      case "owners": return { handled: true, reply: owners(agencyId) };
      default: return { handled: true, reply: `Unknown command: /${name}\n\n${help()}` };
    }
  } catch (error) {
    console.error(JSON.stringify({ event: "whatsapp.owner_command_failed", agencyId, command: name, message: error instanceof Error ? error.message : "unknown" }));
    return { handled: true, reply: "That report could not be prepared. Please try again." };
  }
}

function summary(agencyId: string) {
  const { from, to, day } = period("today");
  const row = sqlite.prepare(`
    SELECT
      (SELECT count(*) FROM bookings WHERE agency_id=? AND created_at>=? AND created_at<?) AS bookings,
      (SELECT count(*) FROM bookings WHERE agency_id=? AND status='checked_out') AS active,
      (SELECT coalesce(sum(CASE WHEN kind IN ('refund','reversal') THEN -amount ELSE amount END),0) FROM financial_transactions WHERE agency_id=? AND status='posted' AND posted_at>=? AND posted_at<?) AS income,
      (SELECT coalesce(sum(amount),0) FROM expenses WHERE agency_id=? AND status='approved' AND occurred_on=?) AS expenses
  `).get(agencyId, from, to, agencyId, agencyId, from, to, agencyId, day) as { bookings: number; active: number; income: number; expenses: number };
  return [`VibeRent summary - ${day}`, `Bookings created: ${row.bookings}`, `Active rentals: ${row.active}`, `Income: ${money(row.income)}`, `Expenses: ${money(row.expenses)}`, `Net cash: ${money(row.income - row.expenses)}`].join("\n");
}

function today(agencyId: string) {
  const { from, to, day } = period("today");
  const row = sqlite.prepare(`SELECT
    sum(CASE WHEN pickup_at>=? AND pickup_at<? THEN 1 ELSE 0 END) AS pickups,
    sum(CASE WHEN return_at>=? AND return_at<? THEN 1 ELSE 0 END) AS returns,
    sum(CASE WHEN status='checked_out' THEN 1 ELSE 0 END) AS active
    FROM bookings WHERE agency_id=? AND status IN ('confirmed','checked_out')`).get(from, to, from, to, agencyId) as { pickups: number | null; returns: number | null; active: number | null };
  return [`Today - ${day}`, `Pickups: ${row.pickups ?? 0}`, `Returns: ${row.returns ?? 0}`, `Active rentals: ${row.active ?? 0}`, "Use /pickups or /returns for details."].join("\n");
}

function income(agencyId: string, requested?: string) {
  const range = period(requested === "today" ? "today" : "month");
  const row = sqlite.prepare(`SELECT coalesce(sum(CASE WHEN kind IN ('refund','reversal') THEN -amount ELSE amount END),0) AS total,count(*) AS entries FROM financial_transactions WHERE agency_id=? AND status='posted' AND posted_at>=? AND posted_at<?`).get(agencyId, range.from, range.to) as { total: number; entries: number };
  return `Income - ${range.label}\n${money(row.total)}\n${row.entries} posted transaction${row.entries === 1 ? "" : "s"}`;
}

function expenses(agencyId: string, requested?: string) {
  const range = period(requested === "month" ? "month" : "today");
  const row = sqlite.prepare(`SELECT coalesce(sum(amount),0) AS total,count(*) AS entries FROM expenses WHERE agency_id=? AND status='approved' AND occurred_on>=? AND occurred_on<?`).get(agencyId, range.dayFrom, range.dayTo) as { total: number; entries: number };
  return `Expenses - ${range.label}\n${money(row.total)}\n${row.entries} approved expense${row.entries === 1 ? "" : "s"}`;
}

function cars(agencyId: string) {
  const rows = sqlite.prepare(`SELECT v.plate,v.make,v.model,v.status,b.city FROM vehicles v JOIN branches b ON b.id=v.branch_id AND b.agency_id=v.agency_id WHERE v.agency_id=? AND v.archived_at IS NULL ORDER BY v.status,v.plate LIMIT 25`).all(agencyId) as Array<{ plate: string; make: string; model: string; status: string; city: string }>;
  if (!rows.length) return "No active vehicles were found.";
  return [`Fleet (${rows.length}${rows.length === 25 ? "+" : ""})`, ...rows.map(row => `${row.plate} - ${row.make} ${row.model} - ${label(row.status)} - ${row.city}`)].join("\n");
}

function car(agencyId: string, query: string) {
  if (!query.trim()) return "Usage: /car LEB-123";
  const row = sqlite.prepare(`SELECT v.plate,v.make,v.model,v.year,v.status,v.ownership,v.daily_rate AS dailyRate,b.city FROM vehicles v JOIN branches b ON b.id=v.branch_id AND b.agency_id=v.agency_id WHERE v.agency_id=? AND v.archived_at IS NULL AND (lower(v.plate)=lower(?) OR lower(v.plate) LIKE lower(?)) LIMIT 1`).get(agencyId, query.trim(), `%${query.trim()}%`) as { plate: string; make: string; model: string; year: number; status: string; ownership: string; dailyRate: number; city: string } | undefined;
  if (!row) return `No vehicle matched "${query.trim()}".`;
  return [`${row.make} ${row.model} ${row.year}`, `Plate: ${row.plate}`, `Status: ${label(row.status)}`, `City: ${row.city}`, `Ownership: ${label(row.ownership)}`, `Daily rate: ${money(row.dailyRate)}`].join("\n");
}

function booking(agencyId: string, reference?: string) {
  if (!reference) return "Usage: /booking 12";
  const numeric = /^\d+$/.test(reference) ? Number(reference) : -1;
  const row = sqlite.prepare(`SELECT b.public_number AS publicNumber,b.id,b.status,b.pickup_at AS pickupAt,b.return_at AS returnAt,b.destination_city AS destination,c.name AS customer,v.plate,v.make,v.model,b.total_amount AS totalAmount FROM bookings b JOIN customers c ON c.id=b.customer_id AND c.agency_id=b.agency_id JOIN vehicles v ON v.id=b.vehicle_id AND v.agency_id=b.agency_id WHERE b.agency_id=? AND (b.public_number=? OR upper(b.id)=upper(?)) LIMIT 1`).get(agencyId, numeric, reference) as { publicNumber: number | null; id: string; status: string; pickupAt: string; returnAt: string; destination: string; customer: string; plate: string; make: string; model: string; totalAmount: number } | undefined;
  if (!row) return `Booking ${reference} was not found.`;
  return [`Booking #${row.publicNumber ?? row.id}`, `Status: ${label(row.status)}`, `Customer: ${row.customer}`, `Vehicle: ${row.make} ${row.model} - ${row.plate}`, `Pickup: ${dateTime(row.pickupAt)}`, `Return: ${dateTime(row.returnAt)}`, `Destination: ${row.destination}`, `Total: ${money(row.totalAmount)}`].join("\n");
}

function movements(agencyId: string, kind: "pickup" | "return") {
  const range = period("today");
  const column = kind === "pickup" ? "b.pickup_at" : "b.return_at";
  const rows = sqlite.prepare(`SELECT b.public_number AS publicNumber,${column} AS scheduledAt,c.name AS customer,v.plate,v.make,v.model FROM bookings b JOIN customers c ON c.id=b.customer_id AND c.agency_id=b.agency_id JOIN vehicles v ON v.id=b.vehicle_id AND v.agency_id=b.agency_id WHERE b.agency_id=? AND b.status IN ('confirmed','checked_out') AND ${column}>=? AND ${column}<? ORDER BY ${column} LIMIT 20`).all(agencyId, range.from, range.to) as Array<{ publicNumber: number | null; scheduledAt: string; customer: string; plate: string; make: string; model: string }>;
  const heading = kind === "pickup" ? "Today's pickups" : "Today's returns";
  if (!rows.length) return `${heading}\nNone scheduled.`;
  return [heading, ...rows.map(row => `${time(row.scheduledAt)} - #${row.publicNumber ?? "-"} - ${row.plate} - ${row.customer}`)].join("\n");
}

function owners(agencyId: string) {
  const rows = sqlite.prepare(`SELECT o.id,o.name,o.status,count(DISTINCT v.id) AS vehicles,
    coalesce(sum(CASE WHEN b.status='completed' THEN CASE WHEN a.share_basis='percentage' THEN round(b.total_amount*coalesce(a.owner_share_percent,0)/100.0) ELSE coalesce(a.owner_share_amount,0) END ELSE 0 END),0)
    - coalesce((SELECT sum(e.amount) FROM expenses e WHERE e.agency_id=o.agency_id AND e.owner_id=o.id AND e.status='approved'),0)
    - coalesce((SELECT sum(p.amount) FROM owner_payouts p WHERE p.agency_id=o.agency_id AND p.owner_id=o.id AND p.status='posted'),0) AS payable
    FROM owners o LEFT JOIN vehicles v ON v.agency_id=o.agency_id AND v.owner_id=o.id AND v.archived_at IS NULL LEFT JOIN management_agreements a ON a.id=v.agreement_id AND a.agency_id=v.agency_id LEFT JOIN bookings b ON b.agency_id=v.agency_id AND b.vehicle_id=v.id WHERE o.agency_id=? GROUP BY o.id ORDER BY o.name LIMIT 20`).all(agencyId) as Array<{ id: string; name: string; status: string; vehicles: number; payable: number }>;
  if (!rows.length) return "No vehicle owners were found.";
  return ["Vehicle owners", ...rows.map(row => `${row.name} - ${row.vehicles} vehicle${row.vehicles === 1 ? "" : "s"} - Payable ${money(Math.max(0, Math.round(row.payable)))}`)].join("\n");
}

function help() {
  return ["VibeRent owner commands", "/summary - today's overview", "/today - pickups, returns, active rentals", "/income today|month", "/expense today|month", "/cars - fleet status", "/car LEB-123 - vehicle details", "/booking 12 - booking details", "/pickups - today's pickup list", "/returns - today's return list", "/owners - owner payable summary", "/help - this guide"].join("\n");
}

function period(kind: "today" | "month") {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  const day = `${values.year}-${values.month}-${values.day}`;
  const startDay = kind === "today" ? day : `${values.year}-${values.month}-01`;
  const fromDate = new Date(`${startDay}T00:00:00+05:00`);
  const toDate = new Date(fromDate);
  if (kind === "today") toDate.setUTCDate(toDate.getUTCDate() + 1);
  else { toDate.setUTCMonth(toDate.getUTCMonth() + 1); }
  return { from: fromDate.toISOString(), to: toDate.toISOString(), day, dayFrom: startDay, dayTo: toDate.toISOString().slice(0, 10), label: kind === "today" ? day : `${values.year}-${values.month}` };
}

function money(value: number) { return `PKR ${Math.round(value).toLocaleString("en-PK")}`; }
function label(value: string) { return value.replaceAll("_", " ").replace(/\b\w/g, letter => letter.toUpperCase()); }
function dateTime(value: string) { return new Intl.DateTimeFormat("en-PK", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Karachi" }).format(new Date(value)); }
function time(value: string) { return new Intl.DateTimeFormat("en-PK", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Karachi" }).format(new Date(value)); }
