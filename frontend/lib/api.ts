import type { ScheduleRequest, ScheduleResponse, Plan, Machine, Mold, Component } from "./types"

const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000"
const API_V1 = `${BASE_URL}/api/v1`

// --- Generic Fetch Wrapper ---
async function apiFetch<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_V1}${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.detail || `Server error: ${res.status}`)
  }
  return res.json()
}

// --- Plans API ---
export const plansApi = {
  list: () => apiFetch<Plan[]>("/plans"),
  get: (id: string) => apiFetch<Plan>(`/plans/${id}`),
  create: (data: Partial<Plan>) => 
    apiFetch<Plan>("/plans", {
      method: "POST",
      body: JSON.stringify({
        name: data.name || `Plan ${new Date().toLocaleDateString()}`,
        current_date: new Date().toISOString().split('T')[0],
        start_time: "08:00",
        ...data
      }),
    }),
  update: (id: string, data: Partial<Plan>) =>
    apiFetch<Plan>(`/plans/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  delete: (id: string) =>
    apiFetch<{ message: string }>(`/plans/${id}`, { method: "DELETE" }),
}

// --- Existing GA Scheduler Call ---
export async function runSchedule(payload: ScheduleRequest): Promise<ScheduleResponse> {
  const res = await fetch(`${BASE_URL}/schedule_v2`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error("Scheduling failed")
  return res.json()
}

// --- Machines API (Global) ---
export const machinesApi = {
  list: () => apiFetch<Machine[]>("/machines"),
  get: (id: string) => apiFetch<Machine>(`/machines/${id}`),
  create: (data: Partial<Machine>) =>
    apiFetch<Machine>("/machines", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  update: (id: string, data: Partial<Machine>) =>
    apiFetch<Machine>(`/machines/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  delete: (id: string) =>
    apiFetch<{ message: string }>(`/machines/${id}`, { method: "DELETE" }),
  
  // New: Real File Upload for Import
  import: async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    
    const res = await fetch(`${BASE_URL}/api/v1/machines/import`, {
      method: "POST",
      body: formData, // Browser sets boundary automatically
    });

    if (!res.ok) throw new Error("Import failed");
    return res.json();
  }
}

// --- Molds API (Global) ---
export const moldsApi = {
  list: () => apiFetch<Mold[]>("/molds"),
  get: (id: string) => apiFetch<Mold>(`/molds/${id}`),
  create: (data: Partial<Mold>) =>
    apiFetch<Mold>("/molds", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  update: (id: string, data: Partial<Mold>) =>
    apiFetch<Mold>(`/molds/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  delete: (id: string) =>
    apiFetch<{ message: string }>(`/molds/${id}`, { method: "DELETE" }),
  import: async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch(`${BASE_URL}/api/v1/molds/import`, {
      method: "POST",
      body: formData,
    });
    if (!res.ok) throw new Error("Import failed");
    return res.json();
  }
}

// --- Components API (Plan-based) ---
export const componentsApi = {
  list: () => apiFetch<Component[]>("/components"),
  get: (id: string) => apiFetch<Component>(`/components/${id}`),
  create: (data: Partial<Component>) =>
    apiFetch<Component>("/components", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  update: (id: string, data: Partial<Component>) =>
    apiFetch<Component>(`/components/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  delete: (id: string) =>
    apiFetch<{ message: string }>(`/components/${id}`, { method: "DELETE" }),
  import: async (file: File) => {
    const formData = new FormData()
    formData.append("file", file)
    const res = await fetch(`${BASE_URL}/api/v1/components/import`, {
      method: "POST",
      body: formData,
    })
    if (!res.ok) throw new Error("Import failed")
    return res.json()
  }
}