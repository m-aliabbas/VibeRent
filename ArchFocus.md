**Updated Architecture Focus: Maximum Reusability**

We will build the system so that **every CRUD looks and behaves almost the same**.  
This way the AI (intern) only writes the unique business logic once, and 80% of the code is reused.

### Core Reusability Principles (Strict Rules for AI)

1. **Never write a full CRUD from scratch again** after Vehicles.
2. Everything must use shared components, hooks, and patterns.
3. Prefer **Server Actions + React Hook Form + Zod** for forms.
4. All lists use the same **DataTable**.
5. All detail pages use the same layout structure.
6. Filters, pagination, search, soft-delete, status badges → 100% reusable.

---

### New Folder Structure (Reusability Focused)

```
src/
├── app/
├── components/
│   ├── ui/                          # shadcn only
│   ├── shared/                      # ← HIGHLY REUSABLE
│   │   ├── PageHeader.tsx
│   │   ├── DataTable.tsx            # The king component
│   │   ├── FilterBar.tsx
│   │   ├── StatusBadge.tsx
│   │   ├── ConfirmDialog.tsx
│   │   ├── FormSection.tsx
│   │   ├── EmptyState.tsx
│   │   ├── LoadingState.tsx
│   │   └── ActionMenu.tsx           # Edit / Delete / View
│   ├── forms/                       # Reusable form fields
│   │   ├── FormInput.tsx
│   │   ├── FormSelect.tsx
│   │   ├── FormDatePicker.tsx
│   │   ├── FormTextarea.tsx
│   │   ├── FormFileUpload.tsx
│   │   └── FormCurrency.tsx
│   ├── vehicles/
│   ├── bookings/
│   └── ...
├── hooks/                           # ← VERY IMPORTANT
│   ├── useDataTable.ts
│   ├── useServerAction.ts
│   ├── useConfirm.ts
│   └── useFilters.ts
├── lib/
│   ├── crud/                        # Generic helpers
│   │   ├── createCrudActions.ts     # Factory for server actions
│   │   └── queryBuilder.ts
│   ├── validations/                 # Zod schemas
│   │   ├── vehicle.ts
│   │   ├── customer.ts
│   │   ├── booking.ts
│   │   └── common.ts
│   └── utils.ts
├── types/
│   └── index.ts                     # Shared types
└── db/
```

---

### Reusable Building Blocks We Will Force the AI to Create First

#### 1. Generic DataTable (Most Important Component)

Features it must support:
- Columns definition (with sorting)
- Search
- Filters (status, city, date range, ownership type…)
- Pagination
- Row selection (optional)
- Loading & Empty states
- Row actions (View / Edit / Delete / Custom)
- Soft delete support
- Export to CSV (later)

Usage example (this is the goal):

```tsx
<DataTable
  columns={vehicleColumns}
  data={vehicles}
  searchKey="plateNumber"
  filters={[
    { key: "status", label: "Status", options: statusOptions },
    { key: "ownershipType", label: "Ownership", options: ownershipOptions },
    { key: "cityId", label: "City", options: cities },
  ]}
  onEdit={handleEdit}
  onDelete={handleDelete}
  onView={handleView}
/>
```

#### 2. Reusable Form System

- `FormInput`, `FormSelect`, `FormDatePicker`, `FormCurrency`, `FormFileUpload`
- All integrated with React Hook Form + Zod
- Consistent error display and labels
- Support for `disabled`, `required`, `description`

#### 3. PageHeader Component

```tsx
<PageHeader
  title="Vehicles"
  description="Manage your fleet"
  actions={
    <>
      <Button onClick={openCreate}>Add Vehicle</Button>
    </>
  }
/>
```

#### 4. CRUD Server Actions Factory (Advanced Reusability)

We will create a helper so AI can do this:

```ts
// Example for vehicles
export const vehicleActions = createCrudActions({
  table: vehicles,
  schema: vehicleSchema,
  searchFields: ["plateNumber", "make", "model"],
  softDelete: true,
});
```

This generates:
- `getAll`
- `getById`
- `create`
- `update`
- `softDelete`
- `restore`

#### 5. StatusBadge Component

Central place for all statuses:

```tsx
<StatusBadge status="available" />   // green
<StatusBadge status="booked" />      // blue
<StatusBadge status="maintenance" /> // orange
<StatusBadge status="checked_out" /> // purple
```

---

### Updated Development Phases (Reusability First)

**Phase 0 – Foundation + Shared System (Most Critical)**

AI must complete these before any real feature:

1. Project setup + Drizzle schema + Auth
2. **Build the entire `components/shared/` and `components/forms/`**
3. Build `DataTable` (with sorting, filtering, pagination)
4. Build `PageHeader`, `StatusBadge`, `ConfirmDialog`, `EmptyState`
5. Create `hooks/useDataTable.ts` and `hooks/useConfirm.ts`
6. Create basic Zod schemas and form components
7. Create a simple reusable `createCrudActions` helper (optional but powerful)

Only after this foundation is solid → start Vehicles.

---

**Phase 1 – Vehicles (The Template Module)**

Vehicles will be the **perfect reference implementation**.

After Vehicles is done, every other module (Customers, Owners, Expenses, Rate Cards) should be created by copying the Vehicles pattern and changing only:

- Schema / Zod validation
- Columns definition
- Form fields
- Unique business rules

This is how we achieve maximum reusability.

---

### Exact Instruction Style for AI (Copy-Paste Ready)

When you start coding, give the AI this rule:

```
STRICT REUSABILITY RULES:

1. Never create a new table list from scratch. Always use the shared <DataTable /> component.
2. Never create form inputs manually. Always use components from /components/forms/
3. Every list page must use <PageHeader />
4. Every status must use <StatusBadge />
5. All delete actions must use the shared ConfirmDialog
6. Prefer Server Actions over API routes for mutations
7. Keep business logic out of components — put it in /lib or server actions
8. When creating a new module (Customers, Expenses, etc.), first copy the Vehicles module structure and adapt it.
```

---

### Recommended Order Going Forward

1. **Phase 0** → Shared components + DataTable + Form system + Auth + Schema  
2. **Phase 1** → Vehicles module (make it perfect — this becomes the template)  
3. **Phase 2** → Customers + Vehicle Owners (copy Vehicles pattern)  
4. **Phase 3** → Rate Cards + Cities  
5. **Phase 4** → Bookings (more complex, but still uses shared components)  
6. Then Expenses, P&L, Contracts, WhatsApp…

---

Would you like me to now write:

**A. The complete reusable `DataTable` component code** (so AI has a perfect starting point), or  
**B. The full Vehicles module as the gold-standard template** (page + form + columns + server actions)?

Tell me which one you want first and I’ll give you the deep, ready-to-paste version.