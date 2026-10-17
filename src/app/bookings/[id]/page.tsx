import { notFound } from "next/navigation";
import { BookingDetail } from "@/components/bookings/booking-detail";
import { getWebRequestContext } from "@/server/auth/session";
import { getBooking } from "@/server/services/booking-service";
import { DomainError } from "@/server/domain/errors";
import { listVehicles } from "@/server/services/vehicle-service";

export default async function BookingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context=await getWebRequestContext();
  let booking;
  try {
    booking = await getBooking(context, id);
  } catch (error) {
    if (error instanceof DomainError && error.code === "NOT_FOUND") notFound();
    throw error;
  }
  return <BookingDetail initial={booking} vehicles={await listVehicles(context)} />;
}
