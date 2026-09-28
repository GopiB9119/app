import { TaskScreen } from "@/features/planning/task-screen";

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ space_id?: string | string[] }> }) {
  const { space_id } = await searchParams;
  return <TaskScreen initialSpaceId={typeof space_id === "string" ? space_id : ""} />;
}