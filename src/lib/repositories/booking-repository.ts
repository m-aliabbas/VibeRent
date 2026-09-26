import { bookingRecords, getVehicleConflicts, type BookingRecord } from "@/lib/booking-data";
import type { RepositoryResult } from "@/lib/repositories/repository";

const wait = (ms = 180) => new Promise((resolve) => setTimeout(resolve, ms));

export interface BookingRepository {
  list(): Promise<RepositoryResult<BookingRecord[]>>;
  get(id: string): Promise<RepositoryResult<BookingRecord>>;
  save(record: BookingRecord): Promise<RepositoryResult<BookingRecord>>;
  remove(id: string): Promise<RepositoryResult<BookingRecord>>;
}

export class InMemoryBookingRepository implements BookingRepository {
  private records = bookingRecords.map((item) => ({ ...item }));

  async list(): Promise<RepositoryResult<BookingRecord[]>> {
    await wait();
    return { ok: true, data: this.records.map((item) => ({ ...item })) };
  }

  async get(id: string): Promise<RepositoryResult<BookingRecord>> {
    await wait();
    const record = this.records.find((item) => item.id === id);
    return record ? { ok: true, data: { ...record } } : { ok: false, error: { code: "not_found", message: "Booking not found." } };
  }

  async save(record: BookingRecord): Promise<RepositoryResult<BookingRecord>> {
    await wait();
    const conflict = getVehicleConflicts(record.vehicleId, record.pickupAt, record.returnAt, record.id)[0];
    if (conflict) return { ok: false, error: { code: "conflict", message: `Availability conflict: ${conflict.reason}` } };
    const index = this.records.findIndex((item) => item.id === record.id);
    if (index >= 0) this.records[index] = { ...record };
    else this.records.unshift({ ...record });
    return { ok: true, data: { ...record } };
  }

  async remove(id: string): Promise<RepositoryResult<BookingRecord>> {
    await wait();
    const index = this.records.findIndex((item) => item.id === id);
    if (index < 0) return { ok: false, error: { code: "not_found", message: "Booking not found." } };
    const [record] = this.records.splice(index, 1);
    return { ok: true, data: record };
  }
}

export const bookingRepository = new InMemoryBookingRepository();
