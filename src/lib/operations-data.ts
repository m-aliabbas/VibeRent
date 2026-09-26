export type Booking = {
  id: string;
  customer: string;
  vehicle: string;
  city: string;
  dates: string;
  amount: number;
  status: string;
};
export type Customer = {
  id: string;
  name: string;
  phone: string;
  cnic: string;
  bookings: number;
  lastRental: string;
  status: string;
};
export type Expense = {
  id: string;
  date: string;
  vehicle: string;
  category: string;
  amount: number;
  description: string;
  receipt: boolean;
};
export type Owner = {
  id: string;
  name: string;
  phone: string;
  vehicles: number;
  share: string;
  payable: number;
  status: string;
};

export const bookings: Booking[] = [
  {
    id: "BKG-1051",
    customer: "Hamza Siddiqui",
    vehicle: "Toyota Corolla · ICT-704",
    city: "Islamabad",
    dates: "26–29 Sep 2026",
    amount: 28500,
    status: "Checked Out",
  },
  {
    id: "BKG-1048",
    customer: "Areeba Khan",
    vehicle: "Honda City · LEB-218",
    city: "Lahore",
    dates: "28 Sep–01 Oct 2026",
    amount: 34000,
    status: "Confirmed",
  },
  {
    id: "BKG-1042",
    customer: "Daniyal Shah",
    vehicle: "KIA Sportage · LHR-529",
    city: "Lahore",
    dates: "23–26 Sep 2026",
    amount: 54000,
    status: "Completed",
  },
  {
    id: "BKG-1036",
    customer: "Maham Ali",
    vehicle: "Suzuki Alto · RIK-113",
    city: "Rawalpindi",
    dates: "20–22 Sep 2026",
    amount: 14200,
    status: "Completed",
  },
  {
    id: "BKG-1031",
    customer: "Zain Ahmed",
    vehicle: "Toyota Yaris · BKC-882",
    city: "Karachi",
    dates: "18–20 Sep 2026",
    amount: 18500,
    status: "Cancelled",
  },
];
export const customers: Customer[] = [
  {
    id: "CUS-218",
    name: "Areeba Khan",
    phone: "+92 300 842 1190",
    cnic: "35202-•••••••-4",
    bookings: 8,
    lastRental: "15 Sep 2026",
    status: "Active",
  },
  {
    id: "CUS-194",
    name: "Hamza Siddiqui",
    phone: "+92 321 590 2741",
    cnic: "61101-•••••••-8",
    bookings: 5,
    lastRental: "Current rental",
    status: "Active",
  },
  {
    id: "CUS-176",
    name: "Maham Ali",
    phone: "+92 333 771 4028",
    cnic: "37405-•••••••-2",
    bookings: 11,
    lastRental: "22 Sep 2026",
    status: "Preferred",
  },
  {
    id: "CUS-143",
    name: "Zain Ahmed",
    phone: "+92 305 118 6302",
    cnic: "42101-•••••••-6",
    bookings: 3,
    lastRental: "30 Aug 2026",
    status: "Review",
  },
];
export const expenses: Expense[] = [
  {
    id: "EXP-391",
    date: "25 Sep 2026",
    vehicle: "ICT-704",
    category: "Fuel",
    amount: 8400,
    description: "Pre-delivery fuel top-up",
    receipt: true,
  },
  {
    id: "EXP-384",
    date: "20 Sep 2026",
    vehicle: "LEB-218",
    category: "Cleaning",
    amount: 3500,
    description: "Interior detailing",
    receipt: true,
  },
  {
    id: "EXP-372",
    date: "14 Sep 2026",
    vehicle: "BKC-882",
    category: "Maintenance",
    amount: 28600,
    description: "Brake pads and labour",
    receipt: true,
  },
  {
    id: "EXP-359",
    date: "08 Sep 2026",
    vehicle: "LHR-529",
    category: "Insurance",
    amount: 12400,
    description: "Monthly policy allocation",
    receipt: false,
  },
];
export const owners: Owner[] = [
  {
    id: "OWN-018",
    name: "Farhan Qureshi",
    phone: "+92 300 882 1940",
    vehicles: 2,
    share: "70% owner",
    payable: 148500,
    status: "Active",
  },
  {
    id: "OWN-014",
    name: "Hassan Motors",
    phone: "+92 321 770 5512",
    vehicles: 3,
    share: "Fixed PKR 95k",
    payable: 95000,
    status: "Active",
  },
  {
    id: "OWN-009",
    name: "Sana Malik",
    phone: "+92 333 620 1178",
    vehicles: 1,
    share: "65% owner",
    payable: 72400,
    status: "Due",
  },
  {
    id: "OWN-004",
    name: "Usman Raza",
    phone: "+92 305 441 8300",
    vehicles: 1,
    share: "60% owner",
    payable: 0,
    status: "Settled",
  },
];
