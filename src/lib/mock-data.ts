export type VehicleStatus = "Available" | "Booked" | "Maintenance" | "Out of Service";
export type Ownership = "Own" | "Managed";
export type Vehicle = {
  id: string;
  plate: string;
  make: string;
  model: string;
  year: number;
  category: "Economy" | "Sedan" | "SUV";
  city: "Lahore" | "Islamabad" | "Rawalpindi" | "Karachi";
  ownership: Ownership;
  status: VehicleStatus;
  dailyRate: number;
  color: string;
  transmission: "Automatic" | "Manual";
  fuel: "Petrol" | "Hybrid" | "Diesel";
  owner?: string;
};

export const vehicles: Vehicle[] = [
  { id: "v1", plate: "LEB-218", make: "Honda", model: "City Aspire", year: 2023, category: "Sedan", city: "Lahore", ownership: "Own", status: "Available", dailyRate: 8500, color: "Pearl White", transmission: "Automatic", fuel: "Petrol" },
  { id: "v2", plate: "ICT-704", make: "Toyota", model: "Corolla Altis", year: 2022, category: "Sedan", city: "Islamabad", ownership: "Managed", status: "Booked", dailyRate: 9500, color: "Silver", transmission: "Automatic", fuel: "Petrol", owner: "Farhan Qureshi" },
  { id: "v3", plate: "LHR-529", make: "KIA", model: "Sportage AWD", year: 2024, category: "SUV", city: "Lahore", ownership: "Managed", status: "Booked", dailyRate: 18000, color: "Black", transmission: "Automatic", fuel: "Petrol", owner: "Hassan Motors" },
  { id: "v4", plate: "RIK-113", make: "Suzuki", model: "Alto VXL", year: 2023, category: "Economy", city: "Rawalpindi", ownership: "Own", status: "Available", dailyRate: 5200, color: "Graphite Grey", transmission: "Automatic", fuel: "Petrol" },
  { id: "v5", plate: "BKC-882", make: "Toyota", model: "Yaris ATIV", year: 2022, category: "Sedan", city: "Karachi", ownership: "Own", status: "Maintenance", dailyRate: 8000, color: "Super White", transmission: "Automatic", fuel: "Petrol" },
  { id: "v6", plate: "ICT-419", make: "Honda", model: "BR-V", year: 2021, category: "SUV", city: "Islamabad", ownership: "Managed", status: "Available", dailyRate: 12500, color: "Lunar Silver", transmission: "Automatic", fuel: "Petrol", owner: "Sana Malik" },
  { id: "v7", plate: "LEF-910", make: "Suzuki", model: "Cultus VXL", year: 2022, category: "Economy", city: "Lahore", ownership: "Own", status: "Out of Service", dailyRate: 6000, color: "Cerulean Blue", transmission: "Manual", fuel: "Petrol" },
  { id: "v8", plate: "AER-315", make: "Toyota", model: "Fortuner Sigma", year: 2023, category: "SUV", city: "Islamabad", ownership: "Managed", status: "Available", dailyRate: 30000, color: "Attitude Black", transmission: "Automatic", fuel: "Diesel", owner: "Usman Raza" },
];

export const todaySchedule = [
  { time: "09:30", type: "Pickup", customer: "Areeba Khan", vehicle: "Honda City · LEB-218", city: "Lahore" },
  { time: "12:00", type: "Return", customer: "Daniyal Shah", vehicle: "KIA Sportage · LHR-529", city: "Lahore" },
  { time: "15:30", type: "Pickup", customer: "Hamza Siddiqui", vehicle: "Toyota Corolla · ICT-704", city: "Islamabad" },
  { time: "18:00", type: "Return", customer: "Maham Ali", vehicle: "Suzuki Alto · RIK-113", city: "Rawalpindi" },
];
