export type UserDto = {
  id: string;
  tgId: string;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  photoUrl: string | null;
};

export type TagDto = { id: string; name: string; color: string | null };
export type ProjectDto = { id: string; name: string; color: string | null };

export type TaskQuadrant =
  | "Q1_URGENT_IMPORTANT"
  | "Q2_NOT_URGENT_IMPORTANT"
  | "Q3_URGENT_NOT_IMPORTANT"
  | "Q4_NOT_URGENT_NOT_IMPORTANT"
  | null;

export type TaskDto = {
  id: string;
  title: string;
  description: string | null;
  status: "TODO" | "DONE" | "ARCHIVED";
  priority: number;
  quadrant: TaskQuadrant;
  startAt: string | null;
  dueAt: string | null;
  durationMin: number | null;
  project: ProjectDto | null;
  tags: TagDto[];
  nextReminderAt?: string | null;
};

export type ReminderDto = {
  id: string;
  taskId: string;
  taskTitle: string;
  remindAt: string;
  status: "PENDING" | "SENT" | "CANCELED";
};
