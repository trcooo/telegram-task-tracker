import { z } from "zod";
export declare const TaskPriority: any;
export type TaskPriority = z.infer<typeof TaskPriority>;
export declare const TaskKind: any;
export type TaskKind = z.infer<typeof TaskKind>;
export declare const MatrixQuadrant: any;
export type MatrixQuadrant = z.infer<typeof MatrixQuadrant>;
export declare const Reminder: any;
export declare const Subtask: any;
export declare const Task: any;
export declare const List: any;
export type Task = z.infer<typeof Task>;
export type List = z.infer<typeof List>;
export type Reminder = z.infer<typeof Reminder>;
export type Subtask = z.infer<typeof Subtask>;
export type AuthResponse = {
    token: string;
    user: {
        id: string;
        telegramId: string | null;
        name: string | null;
    };
};
export type Stats = {
    todayCount: number;
    overdueCount: number;
    completedWeek: number;
    focusMinutesWeek: number;
};
export type ParsedInput = {
    title: string;
    note?: string;
    date?: string;
    time?: string;
    allDay?: boolean;
    startAt?: string;
    endAt?: string;
    priority?: TaskPriority;
    kind?: TaskKind;
    tags?: string[];
    listHint?: string;
    focusFlag?: boolean;
};
