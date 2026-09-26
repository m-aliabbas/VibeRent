**VibeRent UI Design**

I’ve locked the project name as **VibeRent**.

Here’s a complete, practical UI design system + screen layouts that the AI can implement directly. Everything follows the vibeexe.com style:

- Primary: `#006FE6`
- Background: `#FFFFFF` / `#F8FAFC`
- Text: `#19191F`
- Soft borders & shadows
- Rounded corners (12px)
- Clean, spacious, professional

---

### 1. Global Layout

```
┌─────────────────────────────────────────────────────────────┐
│  Sidebar (240px)          │  Main Content Area              │
│                           │                                 │
│  [VibeRent Logo]          │  Top Header (search + profile)  │
│                           │─────────────────────────────────│
│  Dashboard                │                                 │
│  Vehicles                 │                                 │
│  Bookings                 │         Page Content            │
│  Customers                │                                 │
│  Expenses                 │                                 │
│  Reports                  │                                 │
│  Owners                   │                                 │
│  Settings                 │                                 │
│                           │                                 │
│  ─────────────────────    │                                 │
│  User Profile (bottom)    │                                 │
└─────────────────────────────────────────────────────────────┘
```

---

### 2. Dashboard Screen

**Top Stats (4 cards in a row):**
- Total Vehicles
- Active Bookings
- Today’s Revenue
- Fleet Utilization %

**Middle Section (2 columns):**
- Left → Today’s Pickups & Returns (list with time + car + customer)
- Right → Quick Actions (New Booking, Add Vehicle, Add Expense) + Recent Activity

---

### 3. Vehicles List (Most Important Reusable Screen)

```
Page Header
┌─ Vehicles                    [ + Add Vehicle ] ──────────────┐
│                                                              │
│  [Search plate/make...]  [Status ▾] [City ▾] [Ownership ▾]   │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ Plate    Vehicle          City     Ownership  Status │   │
│  │ LEB-123  Honda City 2022  Lahore   Own        Available│  │
│  │ LHR-456  Toyota Corolla   Lahore   Managed    Booked  │  │
│  │ ...                                                   │  │
│  └──────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────┘
```

- Status badges: Available (green), Booked (blue), Maintenance (orange)
- Ownership badges: Own (gray), Managed (purple)
- Row actions: View / Edit / Delete (three-dot menu)

---

### 4. Create / Edit Vehicle Form

Clean two-column form:

**Left Column**
- Plate Number
- Make
- Model
- Year
- Color
- Category (Economy / Sedan / SUV)

**Right Column**
- Ownership Type (Own / Managed)
- Owner (dropdown – only shows if Managed)
- Current City
- Daily Rate
- Transmission & Fuel Type

**Bottom**
- Photo upload (multiple)
- Documents upload (Registration, Insurance, Fitness)
- Notes
- Save / Cancel buttons

---

### 5. Booking Calendar View

- Month / Week / Day toggle
- Color-coded blocks:
  - Blue = Confirmed
  - Purple = Checked Out
  - Green = Completed
- Click empty slot → Create Booking
- Drag to change dates (later)

---

### 6. New Booking Flow (Multi-step)

Step 1 → Select City + Dates  
Step 2 → Choose Available Vehicle (cards with photo + price)  
Step 3 → Customer (search or create new)  
Step 4 → Price Summary + Deposit  
Step 5 → Confirm

---

**Would you like me to now generate actual visual mockups** of these screens (Dashboard + Vehicles List + Booking Form)?

Just say:

- “Yes, generate the visual mockups”  
or  
- “Generate Dashboard and Vehicles List only”

I can also give you the exact Tailwind + shadcn component structure for the AI to implement next.