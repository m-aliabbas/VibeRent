import { PageSkeleton } from "@/components/shared/page-skeleton";

export default function Loading() {
  return <PageSkeleton label="Loading booking form" tiles={0} rows={5} />;
}
