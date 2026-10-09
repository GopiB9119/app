import { AgentTaskInboxScreen } from "@/features/agents/agent-screen";

export default async function AgentTasksPage({ searchParams }: { searchParams: Promise<{ space_id?: string | string[] }> }) {
  const { space_id } = await searchParams;
  const spaceId = typeof space_id === "string" && /^[0-9a-f-]{36}$/i.test(space_id) ? space_id.toLowerCase() : "";
  return <AgentTaskInboxScreen initialSpaceId={spaceId} />;
}