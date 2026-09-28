import { CalendarScreen } from "@/features/planning/calendar-screen";

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ space_id?: string | string[] }> }) {
  const { space_id } = await searchParams;
  return <CalendarScreen initialSpaceId={typeof space_id === "string" ? space_id : ""} />;
}