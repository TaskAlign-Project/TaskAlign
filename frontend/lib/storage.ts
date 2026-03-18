import type {
  Machine,
  Mold,
  Component,
  PlanSetup,
  Plan,
  PlanMachine,
  PlanRun,
} from "./types"

const KEYS = {
  // Legacy keys (kept for backwards compat, but will migrate to plan-based)
  machines: "taskalign_machines",
  molds: "taskalign_molds",
  components: "taskalign_components",
  planSetup: "taskalign_plan_setup",
  // New plan-based keys
  plans: "taskalign:plans",
  activePlanId: "taskalign:activePlanId",
  activeRunByPlan: "taskalign:activeRunByPlan",
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

// ============================================================
// Legacy storage functions (for backwards compatibility)
// ============================================================

export function getMachines(): Machine[] {
  return getItem<Machine[]>(KEYS.machines, [])
}
export function setMachines(machines: Machine[]): void {
  setItem(KEYS.machines, machines)
}

export function getMolds(): Mold[] {
  return getItem<Mold[]>(KEYS.molds, [])
}
export function setMolds(molds: Mold[]): void {
  setItem(KEYS.molds, molds)
}

export function getComponents(): Component[] {
  return getItem<Component[]>(KEYS.components, [])
}
export function setComponents(components: Component[]): void {
  setItem(KEYS.components, components)
}

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

// ============================================================
// Example seed data
// ============================================================

export const EXAMPLE_MACHINES: PlanMachine[] = [
  { id: "M1", name: "Small Press A", group: "small", tonnage: 80, hours_per_day: 20, efficiency: 0.9, status: "available" },
  { id: "M2", name: "Small Press B", group: "small", tonnage: 100, hours_per_day: 20, efficiency: 0.85, status: "available" },
  { id: "M3", name: "Medium Press A", group: "medium", tonnage: 200, hours_per_day: 20, efficiency: 0.9, status: "available" },
  { id: "M4", name: "Large Press A", group: "large", tonnage: 500, hours_per_day: 18, efficiency: 0.88, status: "available" },
]

export const EXAMPLE_MOLDS: Mold[] = [
  { id: "MLD1", name: "Cap Mold", group: "small", tonnage: 60 },
  { id: "MLD2", name: "Body Mold", group: "small", tonnage: 80 },
  { id: "MLD3", name: "Housing Mold", group: "medium", tonnage: 180 },
  { id: "MLD4", name: "Panel Mold", group: "large", tonnage: 400 },
]

export const EXAMPLE_COMPONENTS: Component[] = [
  { id: "C1", name: "Bottle Cap", quantity: 10000, finished: 0, cycle_time_sec: 12, mold_id: "MLD1", color: "white", due_day: 10, lead_time_days: 2, prerequisites: [] },
  { id: "C2", name: "Bottle Body", quantity: 10000, finished: 0, cycle_time_sec: 25, mold_id: "MLD2", color: "white", due_day: 12, lead_time_days: 3, prerequisites: ["C1"] },
  { id: "C3", name: "Housing Shell", quantity: 5000, finished: 1200, cycle_time_sec: 35, mold_id: "MLD3", color: "black", due_day: 15, lead_time_days: 4, prerequisites: [] },
  { id: "C4", name: "Dashboard Panel", quantity: 2000, finished: 500, cycle_time_sec: 60, mold_id: "MLD4", color: "gray", due_day: 20, lead_time_days: 5, prerequisites: ["C3"] },
  { id: "C5", name: "Bottle Cap (Blue)", quantity: 8000, finished: 0, cycle_time_sec: 12, mold_id: "MLD1", color: "blue", due_day: 18, lead_time_days: 2, prerequisites: [] },
]

export const EXAMPLE_PLAN_SETUP: PlanSetup = {
  month_days: 22,
  mold_change_time_hours: 1.5,
  color_change_time_hours: 0.5,
  pop_size: 50,
  n_generations: 100,
  mutation_rate: 0.1,
}

export function loadExampleData(): void {
  setMachines(EXAMPLE_MACHINES)
  setMolds(EXAMPLE_MOLDS)
  setComponents(EXAMPLE_COMPONENTS)
  setPlanSetup(EXAMPLE_PLAN_SETUP)
}

// ============================================================
// Plan-based storage functions
// ============================================================

export function getPlans(): Plan[] {
  return getItem<Plan[]>(KEYS.plans, [])
}

export function savePlans(plans: Plan[]): void {
  setItem(KEYS.plans, plans)
}

export function getPlanById(planId: string): Plan | undefined {
  return getPlans().find((p) => p.id === planId)
}

function generatePlanName(plans: Plan[]): string {
  const existingNums = plans
    .map((p) => {
      const match = p.name.match(/^Plan (\d+)$/)
      return match ? parseInt(match[1], 10) : 0
    })
    .filter((n) => n > 0)
  const maxNum = existingNums.length > 0 ? Math.max(...existingNums) : 0
  return `Plan ${String(maxNum + 1).padStart(2, "0")}`
}

export function createPlan(options?: { name?: string; fromPlanId?: string }): Plan {
  const plans = getPlans()
  const now = new Date().toISOString()
  const id = crypto.randomUUID()

  let machines: PlanMachine[]
  let molds: Mold[]
  let components: Component[]
  let setup: PlanSetup

  if (options?.fromPlanId) {
    // Duplicate from existing plan
    const source = plans.find((p) => p.id === options.fromPlanId)
    if (source) {
      machines = structuredClone(source.machines)
      molds = structuredClone(source.molds)
      components = structuredClone(source.components)
      setup = structuredClone(source.setup)
    } else {
      machines = structuredClone(EXAMPLE_MACHINES)
      molds = structuredClone(EXAMPLE_MOLDS)
      components = structuredClone(EXAMPLE_COMPONENTS)
      setup = structuredClone(EXAMPLE_PLAN_SETUP)
    }
  } else {
    // Initialize with example data
    machines = structuredClone(EXAMPLE_MACHINES)
    molds = structuredClone(EXAMPLE_MOLDS)
    components = structuredClone(EXAMPLE_COMPONENTS)
    setup = structuredClone(EXAMPLE_PLAN_SETUP)
  }

  const plan: Plan = {
    id,
    name: options?.name || generatePlanName(plans),
    created_at: now,
    updated_at: now,
    setup,
    machines,
    molds,
    components,
    runs: [],
  }

  savePlans([...plans, plan])
  return plan
}

export function duplicatePlan(planId: string): Plan | null {
  const plans = getPlans()
  const source = plans.find((p) => p.id === planId)
  if (!source) return null

  const newName = `${source.name} (Copy)`
  return createPlan({ name: newName, fromPlanId: planId })
}

export function deletePlan(planId: string): void {
  const plans = getPlans().filter((p) => p.id !== planId)
  savePlans(plans)

  // Clear active plan if deleted
  if (getActivePlanId() === planId) {
    setActivePlanId(null)
  }

  // Clean up active run tracking
  const activeRuns = getActiveRunByPlan()
  delete activeRuns[planId]
  setItem(KEYS.activeRunByPlan, activeRuns)
}

export function updatePlan(planId: string, updates: Partial<Pick<Plan, "name" | "month_label">>): void {
  const plans = getPlans()
  const idx = plans.findIndex((p) => p.id === planId)
  if (idx === -1) return

  plans[idx] = {
    ...plans[idx],
    ...updates,
    updated_at: new Date().toISOString(),
  }
  savePlans(plans)
}

// ============================================================
// Active plan management
// ============================================================

export function getActivePlanId(): string | null {
  return getItem<string | null>(KEYS.activePlanId, null)
}

export function setActivePlanId(id: string | null): void {
  setItem(KEYS.activePlanId, id)
}

export function getActivePlan(): Plan | null {
  const id = getActivePlanId()
  if (!id) return null
  return getPlanById(id) ?? null
}

// ============================================================
// Plan data update helpers
// ============================================================

export function updateActivePlanMachines(machines: PlanMachine[]): void {
  const planId = getActivePlanId()
  if (!planId) return

  const plans = getPlans()
  const idx = plans.findIndex((p) => p.id === planId)
  if (idx === -1) return

  plans[idx].machines = machines
  plans[idx].updated_at = new Date().toISOString()
  savePlans(plans)
}

export function updateActivePlanMolds(molds: Mold[]): void {
  const planId = getActivePlanId()
  if (!planId) return

  const plans = getPlans()
  const idx = plans.findIndex((p) => p.id === planId)
  if (idx === -1) return

  plans[idx].molds = molds
  plans[idx].updated_at = new Date().toISOString()
  savePlans(plans)
}

export function updateActivePlanComponents(components: Component[]): void {
  const planId = getActivePlanId()
  if (!planId) return

  const plans = getPlans()
  const idx = plans.findIndex((p) => p.id === planId)
  if (idx === -1) return

  plans[idx].components = components
  plans[idx].updated_at = new Date().toISOString()
  savePlans(plans)
}

export function updateActivePlanSetup(setup: PlanSetup): void {
  const planId = getActivePlanId()
  if (!planId) return

  const plans = getPlans()
  const idx = plans.findIndex((p) => p.id === planId)
  if (idx === -1) return

  plans[idx].setup = setup
  plans[idx].updated_at = new Date().toISOString()
  savePlans(plans)
}

// ============================================================
// Run history management
// ============================================================

export function appendPlanRun(planId: string, run: PlanRun): void {
  const plans = getPlans()
  const idx = plans.findIndex((p) => p.id === planId)
  if (idx === -1) return

  plans[idx].runs.push(run)
  plans[idx].updated_at = new Date().toISOString()
  savePlans(plans)

  // Also set this run as the current run for this plan
  setCurrentRun(planId, run.id)
}

export function getActiveRunByPlan(): Record<string, string> {
  return getItem<Record<string, string>>(KEYS.activeRunByPlan, {})
}

export function setCurrentRun(planId: string, runId: string): void {
  const activeRuns = getActiveRunByPlan()
  activeRuns[planId] = runId
  setItem(KEYS.activeRunByPlan, activeRuns)
}

export function getCurrentRunId(planId: string): string | null {
  const activeRuns = getActiveRunByPlan()
  return activeRuns[planId] ?? null
}

export function getCurrentRun(planId: string): PlanRun | null {
  const plan = getPlanById(planId)
  if (!plan) return null

  const runId = getCurrentRunId(planId)
  if (!runId) {
    // If no current run set, return the latest run
    return plan.runs.length > 0 ? plan.runs[plan.runs.length - 1] : null
  }

  return plan.runs.find((r) => r.id === runId) ?? null
}

export function getLatestRun(planId: string): PlanRun | null {
  const plan = getPlanById(planId)
  if (!plan || plan.runs.length === 0) return null
  return plan.runs[plan.runs.length - 1]
}

// ============================================================
// Demo data creation (with pre-populated run result)
// ============================================================

import { DEMO_RESULT } from "./schedule-utils"

export function createDemoPlan(): Plan {
  const plans = getPlans()
  const now = new Date().toISOString()
  const id = crypto.randomUUID()
  const runId = crypto.randomUUID()

  const demoRun: PlanRun = {
    id: runId,
    created_at: now,
    mode: "fresh",
    result: DEMO_RESULT,
  }

  const plan: Plan = {
    id,
    name: "Demo Plan",
    month_label: "Demo Month",
    created_at: now,
    updated_at: now,
    setup: structuredClone(EXAMPLE_PLAN_SETUP),
    machines: structuredClone(EXAMPLE_MACHINES),
    molds: structuredClone(EXAMPLE_MOLDS),
    components: structuredClone(EXAMPLE_COMPONENTS),
    runs: [demoRun],
  }

  savePlans([...plans, plan])
  setActivePlanId(plan.id)
  setCurrentRun(plan.id, runId)

  return plan
}

export function addDemoRunToActivePlan(): PlanRun | null {
  const planId = getActivePlanId()
  if (!planId) return null

  const run: PlanRun = {
    id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
    mode: "fresh",
    result: DEMO_RESULT,
  }

  appendPlanRun(planId, run)
  return run
}
