import { api, post } from "./client";

export const databaseApi = {
  status: () => api<Record<string, unknown>>("/api/database/status"),
  schemas: () => api<string[]>("/api/database/schemas"),
  tables: (schema = "dune") => api<{ schema: string; name: string; estimated_rows: string }[]>(`/api/database/tables?schema=${encodeURIComponent(schema)}`),
  columns: (schema: string, table: string) => api<Record<string, unknown>[]>(`/api/database/tables/${encodeURIComponent(schema)}/${encodeURIComponent(table)}/columns`),
  count: (schema: string, table: string) => api<{ count: string }>(`/api/database/tables/${encodeURIComponent(schema)}/${encodeURIComponent(table)}/count`),
  preview: (schema: string, table: string, limit = 50, offset = 0) => api<{ columns: { name: string }[]; rows: Record<string, unknown>[] }>(`/api/database/tables/${encodeURIComponent(schema)}/${encodeURIComponent(table)}/preview?limit=${limit}&offset=${offset}`),
  search: (q: string) => api<Record<string, unknown>[]>(`/api/database/search?q=${encodeURIComponent(q)}`),
  query: (query: string, confirmation = "") => post<{ columns: { name: string }[]; rows: Record<string, unknown>[] }>("/api/database/query", { query, confirmDestructive: confirmation === "RUN DESTRUCTIVE SQL", confirmation }),
  export: (query: string) => post<{ columns: { name: string }[]; rows: Record<string, unknown>[] }>("/api/database/export", { query })
};
