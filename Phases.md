**Vibe Rent System** — Phase-by-Phase Implementation Plan  
*(Car rental management system for local agents — own cars + managed cars from owners)*

I researched modern rent-a-car platforms (Hermes.rent, RentSys, HQ Rental, Rentlica, CarCEO PRO, FleetPilot, etc.). Core patterns that matter for local agents:

- Real-time fleet availability + calendar
- Per-vehicle daily rates that vary by city / season / duration
- Digital rental agreements with e-signature
- Check-out / check-in with condition notes + photos
- Full expense tracking (maintenance, fuel, insurance, repairs)
- True **P&L per vehicle** (revenue – direct costs – allocated overhead)
- Simple bookkeeping + owner payouts (when cars are managed)
- Mobile-friendly for agents on the counter or road

**Branding note (vibeexe.com):**  
Clean white background, dark text (`#19191F`), primary blue ≈ `#006FE6` / `#0070E6`. Use this exact palette for consistency (buttons, accents, links, charts).

---

### Recommended Tech Stack (AI-friendly & fast to build)
| Layer              | Choice                          | Why |
|--------------------|---------------------------------|-----|
| Frontend           | Next.js 15 + TypeScript + Tailwind + shadcn/ui | Modern, fast, AI generates clean components |
| Backend / API      | Next.js API Routes or separate NestJS / Hono | Simple start, can scale |
| Database           | PostgreSQL + Prisma             | Strong relations, easy migrations |
| Auth               | NextAuth / Clerk                | Roles: Super Admin, Agency Owner, Agent, Owner (car owner) |
| File Storage       | Cloudflare R2 / AWS S3          | Contracts, photos, documents |
| E-Signature        | DocuSign / SignRequest / self-built with react-pdf + canvas | Contracts |
| Calendar           | FullCalendar or custom with date-fns | Booking timeline |
| Payments (later)   | Stripe / local payment gateway  | Deposits & settlements |
| Hosting            | Vercel + Supabase / Neon        | Zero DevOps pain |

---

### Phase 0 – Foundation & Setup (Week 1)
**Goal:** Project ready for AI to start coding.

1. Create monorepo / Next.js project with TypeScript + Tailwind + shadcn/ui.
2. Set up Prisma + PostgreSQL (Neon or Supabase).
3. Design core database schema (first version).
4. Implement authentication + basic roles.
5. Create design system (colors from vibeexe.com, typography, components).
6. Basic dashboard shell + navigation.

**Key models to define early:**
- User, Agency, Branch/City
- Vehicle (make, model, plate, year, ownership type: own/managed, current status)
- VehicleOwner (for managed cars)
- RateCard (vehicle + city + daily rate + min days etc.)
- Customer
- Booking / Rental
- RentalContract
- Expense
- Payment / Transaction

---

### Phase 1 – Core Fleet & Availability (Weeks 2–3)
**Must-have for daily operations.**

- Vehicle CRUD (add/edit cars, photos, documents: registration, insurance, fitness)
- Ownership type: Own vs Managed (link to owner + revenue share %)
- Status: Available / Booked / Maintenance / Out of Service
- Multi-city support (prices differ by city)
- Simple rate management (per vehicle or per category + city)
- Real-time availability calendar (day/week/month view)
- Search: “Honda City available in Lahore from 5–10 Oct”

**Deliverable:** Agents can see which cars are free and create a booking skeleton.

---

### Phase 2 – Booking & Rental Workflow (Weeks 4–5)
**Heart of the system.**

- Create booking → select vehicle → dates/times → customer → calculate price
- Support walk-in + advance reservations
- Deposit handling
- Check-out flow:
  - Current mileage, fuel level
  - Condition photos + notes
  - Generate rental agreement (PDF)
- Check-in / Return flow:
  - New mileage, fuel, damage notes + photos
  - Extra charges (late, fuel, damage)
  - Close rental → final invoice
- Booking calendar with drag-and-drop reassignment (nice-to-have later)

---

### Phase 3 – Digital Contracts & Documents (Week 6)
- Template-based rental agreement (customizable per agency)
- Auto-fill customer + vehicle + dates + rates + terms
- E-signature (customer + agent) on mobile or desktop
- Store signed PDF + audit trail
- Document vault per vehicle and per customer (license, CNIC, etc.)
- Expiry alerts (insurance, registration, license)

---

### Phase 4 – Financial Core (Weeks 7–8)
**This is what makes local agents stick.**

- Expense management:
  - Categories: Maintenance, Fuel, Insurance, Cleaning, Tolls, Fines, Other
  - Link expense to vehicle (and optionally to specific rental)
  - Receipt upload
- Income tracking (from closed rentals)
- Per-vehicle P&L:
  - Revenue
  - Direct expenses
  - Depreciation (simple monthly)
  - Net profit / ROI
- Owner statements (for managed cars) + payout tracking
- Basic bookkeeping reports:
  - Daily/weekly/monthly cash summary
  - Outstanding balances
  - Expense by category

---

### Phase 5 – Customers, Agents & Operations (Week 9)
- Customer CRM (history, blacklisting, preferred vehicles)
- Agent performance (bookings closed, revenue, upsells)
- Daily operations board (today’s pickups & returns)
- Notifications (WhatsApp / SMS / Email) for reminders
- Multi-user with role-based permissions

---

### Phase 6 – Analytics & Insights (Week 10)
- Dashboard:
  - Fleet utilization %
  - Revenue this month vs last
  - Top/bottom performing cars
  - Upcoming maintenance / document expiries
- Advanced filters: P&L by time period, city, vehicle category
- Export to Excel / PDF

---

### Phase 7 – Polish, Mobile & Launch Prep (Weeks 11–12)
- Responsive design (agents use phones heavily)
- Offline-friendly check-in/out (PWA later)
- Audit logs
- Backup & security
- Onboarding flow for new agencies
- Documentation + training videos
- Soft launch with 1–2 pilot agents

---

### Suggested Development Order for AI Coding Sessions

**Session 1–2:** Project setup + Auth + Vehicle + City + Rate models + basic UI  
**Session 3–4:** Availability calendar + Booking creation  
**Session 5:** Check-out / Check-in + PDF contract generation  
**Session 6:** E-signature integration  
**Session 7–8:** Expenses + Per-vehicle P&L  
**Session 9:** Owner management + payouts  
**Session 10:** Dashboard + reports  
**Session 11+:** Polish, notifications, multi-tenant (if needed)

---

### Extra Features to Add Later (Post-MVP)
- Online booking widget for agent websites
- GPS / telematics integration
- Dynamic pricing rules
- Maintenance scheduling with reminders
- Inventory of spare parts
- Multi-currency / tax (GST/VAT)
- WhatsApp bot for status checks
- Investor / owner portal

---

**Next Step Recommendation**  
Tell the AI:

> “Start Phase 0 and Phase 1 of the Vibe Rent System.  
> Use Next.js 15 + TypeScript + Tailwind + shadcn/ui + Prisma + PostgreSQL.  
> Brand colors: primary blue #006FE6, dark text #19191F, clean white background.  
> Create the full database schema first, then authentication with roles, then Vehicle management + multi-city rates + basic availability calendar.”

Would you like me to also prepare:
1. Detailed database schema (Prisma models), or  
2. Exact feature checklist for MVP, or  
3. User stories for the first AI coding session?

Just say the word and I’ll expand the next piece.