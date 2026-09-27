import { notFound } from "next/navigation";
import { BookingDetail } from "@/components/bookings/booking-detail";
import { bookingRecords } from "@/lib/booking-data";
import { getWebRequestContext } from "@/server/auth/session";
import { getBooking } from "@/server/services/booking-service";
import { DomainError } from "@/server/domain/errors";

export function generateStaticParams() {
  return bookingRecords.map(({ id }) => ({ id }));
}

export default async function BookingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let booking;
  try {
    booking = getBooking(await getWebRequestContext(), id);
  } catch (error) {
    if (error instanceof DomainError && error.code === "NOT_FOUND") notFound();
    throw error;
  }
  return <BookingDetail initial={booking} />;
}
