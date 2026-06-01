import { api } from "./client";

export const worldDataApi = {
  storage: () => api<{ rows: Record<string, unknown>[]; capabilities: Record<string, unknown>; reason?: string }>("/api/storage"),
  storageItems: (id: string) => api<{ rows: Record<string, unknown>[]; capabilities: Record<string, unknown>; reason?: string }>(`/api/storage/${encodeURIComponent(id)}/items`),
  storageExportUrl: (id: string) => `/api/storage/${encodeURIComponent(id)}/export`,
  bases: () => api<{ rows: Record<string, unknown>[]; capabilities: Record<string, unknown>; reason?: string }>("/api/bases"),
  baseExportUrl: (id: string) => `/api/bases/${encodeURIComponent(id)}/export`,
  blueprints: () => api<{ rows: Record<string, unknown>[]; capabilities: Record<string, unknown>; reason?: string }>("/api/blueprints"),
  blueprintExportUrl: (id: string) => `/api/blueprints/${encodeURIComponent(id)}/export`
};
