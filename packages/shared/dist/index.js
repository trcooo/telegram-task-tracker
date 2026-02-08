import { z } from "zod";
export const TaskPriority = z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]);
export const TaskKind = z.union([
    z.literal("task"),
    z.literal("meeting"),
    z.literal("study"),
    z.literal("other"),
]);
export const MatrixQuadrant = z.union([
    z.literal("Q1"), // urgent & important
    z.literal("Q2"), // not urgent & important
    z.literal("Q3"), // urgent & not important
    z.literal("Q4"), // not urgent & not important
    z.literal("INBOX"),
]);
export const Reminder = z.object({
    id: z.string().optional(),
    at: z.string(), // ISO
    method: z.union([z.literal("bot"), z.literal("inapp")]).default("bot"),
    status: z.union([z.literal("scheduled"), z.literal("snoozed"), z.literal("sent")]).default("scheduled"),
});
export const Subtask = z.object({
    id: z.string().optional(),
    title: z.string(),
    done: z.boolean().default(false),
});
export const Task = z.object({
    id: z.string(),
    title: z.string(),
    note: z.string().optional().nullable(),
    priority: TaskPriority.default(0),
    kind: TaskKind.default("task"),
    date: z.string().optional().nullable(), // YYYY-MM-DD
    time: z.string().optional().nullable(), // HH:mm
    allDay: z.boolean().default(false),
    startAt: z.string().optional().nullable(), // ISO
    endAt: z.string().optional().nullable(), // ISO
    listId: z.string().optional().nullable(),
    tags: z.array(z.string()).default([]),
    subtasks: z.array(Subtask).default([]),
    reminders: z.array(Reminder).default([]),
    matrixQuadrant: MatrixQuadrant.default("INBOX"),
    focusFlag: z.boolean().default(false),
    done: z.boolean().default(false),
    createdAt: z.string(),
    updatedAt: z.string(),
});
export const List = z.object({
    id: z.string(),
    title: z.string(),
    color: z.string().optional().nullable(),
    folder: z.string().optional().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
});
