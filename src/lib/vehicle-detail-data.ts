import type { VehicleStatus } from "@/types/vehicle";

export type VehicleDetailTab =
  | "overview"
  | "documents"
  | "calendar"
  | "income"
  | "expenses"
  | "maintenance"
  | "activity";

export type VehicleStatusEvent = {
  id: string;
  from: VehicleStatus;
  to: VehicleStatus;
  reason: string;
  notes?: string;
  effectiveAt: string;
  actor: string;
};

export const vehicleStatusHistory: Record<string, VehicleStatusEvent[]> = {
  v1: [
    {
      id: "status-v1-1",
      from: "Booked",
      to: "Available",
      reason: "Rental returned",
      notes: "Return inspection completed with no exceptions.",
      effectiveAt: "2026-09-26T11:42",
      actor: "Ali Raza",
    },
  ],
  v2: [
    {
      id: "status-v2-1",
      from: "Available",
      to: "Booked",
      reason: "Confirmed booking",
      notes: "Assigned to BKG-1051.",
      effectiveAt: "2026-09-25T14:10",
      actor: "Sara Malik",
    },
  ],
};

export const vehicleOperationalData = {
  v1: {
    odometer: "38,420 km",
    utilization: "78%",
    monthRevenue: 187000,
    monthExpenses: 21500,
    nextBooking: "28 Sep, 10:00 AM",
    documents: [
      {
        name: "Registration",
        status: "Valid",
        detail: "Expires 14 Mar 2027",
        number: "REG-LHR-2022-1842",
        expires: "14 Mar 2027",
        verified: "18 Sep 2026",
      },
      {
        name: "Insurance",
        status: "Valid",
        detail: "Expires 02 Jan 2027",
        number: "EFU-MTR-884219",
        expires: "02 Jan 2027",
        verified: "20 Sep 2026",
      },
      {
        name: "Token tax",
        status: "Valid",
        detail: "Paid through 30 Jun 2027",
        number: "TOKEN-26-5841",
        expires: "30 Jun 2027",
        verified: "02 Jul 2026",
      },
    ],
  },
  v2: {
    odometer: "51,806 km",
    utilization: "84%",
    monthRevenue: 224500,
    monthExpenses: 28700,
    nextBooking: "In progress · returns 29 Sep",
    documents: [
      {
        name: "Registration",
        status: "Valid",
        detail: "Expires 22 May 2027",
        number: "REG-ISB-2021-6720",
        expires: "22 May 2027",
        verified: "11 Sep 2026",
      },
      {
        name: "Insurance",
        status: "Expiring soon",
        detail: "Expires in 34 days",
        number: "TPL-MTR-119420",
        expires: "30 Oct 2026",
        verified: "15 Aug 2026",
      },
      {
        name: "Token tax",
        status: "Needs review",
        detail: "Verification pending",
        number: "TOKEN-26-7430",
        expires: "30 Jun 2027",
        verified: "Not verified",
      },
    ],
  },
} as const;

export const defaultVehicleOperations = {
  odometer: "42,180 km",
  utilization: "71%",
  monthRevenue: 164000,
  monthExpenses: 19600,
  nextBooking: "No upcoming booking",
  documents: [
    {
      name: "Registration",
      status: "Valid",
      detail: "Expires 18 Apr 2027",
      number: "REG-PK-2023-4518",
      expires: "18 Apr 2027",
      verified: "12 Sep 2026",
    },
    {
      name: "Insurance",
      status: "Valid",
      detail: "Expires 09 Feb 2027",
      number: "INS-MTR-721409",
      expires: "09 Feb 2027",
      verified: "12 Sep 2026",
    },
  ],
};

export const vehicleBookings = [
  {
    id: "BKG-1048",
    customer: "Areeba Khan",
    dates: "28 Sep – 01 Oct 2026",
    amount: 34000,
    status: "Confirmed",
  },
  {
    id: "BKG-1029",
    customer: "Zain Ahmed",
    dates: "12 – 15 Sep 2026",
    amount: 28500,
    status: "Completed",
  },
  {
    id: "BKG-0994",
    customer: "Maham Ali",
    dates: "27 – 30 Aug 2026",
    amount: 27200,
    status: "Completed",
  },
];

export const vehicleExpenses = [
  {
    id: "EXP-384",
    date: "20 Sep 2026",
    category: "Cleaning",
    description: "Interior detailing",
    amount: 3500,
  },
  {
    id: "EXP-351",
    date: "05 Sep 2026",
    category: "Maintenance",
    description: "Oil and filter change",
    amount: 12800,
  },
  {
    id: "EXP-318",
    date: "18 Aug 2026",
    category: "Insurance",
    description: "Quarterly allocation",
    amount: 5200,
  },
];

export const vehicleMaintenance = [
  {
    title: "Oil and filter service",
    date: "05 Sep 2026",
    detail: "Completed at 37,950 km · Pak Motors",
    status: "Completed",
  },
  {
    title: "Tyre rotation",
    date: "Due at 45,000 km",
    detail: "6,580 km remaining",
    status: "Upcoming",
  },
];

export const vehicleActivity = [
  {
    title: "Vehicle marked available",
    detail: "Rental return completed by Ali",
    time: "Today, 11:42 AM",
  },
  {
    title: "Booking BKG-1029 completed",
    detail: "Final balance PKR 0",
    time: "15 Sep, 4:18 PM",
  },
  {
    title: "Service record added",
    detail: "Oil and filter change · PKR 12,800",
    time: "05 Sep, 1:05 PM",
  },
];
