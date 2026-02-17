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
  assignments: [
    {
      day: 1,
      machine_id: "M1",
      machine_name: "S-IMM-01",
      sequence_in_day: 1,
      task_type: "CHANGE_COLOR",
      from_color: "none",
      to_color: "red",
      used_hours: 0.5,
      start_hour: 0,
      end_hour: 0.5,
      utilization: 0.041666666666666664,
    },
    {
      day: 1,
      machine_id: "M1",
      machine_name: "S-IMM-01",
      sequence_in_day: 2,
      task_type: "CHANGE_MOLD",
      from_mold_id: "none",
      to_mold_id: "MO1",
      used_hours: 1,
      start_hour: 0.5,
      end_hour: 1.5,
      utilization: 0.08333333333333333,
    },
    {
      day: 1,
      machine_id: "M1",
      machine_name: "S-IMM-01",
      sequence_in_day: 3,
      task_type: "PRODUCE",
      mold_id: "MO1",
      component_id: "C1",
      component_name: "Base-Part (Red)",
      color: "red",
      produced_qty: 800,
      used_hours: 8.88888888888889,
      start_hour: 1.5,
      end_hour: 10.38888888888889,
      utilization: 0.7407407407407408,
    },
    {
      day: 1,
      machine_id: "M2",
      machine_name: "S-IMM-02",
      sequence_in_day: 1,
      task_type: "CHANGE_COLOR",
      from_color: "none",
      to_color: "blue",
      used_hours: 0.5,
      start_hour: 0,
      end_hour: 0.5,
      utilization: 0.041666666666666664,
    },
    {
      day: 1,
      machine_id: "M2",
      machine_name: "S-IMM-02",
      sequence_in_day: 2,
      task_type: "CHANGE_MOLD",
      from_mold_id: "none",
      to_mold_id: "MO2",
      used_hours: 1,
      start_hour: 0.5,
      end_hour: 1.5,
      utilization: 0.08333333333333333,
    },
    {
      day: 1,
      machine_id: "M2",
      machine_name: "S-IMM-02",
      sequence_in_day: 3,
      task_type: "WAIT",
      used_hours: 8.88888888888889,
      start_hour: 1.5,
      end_hour: 10.38888888888889,
      utilization: 0.7407407407407408,
    },
    {
      day: 1,
      machine_id: "M2",
      machine_name: "S-IMM-02",
      sequence_in_day: 4,
      task_type: "PRODUCE",
      mold_id: "MO2",
      component_id: "C2",
      component_name: "Top-Part (Blue) depends on C1",
      color: "blue",
      produced_qty: 193,
      used_hours: 1.6083333333333334,
      start_hour: 10.38888888888889,
      end_hour: 11.997222222222224,
      utilization: 0.13402777777777777,
    },
    {
      day: 1,
      machine_id: "M1",
      machine_name: "S-IMM-01",
      sequence_in_day: 4,
      task_type: "CHANGE_COLOR",
      from_color: "red",
      to_color: "blue",
      used_hours: 0.5,
      start_hour: 10.38888888888889,
      end_hour: 10.88888888888889,
      utilization: 0.041666666666666664,
    },
    {
      day: 1,
      machine_id: "M1",
      machine_name: "S-IMM-01",
      sequence_in_day: 5,
      task_type: "PRODUCE",
      mold_id: "MO1",
      component_id: "C3",
      component_name: "Small-Runner (Red)",
      color: "blue",
      produced_qty: 199,
      used_hours: 1.1055555555555556,
      start_hour: 10.88888888888889,
      end_hour: 11.994444444444445,
      utilization: 0.09212962962962963,
    },
    {
      day: 2,
      machine_id: "M1",
      machine_name: "S-IMM-01",
      sequence_in_day: 1,
      task_type: "PRODUCE",
      mold_id: "MO1",
      component_id: "C3",
      component_name: "Small-Runner (Red)",
      color: "blue",
      produced_qty: 1,
      used_hours: 0.005555555555555556,
      start_hour: 0,
      end_hour: 0.005555555555555556,
      utilization: 0.000462962962962963,
    },
    {
      day: 2,
      machine_id: "M2",
      machine_name: "S-IMM-02",
      sequence_in_day: 1,
      task_type: "PRODUCE",
      mold_id: "MO2",
      component_id: "C2",
      component_name: "Top-Part (Blue) depends on C1",
      color: "blue",
      produced_qty: 407,
      used_hours: 3.3916666666666666,
      start_hour: 0,
      end_hour: 3.3916666666666666,
      utilization: 0.2826388888888889,
    },
  ],
  unmet: {},
  score: 1380.5555555555557,
}
