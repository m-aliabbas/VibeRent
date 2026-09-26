import { notFound } from "next/navigation";
import { BookingDetail } from "@/components/bookings/booking-detail";
import { bookingRecords } from "@/lib/booking-data";

export function generateStaticParams() {
  return bookingRecords.map(({ id }) => ({ id }));
}

export default async function BookingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const booking = bookingRecords.find((item) => item.id === id);
  if (!booking) notFound();
  return <BookingDetail initial={booking} />;
}
