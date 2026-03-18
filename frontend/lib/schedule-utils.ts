import type { Assignment, ScheduleResponse } from "./types"

// ---- localStorage key ----
export const SCHEDULE_RESULT_KEY = "taskalign:lastScheduleResult"

export function getStoredResult(): ScheduleResponse | null {
  if (typeof window === "undefined") return null
  try {
    const raw = localStorage.getItem(SCHEDULE_RESULT_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function storeResult(data: ScheduleResponse): void {
  if (typeof window === "undefined") return
  localStorage.setItem(SCHEDULE_RESULT_KEY, JSON.stringify(data))
}

// ---- Grouping helpers ----
export type MachineDay = { machineId: string; machineName: string; day: number; tasks: Assignment[] }

export function groupByMachineThenDay(assignments: Assignment[]): Record<string, Record<number, Assignment[]>> {
  const grouped: Record<string, Record<number, Assignment[]>> = {}
  for (const a of assignments) {
    if (!grouped[a.machine_id]) grouped[a.machine_id] = {}
    if (!grouped[a.machine_id][a.day]) grouped[a.machine_id][a.day] = []
    grouped[a.machine_id][a.day].push(a)
  }
  for (const machineId of Object.keys(grouped)) {
    for (const day of Object.keys(grouped[machineId])) {
      grouped[machineId][Number(day)].sort((a, b) => a.start_hour - b.start_hour)
    }
  }
  return grouped
}

// ---- Daily summary ----
export interface DayMachineSummary {
  day: number
  machineId: string
  machineName: string
  productionHours: number
  waitHours: number
  changeoverHours: number
  totalUsedHours: number
  utilization: number
  producedQty: number
}

export interface DayTotalSummary {
  day: number
  productionHours: number
  waitHours: number
  changeoverHours: number
  totalUsedHours: number
  machineCount: number
  producedQty: number
}

export function computeDailySummaries(assignments: Assignment[]) {
  const map = new Map<string, DayMachineSummary>()
  for (const a of assignments) {
    const key = `${a.day}-${a.machine_id}`
    if (!map.has(key)) {
      map.set(key, {
        day: a.day,
        machineId: a.machine_id,
        machineName: a.machine_name,
        productionHours: 0,
        waitHours: 0,
        changeoverHours: 0,
        totalUsedHours: 0,
        utilization: 0,
        producedQty: 0,
      })
    }
    const s = map.get(key)!
    s.totalUsedHours += a.used_hours
    if (a.task_type === "PRODUCE") {
      s.productionHours += a.used_hours
      s.producedQty += a.produced_qty ?? 0
    } else if (a.task_type === "WAIT") {
      s.waitHours += a.used_hours
    } else {
      s.changeoverHours += a.used_hours
    }
  }

  // Compute utilization based on max end_hour per machine-day
  for (const a of assignments) {
    const key = `${a.day}-${a.machine_id}`
    const s = map.get(key)!
    const maxEnd = assignments
      .filter((x) => x.day === a.day && x.machine_id === a.machine_id)
      .reduce((m, x) => Math.max(m, x.end_hour), 0)
    s.utilization = maxEnd > 0 ? s.totalUsedHours / maxEnd : 0
  }

  const perMachineDay = [...map.values()].sort((a, b) => a.day - b.day || a.machineId.localeCompare(b.machineId))

  // Aggregate per day
  const dayMap = new Map<number, DayTotalSummary>()
  for (const s of perMachineDay) {
    if (!dayMap.has(s.day)) {
      dayMap.set(s.day, {
        day: s.day,
        productionHours: 0,
        waitHours: 0,
        changeoverHours: 0,
        totalUsedHours: 0,
        machineCount: 0,
        producedQty: 0,
      })
    }
    const d = dayMap.get(s.day)!
    d.productionHours += s.productionHours
    d.waitHours += s.waitHours
    d.changeoverHours += s.changeoverHours
    d.totalUsedHours += s.totalUsedHours
    d.machineCount += 1
    d.producedQty += s.producedQty
  }
  const perDay = [...dayMap.values()].sort((a, b) => a.day - b.day)

  return { perMachineDay, perDay }
}

// ---- CSV export ----
const CSV_COLUMNS = [
  "day", "machine_id", "machine_name", "sequence_in_day", "task_type",
  "start_hour", "end_hour", "used_hours", "utilization",
  "mold_id", "component_id", "component_name", "produced_qty", "color",
  "from_color", "to_color", "from_mold_id", "to_mold_id",
] as const

function formatCSVValue(val: unknown): string {
  if (val === null || val === undefined) return ""
  if (typeof val === "number") return Number.isInteger(val) ? String(val) : val.toFixed(4)
  const str = String(val)
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

export function assignmentsToCSV(assignments: Assignment[]): string {
  const header = CSV_COLUMNS.join(",")
  const rows = assignments.map((a) =>
    CSV_COLUMNS.map((col) => formatCSVValue(a[col as keyof Assignment])).join(",")
  )
  return [header, ...rows].join("\n")
}

export function downloadCSV(assignments: Assignment[], filename = "taskalign_schedule.csv") {
  const csv = assignmentsToCSV(assignments)
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

// ---- Demo data ----
export const DEMO_RESULT: ScheduleResponse = {
  score: 847.35,
  unmet: { C4: 500, C5: 1200 },
  assignments: [
    { day: 1, machine_id: "M1", machine_name: "Small Press A", sequence_in_day: 1, task_type: "PRODUCE", start_hour: 0, end_hour: 8.5, used_hours: 8.5, utilization: 0.425, component_id: "C1", component_name: "Bottle Cap", produced_qty: 2550, mold_id: "MLD1", color: "white" },
    { day: 1, machine_id: "M1", machine_name: "Small Press A", sequence_in_day: 2, task_type: "CHANGE_COLOR", start_hour: 8.5, end_hour: 9.0, used_hours: 0.5, utilization: 0.025, from_color: "white", to_color: "blue" },
    { day: 1, machine_id: "M1", machine_name: "Small Press A", sequence_in_day: 3, task_type: "PRODUCE", start_hour: 9.0, end_hour: 18.0, used_hours: 9.0, utilization: 0.45, component_id: "C5", component_name: "Bottle Cap (Blue)", produced_qty: 2700, mold_id: "MLD1", color: "blue" },
    { day: 1, machine_id: "M2", machine_name: "Small Press B", sequence_in_day: 1, task_type: "PRODUCE", start_hour: 0, end_hour: 17.0, used_hours: 17.0, utilization: 0.85, component_id: "C2", component_name: "Bottle Body", produced_qty: 2448, mold_id: "MLD2", color: "white" },
    { day: 1, machine_id: "M3", machine_name: "Medium Press A", sequence_in_day: 1, task_type: "PRODUCE", start_hour: 0, end_hour: 18.0, used_hours: 18.0, utilization: 0.9, component_id: "C3", component_name: "Housing Shell", produced_qty: 1851, mold_id: "MLD3", color: "black" },
    { day: 1, machine_id: "M4", machine_name: "Large Press A", sequence_in_day: 1, task_type: "WAIT", start_hour: 0, end_hour: 2.0, used_hours: 2.0, utilization: 0.111 },
    { day: 1, machine_id: "M4", machine_name: "Large Press A", sequence_in_day: 2, task_type: "PRODUCE", start_hour: 2.0, end_hour: 16.0, used_hours: 14.0, utilization: 0.778, component_id: "C4", component_name: "Dashboard Panel", produced_qty: 840, mold_id: "MLD4", color: "gray" },
    { day: 2, machine_id: "M1", machine_name: "Small Press A", sequence_in_day: 1, task_type: "CHANGE_COLOR", start_hour: 0, end_hour: 0.5, used_hours: 0.5, utilization: 0.025, from_color: "blue", to_color: "white" },
    { day: 2, machine_id: "M1", machine_name: "Small Press A", sequence_in_day: 2, task_type: "PRODUCE", start_hour: 0.5, end_hour: 18.0, used_hours: 17.5, utilization: 0.875, component_id: "C1", component_name: "Bottle Cap", produced_qty: 5250, mold_id: "MLD1", color: "white" },
    { day: 2, machine_id: "M2", machine_name: "Small Press B", sequence_in_day: 1, task_type: "PRODUCE", start_hour: 0, end_hour: 17.0, used_hours: 17.0, utilization: 0.85, component_id: "C2", component_name: "Bottle Body", produced_qty: 2448, mold_id: "MLD2", color: "white" },
    { day: 2, machine_id: "M3", machine_name: "Medium Press A", sequence_in_day: 1, task_type: "PRODUCE", start_hour: 0, end_hour: 18.0, used_hours: 18.0, utilization: 0.9, component_id: "C3", component_name: "Housing Shell", produced_qty: 1851, mold_id: "MLD3", color: "black" },
    { day: 2, machine_id: "M4", machine_name: "Large Press A", sequence_in_day: 1, task_type: "CHANGE_MOLD", start_hour: 0, end_hour: 1.5, used_hours: 1.5, utilization: 0.083, from_mold_id: "MLD4", to_mold_id: "MLD3" },
    { day: 2, machine_id: "M4", machine_name: "Large Press A", sequence_in_day: 2, task_type: "WAIT", start_hour: 1.5, end_hour: 3.0, used_hours: 1.5, utilization: 0.083 },
    { day: 2, machine_id: "M4", machine_name: "Large Press A", sequence_in_day: 3, task_type: "PRODUCE", start_hour: 3.0, end_hour: 16.0, used_hours: 13.0, utilization: 0.722, component_id: "C4", component_name: "Dashboard Panel", produced_qty: 780, mold_id: "MLD4", color: "gray" },
    { day: 3, machine_id: "M1", machine_name: "Small Press A", sequence_in_day: 1, task_type: "PRODUCE", start_hour: 0, end_hour: 9.0, used_hours: 9.0, utilization: 0.45, component_id: "C1", component_name: "Bottle Cap", produced_qty: 2700, mold_id: "MLD1", color: "white" },
    { day: 3, machine_id: "M1", machine_name: "Small Press A", sequence_in_day: 2, task_type: "CHANGE_COLOR", start_hour: 9.0, end_hour: 9.5, used_hours: 0.5, utilization: 0.025, from_color: "white", to_color: "blue" },
    { day: 3, machine_id: "M1", machine_name: "Small Press A", sequence_in_day: 3, task_type: "PRODUCE", start_hour: 9.5, end_hour: 18.0, used_hours: 8.5, utilization: 0.425, component_id: "C5", component_name: "Bottle Cap (Blue)", produced_qty: 2550, mold_id: "MLD1", color: "blue" },
    { day: 3, machine_id: "M2", machine_name: "Small Press B", sequence_in_day: 1, task_type: "PRODUCE", start_hour: 0, end_hour: 17.0, used_hours: 17.0, utilization: 0.85, component_id: "C2", component_name: "Bottle Body", produced_qty: 2448, mold_id: "MLD2", color: "white" },
    { day: 3, machine_id: "M3", machine_name: "Medium Press A", sequence_in_day: 1, task_type: "PRODUCE", start_hour: 0, end_hour: 10.0, used_hours: 10.0, utilization: 0.5, component_id: "C3", component_name: "Housing Shell", produced_qty: 1028, mold_id: "MLD3", color: "black" },
    { day: 3, machine_id: "M3", machine_name: "Medium Press A", sequence_in_day: 2, task_type: "WAIT", start_hour: 10.0, end_hour: 18.0, used_hours: 8.0, utilization: 0.4 },
  ],
}
