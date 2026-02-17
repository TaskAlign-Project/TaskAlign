import type { Machine, Mold, Component, PlanSetup } from "./types"

const KEYS = {
  machines: "taskalign_machines",
  molds: "taskalign_molds",
  components: "taskalign_components",
  planSetup: "taskalign_plan_setup",
}

function getItem<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

function setItem<T>(key: string, value: T): void {
  if (typeof window === "undefined") return
  localStorage.setItem(key, JSON.stringify(value))
}

// Machines
export function getMachines(): Machine[] {
  return getItem<Machine[]>(KEYS.machines, [])
}
export function setMachines(machines: Machine[]): void {
  setItem(KEYS.machines, machines)
}

// Molds
export function getMolds(): Mold[] {
  return getItem<Mold[]>(KEYS.molds, [])
}
export function setMolds(molds: Mold[]): void {
  setItem(KEYS.molds, molds)
}

// Components
export function getComponents(): Component[] {
  return getItem<Component[]>(KEYS.components, [])
}
export function setComponents(components: Component[]): void {
  setItem(KEYS.components, components)
}

// Plan Setup
export const DEFAULT_PLAN_SETUP: PlanSetup = {
  month_days: 22,
  mold_change_time_hours: 1.5,
  color_change_time_hours: 0.5,
  pop_size: 50,
  n_generations: 100,
  mutation_rate: 0.1,
}

export function getPlanSetup(): PlanSetup {
  return getItem<PlanSetup>(KEYS.planSetup, DEFAULT_PLAN_SETUP)
}
export function setPlanSetup(setup: PlanSetup): void {
  setItem(KEYS.planSetup, setup)
}


// Example seed data
export const EXAMPLE_MACHINES: Machine[] = [
  { id: "M1", name: "S-IMM-01", group: "small", tonnage: 120, hours_per_day: 12, efficiency: 1.0 },
  { id: "M2", name: "S-IMM-02", group: "small", tonnage: 120, hours_per_day: 12, efficiency: 1.0 },
]

export const EXAMPLE_MOLDS: Mold[] = [
  { id: "MO1", name: "Mold-1", group: "small", tonnage: 80 },
  { id: "MO2", name: "Mold-2", group: "small", tonnage: 80 },
]

export const EXAMPLE_COMPONENTS: Component[] = [
  {
    id: "C1",
    name: "Base-Part (Red)",
    quantity: 800,
    cycle_time_sec: 40,
    mold_id: "MO1",
    color: "red",
    due_day: 2,
    lead_time_days: 1,
    prerequisites: [],
  },
  {
    id: "C2",
    name: "Top-Part (Blue) depends on C1",
    quantity: 600,
    cycle_time_sec: 30,
    mold_id: "MO2",
    color: "blue",
    due_day: 3,
    lead_time_days: 1,
    prerequisites: ["C1"],
  },
  {
    id: "C3",
    name: "Small-Runner (Red)",
    quantity: 200,
    cycle_time_sec: 20,
    mold_id: "MO1",
    color: "blue",
    due_day: 2,
    lead_time_days: 1,
    prerequisites: [],
  },
]

export const EXAMPLE_PLAN_SETUP: PlanSetup = {
  month_days: 3,
  mold_change_time_hours: 1.0,
  color_change_time_hours: 0.5,
  pop_size: 25,
  n_generations: 60,
  mutation_rate: 0.3,
}

export function loadExampleData(): void {
  setMachines(EXAMPLE_MACHINES)
  setMolds(EXAMPLE_MOLDS)
  setComponents(EXAMPLE_COMPONENTS)
  setPlanSetup(EXAMPLE_PLAN_SETUP)
}
