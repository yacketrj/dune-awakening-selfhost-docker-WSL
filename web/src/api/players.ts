import { api, post } from "./client";
import type { Task } from "./setup";

export const playersApi = {
  list: (q = "") => api<{ rows: Record<string, unknown>[]; capabilities: Record<string, unknown> }>(`/api/players${q ? `?q=${encodeURIComponent(q)}` : ""}`),
  online: () => api<{ rows: Record<string, unknown>[]; capabilities: Record<string, unknown> }>("/api/players/online"),
  profile: (playerId: string) => api<Record<string, unknown>>(`/api/players/${encodeURIComponent(playerId)}`),
  inventory: (playerId: string) => api<{ rows: Record<string, unknown>[]; capabilities: Record<string, unknown>; reason?: string }>(`/api/players/${encodeURIComponent(playerId)}/inventory`),
  currency: (playerId: string) => api<{ rows: Record<string, unknown>[]; capabilities: Record<string, unknown>; reason?: string }>(`/api/players/${encodeURIComponent(playerId)}/currency`),
  factions: (playerId: string) => api<{ rows: Record<string, unknown>[]; capabilities: Record<string, unknown>; reason?: string }>(`/api/players/${encodeURIComponent(playerId)}/factions`),
  specs: (playerId: string) => api<{ rows: Record<string, unknown>[]; capabilities: Record<string, unknown>; reason?: string }>(`/api/players/${encodeURIComponent(playerId)}/specs`),
  position: (playerId: string) => api<Record<string, unknown>>(`/api/players/${encodeURIComponent(playerId)}/position`),
  progression: (playerId: string) => api<Record<string, unknown>>(`/api/players/${encodeURIComponent(playerId)}/progression`),
  events: (playerId: string) => api<Record<string, unknown>>(`/api/players/${encodeURIComponent(playerId)}/events`),
  stats: (playerId: string) => api<Record<string, unknown>>(`/api/players/${encodeURIComponent(playerId)}/stats`),
  history: (playerId: string) => api<Record<string, unknown>>(`/api/players/${encodeURIComponent(playerId)}/history`),
  giveItem: (playerId: string, body: { itemName: string; quantity: number; durability: number }) => post<{ task: Task }>(`/api/players/${encodeURIComponent(playerId)}/give-item`, body),
  addXp: (playerId: string, amount: number) => post<{ task: Task }>(`/api/players/${encodeURIComponent(playerId)}/add-xp`, { amount }),
  refillWater: (playerId: string) => post<{ task: Task }>(`/api/players/${encodeURIComponent(playerId)}/refill-water`),
  kick: (playerId: string) => post<{ task: Task }>(`/api/players/${encodeURIComponent(playerId)}/kick`)
};
