import { api, post } from "./client";
import type { Task } from "./setup";

export const backupsApi = {
  list: () => api<{ stdout: string; rows?: Record<string, unknown>[] }>("/api/backups"),
  create: () => post<{ task: Task }>("/api/backups/create"),
  restore: (backup: string) => post<{ task: Task }>("/api/backups/restore", { backup }),
  delete: (backup: string) => api<{ task: Task }>(`/api/backups/${encodeURIComponent(backup)}`, { method: "DELETE" }),
  autoStatus: () => api<{ stdout: string; stderr?: string; exitCode?: number; status?: Record<string, unknown> }>("/api/backups/auto"),
  saveAuto: (body: { enabled: boolean; hours: number; retentionDays: number }) => post<{ task: Task }>("/api/backups/auto", body),
  importRemote: (body: { host: string; user: string; path: string; port?: number }) => post<{ supported: boolean; reason: string }>("/api/backups/import-remote", body)
};
