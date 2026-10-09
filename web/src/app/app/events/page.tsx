import { EventsScreen } from "@/features/events/events-screen";

export default async function EventsPage({ searchParams }: { searchParams: Promise<{ space_id?: string | string[]; event_id?: string | string[] }> }) {
  const { space_id, event_id } = await searchParams;
  const spaceId = typeof space_id === "string" && /^[0-9a-f-]{36}$/.test(space_id) ? space_id : "";
  const eventId = typeof event_id === "string" && /^[0-9a-f-]{36}$/.test(event_id) ? event_id : "";
  return <EventsScreen initialSpaceId={spaceId} initialEventId={eventId} />;
}
