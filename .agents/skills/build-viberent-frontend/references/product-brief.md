# VibeRent frontend product brief

## Users and context

The primary user is a local car-rental agency owner or counter/field agent. They need fast operational visibility on desktop and phone. Secondary users include staff and vehicle owners whose cars are managed by the agency.

## Core navigation

Dashboard, Vehicles, Bookings, Customers, Expenses, Reports, Owners, and Settings.

## Core entities and language

- Vehicle: owned or managed, assigned to a city, daily rate, photos/documents, and status.
- Booking/rental: customer, vehicle, dates/times, price, deposit, and lifecycle status.
- Customer: identity/contact details, rental history, and blacklist state.
- Owner: owner of a managed vehicle, revenue share, statements, and payouts.
- Expense: category, vehicle, optional rental, amount, description, receipt, and date.

Vehicle statuses: Available, Booked, Maintenance, Out of Service.

Booking statuses: Confirmed, Checked Out, Completed, Cancelled.

## Priority screens

1. App shell and dashboard with fleet, active bookings, today's revenue, utilization, pickups/returns, quick actions, and recent activity.
2. Vehicles list with search, status/city/ownership filters, row actions, and add/edit flow.
3. Booking list and a vehicle-by-date availability calendar.
4. New Booking steps: dates and city, vehicle, customer, price/deposit summary, confirmation.
5. Customers, Expenses, Owners, Reports, and Settings using the shared CRUD language.

## Market defaults

Use Pakistani examples by default: Lahore, Islamabad, Rawalpindi, and Karachi; PKR currency; plausible names, phone formats, CNIC formats, and registration plates. Do not expose sensitive real-person data—fixtures must be fictional.

## Reuse policy

Build common list, form, status, feedback, and action patterns once. Vehicles is the gold-standard CRUD module. Later modules should reuse its interaction language while retaining their own domain rules.

## Deferred scope

Backend persistence, production auth, e-signature, contract PDF generation, payments, notifications, live uploads, drag-and-drop calendar edits, and owner portals are later phases unless the user explicitly requests them.

