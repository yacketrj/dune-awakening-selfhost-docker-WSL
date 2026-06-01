import { api, post } from "./client";
import type { Task } from "./setup";

export const adminApi = {
  itemSearch: (q: string) => api<{ stdout: string }>(`/api/admin/items/search?q=${encodeURIComponent(q)}`),
  itemList: (category = "") => api<{ stdout: string }>(`/api/admin/items${category ? `?category=${encodeURIComponent(category)}` : ""}`),
  vehicles: (q = "") => api<{ stdout: string }>(`/api/admin/vehicles${q ? `?q=${encodeURIComponent(q)}` : ""}`),
  skillModules: (q = "") => api<{ stdout: string }>(`/api/admin/skill-modules${q ? `?q=${encodeURIComponent(q)}` : ""}`),
  history: () => api<{ stdout: string }>("/api/admin/history"),
  kickAllOnline: (confirmation: string) => post<{ task: Task }>("/api/players/kick-all-online", { confirmation }),
  broadcast: (message: string, durationSec: number) => post<{ supported: boolean; reason?: string; ok?: boolean }>("/api/admin/broadcast", { message, durationSec }),
  shutdownBroadcast: (body: { confirmation: string; delayMinutes: number; shutdownType: string }) => post<{ supported: boolean; reason?: string; ok?: boolean }>("/api/admin/broadcast-shutdown", body),
  whisper: (playerId: string, message: string) => post<{ supported: false; reason: string }>("/api/admin/whisper", { playerId, message })
};
