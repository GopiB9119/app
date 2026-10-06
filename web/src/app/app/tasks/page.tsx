import { TaskScreen } from "@/features/planning/task-screen";

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ space_id?: string | string[]; task_id?: string | string[] }> }) {
  const { space_id, task_id } = await searchParams;
  const taskId = typeof task_id === "string" && /^[0-9a-f-]{36}$/.test(task_id) ? task_id : "";
  return <TaskScreen initialSpaceId={typeof space_id === "string" ? space_id : ""} initialTaskId={taskId} />;
}