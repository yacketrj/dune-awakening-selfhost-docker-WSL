import { api, post } from "./client";
import type { Task } from "./setup";

export const serverApi = {
  status: () => api<{ stdout: string }>("/api/server/status"),
  readiness: () => api<{ stdout: string; stderr?: string; exitCode?: number }>("/api/server/readiness"),
  ports: () => api<{ stdout: string }>("/api/server/ports"),
  services: () => api<{ stdout: string }>("/api/server/services"),
  doctor: () => api<{ stdout: string; stderr?: string; exitCode?: number }>("/api/server/doctor"),
  start: () => post<{ task: Task }>("/api/server/start"),
  stop: () => post<{ task: Task }>("/api/server/stop"),
  restart: () => post<{ task: Task }>("/api/server/restart"),
  restartService: (service: string) => post<{ task: Task }>("/api/server/restart-service", { service }),
  restartSchedule: () => api<{ stdout: string; stderr?: string; exitCode?: number }>("/api/server/restart-schedule"),
  saveRestartSchedule: (body: { enabled: boolean; hours: number; confirmation: string }) => post<{ task: Task }>("/api/server/restart-schedule", body)
};
