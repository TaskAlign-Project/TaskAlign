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
  "assignments": [
    {
      "day": 1,
      "date": "2026-01-01",
      "machine_id": "M1",
      "machine_name": "Small-01",
      "machine_group": "small",
      "sequence_in_day": 1,
      "task_type": "CHANGE_COLOR",
      "from_color": null,
      "to_color": "black",
      "used_hours": 0.5,
      "start_hour": 0,
      "end_hour": 0.5,
      "start_hour_clock": 4,
      "end_hour_clock": 4.5,
      "start_time": "04:00:00",
      "end_time": "04:30:00",
      "start_datetime": "2026-01-01T04:00:00",
      "end_datetime": "2026-01-01T04:30:00",
      "utilization": 0.02801120448179272
    },
    {
      "day": 1,
      "date": "2026-01-01",
      "machine_id": "M1",
      "machine_name": "Small-01",
      "machine_group": "small",
      "sequence_in_day": 2,
      "task_type": "CHANGE_MOLD",
      "from_mold_id": null,
      "to_mold_id": "MO1",
      "used_hours": 1,
      "start_hour": 0.5,
      "end_hour": 1.5,
      "start_hour_clock": 4.5,
      "end_hour_clock": 5.5,
      "start_time": "04:30:00",
      "end_time": "05:30:00",
      "start_datetime": "2026-01-01T04:30:00",
      "end_datetime": "2026-01-01T05:30:00",
      "utilization": 0.05602240896358544
    },
    {
      "day": 1,
      "date": "2026-01-01",
      "machine_id": "M1",
      "machine_name": "Small-01",
      "machine_group": "small",
      "sequence_in_day": 3,
      "task_type": "PRODUCE",
      "mold_id": "MO1",
      "component_id": "C1",
      "component_name": "Base Part (multi-day workload)",
      "color": "black",
      "produced_qty": 2942,
      "used_hours": 16.344444444444445,
      "start_hour": 1.5,
      "end_hour": 17.844444444444445,
      "start_hour_clock": 5.5,
      "end_hour_clock": 21.844444444444445,
      "start_time": "05:30:00",
      "end_time": "21:50:40",
      "start_datetime": "2026-01-01T05:30:00",
      "end_datetime": "2026-01-01T21:50:40",
      "utilization": 0.9156551509492687
    },
    {
      "day": 1,
      "date": "2026-01-01",
      "machine_id": "M2",
      "machine_name": "Small-02",
      "machine_group": "small",
      "sequence_in_day": 1,
      "task_type": "CHANGE_COLOR",
      "from_color": null,
      "to_color": "red",
      "used_hours": 0.5,
      "start_hour": 0,
      "end_hour": 0.5,
      "start_hour_clock": 4,
      "end_hour_clock": 4.5,
      "start_time": "04:00:00",
      "end_time": "04:30:00",
      "start_datetime": "2026-01-01T04:00:00",
      "end_datetime": "2026-01-01T04:30:00",
      "utilization": 0.02801120448179272
    },
    {
      "day": 1,
      "date": "2026-01-01",
      "machine_id": "M2",
      "machine_name": "Small-02",
      "machine_group": "small",
      "sequence_in_day": 2,
      "task_type": "CHANGE_MOLD",
      "from_mold_id": null,
      "to_mold_id": "MO3",
      "used_hours": 1,
      "start_hour": 0.5,
      "end_hour": 1.5,
      "start_hour_clock": 4.5,
      "end_hour_clock": 5.5,
      "start_time": "04:30:00",
      "end_time": "05:30:00",
      "start_datetime": "2026-01-01T04:30:00",
      "end_datetime": "2026-01-01T05:30:00",
      "utilization": 0.05602240896358544
    },
    {
      "day": 1,
      "date": "2026-01-01",
      "machine_id": "M2",
      "machine_name": "Small-02",
      "machine_group": "small",
      "sequence_in_day": 3,
      "task_type": "PRODUCE",
      "mold_id": "MO3",
      "component_id": "C4",
      "component_name": "Clip (independent, multi-day, color change from C1)",
      "color": "red",
      "produced_qty": 3923,
      "used_hours": 16.34583333333333,
      "start_hour": 1.5,
      "end_hour": 17.84583333333333,
      "start_hour_clock": 5.5,
      "end_hour_clock": 21.84583333333333,
      "start_time": "05:30:00",
      "end_time": "21:50:45",
      "start_datetime": "2026-01-01T05:30:00",
      "end_datetime": "2026-01-01T21:50:45",
      "utilization": 0.9157329598506069
    },
    {
      "day": 1,
      "date": "2026-01-01",
      "machine_id": "M3",
      "machine_name": "Medium-01",
      "machine_group": "medium",
      "sequence_in_day": 1,
      "task_type": "CHANGE_COLOR",
      "from_color": null,
      "to_color": "natural",
      "used_hours": 0.5,
      "start_hour": 0,
      "end_hour": 0.5,
      "start_hour_clock": 4,
      "end_hour_clock": 4.5,
      "start_time": "04:00:00",
      "end_time": "04:30:00",
      "start_datetime": "2026-01-01T04:00:00",
      "end_datetime": "2026-01-01T04:30:00",
      "utilization": 0.02801120448179272
    },
    {
      "day": 1,
      "date": "2026-01-01",
      "machine_id": "M3",
      "machine_name": "Medium-01",
      "machine_group": "medium",
      "sequence_in_day": 2,
      "task_type": "CHANGE_MOLD",
      "from_mold_id": null,
      "to_mold_id": "MO4",
      "used_hours": 1,
      "start_hour": 0.5,
      "end_hour": 1.5,
      "start_hour_clock": 4.5,
      "end_hour_clock": 5.5,
      "start_time": "04:30:00",
      "end_time": "05:30:00",
      "start_datetime": "2026-01-01T04:30:00",
      "end_datetime": "2026-01-01T05:30:00",
      "utilization": 0.05602240896358544
    },
    {
      "day": 1,
      "date": "2026-01-01",
      "machine_id": "M3",
      "machine_name": "Medium-01",
      "machine_group": "medium",
      "sequence_in_day": 3,
      "task_type": "TRANSFER",
      "component_id": "C3",
      "component_name": "Insert (parallel with C1, has transfer)",
      "used_hours": 1,
      "start_hour": 1.5,
      "end_hour": 2.5,
      "start_hour_clock": 5.5,
      "end_hour_clock": 6.5,
      "start_time": "05:30:00",
      "end_time": "06:30:00",
      "start_datetime": "2026-01-01T05:30:00",
      "end_datetime": "2026-01-01T06:30:00",
      "utilization": 0.05602240896358544
    },
    {
      "day": 1,
      "date": "2026-01-01",
      "machine_id": "M3",
      "machine_name": "Medium-01",
      "machine_group": "medium",
      "sequence_in_day": 4,
      "task_type": "PRODUCE",
      "mold_id": "MO4",
      "component_id": "C3",
      "component_name": "Insert (parallel with C1, has transfer)",
      "color": "natural",
      "produced_qty": 1578,
      "used_hours": 15.341666666666667,
      "start_hour": 2.5,
      "end_hour": 17.84166666666667,
      "start_hour_clock": 6.5,
      "end_hour_clock": 21.84166666666667,
      "start_time": "06:30:00",
      "end_time": "21:50:30",
      "start_datetime": "2026-01-01T06:30:00",
      "end_datetime": "2026-01-01T21:50:30",
      "utilization": 0.8594771241830066
    },
    {
      "day": 2,
      "date": "2026-01-02",
      "machine_id": "M1",
      "machine_name": "Small-01",
      "machine_group": "small",
      "sequence_in_day": 1,
      "task_type": "PRODUCE",
      "mold_id": "MO1",
      "component_id": "C1",
      "component_name": "Base Part (multi-day workload)",
      "color": "black",
      "produced_qty": 3212,
      "used_hours": 17.844444444444445,
      "start_hour": 0,
      "end_hour": 17.844444444444445,
      "start_hour_clock": 4,
      "end_hour_clock": 21.844444444444445,
      "start_time": "04:00:00",
      "end_time": "21:50:40",
      "start_datetime": "2026-01-02T04:00:00",
      "end_datetime": "2026-01-02T21:50:40",
      "utilization": 0.9996887643946469
    },
    {
      "day": 2,
      "date": "2026-01-02",
      "machine_id": "M2",
      "machine_name": "Small-02",
      "machine_group": "small",
      "sequence_in_day": 1,
      "task_type": "PRODUCE",
      "mold_id": "MO3",
      "component_id": "C4",
      "component_name": "Clip (independent, multi-day, color change from C1)",
      "color": "red",
      "produced_qty": 1077,
      "used_hours": 4.4875,
      "start_hour": 0,
      "end_hour": 4.4875,
      "start_hour_clock": 4,
      "end_hour_clock": 8.4875,
      "start_time": "04:00:00",
      "end_time": "08:29:15",
      "start_datetime": "2026-01-02T04:00:00",
      "end_datetime": "2026-01-02T08:29:15",
      "utilization": 0.25140056022408963
    },
    {
      "day": 2,
      "date": "2026-01-02",
      "machine_id": "M3",
      "machine_name": "Medium-01",
      "machine_group": "medium",
      "sequence_in_day": 1,
      "task_type": "TRANSFER",
      "component_id": "C3",
      "component_name": "Insert (parallel with C1, has transfer)",
      "used_hours": 1,
      "start_hour": 0,
      "end_hour": 1,
      "start_hour_clock": 4,
      "end_hour_clock": 5,
      "start_time": "04:00:00",
      "end_time": "05:00:00",
      "start_datetime": "2026-01-02T04:00:00",
      "end_datetime": "2026-01-02T05:00:00",
      "utilization": 0.05602240896358544
    },
    {
      "day": 2,
      "date": "2026-01-02",
      "machine_id": "M3",
      "machine_name": "Medium-01",
      "machine_group": "medium",
      "sequence_in_day": 2,
      "task_type": "PRODUCE",
      "mold_id": "MO4",
      "component_id": "C3",
      "component_name": "Insert (parallel with C1, has transfer)",
      "color": "natural",
      "produced_qty": 422,
      "used_hours": 4.102777777777778,
      "start_hour": 1,
      "end_hour": 5.102777777777778,
      "start_hour_clock": 5,
      "end_hour_clock": 9.102777777777778,
      "start_time": "05:00:00",
      "end_time": "09:06:10",
      "start_datetime": "2026-01-02T05:00:00",
      "end_datetime": "2026-01-02T09:06:10",
      "utilization": 0.22984749455337694
    },
    {
      "day": 2,
      "date": "2026-01-02",
      "machine_id": "M3",
      "machine_name": "Medium-01",
      "machine_group": "medium",
      "sequence_in_day": 3,
      "task_type": "CHANGE_COLOR",
      "from_color": "natural",
      "to_color": "black",
      "used_hours": 0.5,
      "start_hour": 5.102777777777778,
      "end_hour": 5.602777777777778,
      "start_hour_clock": 9.102777777777778,
      "end_hour_clock": 9.602777777777778,
      "start_time": "09:06:10",
      "end_time": "09:36:10",
      "start_datetime": "2026-01-02T09:06:10",
      "end_datetime": "2026-01-02T09:36:10",
      "utilization": 0.02801120448179272
    },
    {
      "day": 2,
      "date": "2026-01-02",
      "machine_id": "M3",
      "machine_name": "Medium-01",
      "machine_group": "medium",
      "sequence_in_day": 4,
      "task_type": "CHANGE_MOLD",
      "from_mold_id": "MO4",
      "to_mold_id": "MO5",
      "used_hours": 1,
      "start_hour": 5.602777777777778,
      "end_hour": 6.602777777777778,
      "start_hour_clock": 9.602777777777778,
      "end_hour_clock": 10.602777777777778,
      "start_time": "09:36:10",
      "end_time": "10:36:10",
      "start_datetime": "2026-01-02T09:36:10",
      "end_datetime": "2026-01-02T10:36:10",
      "utilization": 0.05602240896358544
    },
    {
      "day": 2,
      "date": "2026-01-02",
      "machine_id": "M3",
      "machine_name": "Medium-01",
      "machine_group": "medium",
      "sequence_in_day": 5,
      "task_type": "TRANSFER",
      "component_id": "C5",
      "component_name": "Frame (wait_all on C3 + C4, forces WAIT task)",
      "used_hours": 0.5,
      "start_hour": 6.602777777777778,
      "end_hour": 7.102777777777778,
      "start_hour_clock": 10.602777777777778,
      "end_hour_clock": 11.102777777777778,
      "start_time": "10:36:10",
      "end_time": "11:06:10",
      "start_datetime": "2026-01-02T10:36:10",
      "end_datetime": "2026-01-02T11:06:10",
      "utilization": 0.02801120448179272
    },
    {
      "day": 2,
      "date": "2026-01-02",
      "machine_id": "M3",
      "machine_name": "Medium-01",
      "machine_group": "medium",
      "sequence_in_day": 6,
      "task_type": "PRODUCE",
      "mold_id": "MO5",
      "component_id": "C5",
      "component_name": "Frame (wait_all on C3 + C4, forces WAIT task)",
      "color": "black",
      "produced_qty": 967,
      "used_hours": 10.744444444444445,
      "start_hour": 7.102777777777778,
      "end_hour": 17.84722222222222,
      "start_hour_clock": 11.102777777777778,
      "end_hour_clock": 21.84722222222222,
      "start_time": "11:06:10",
      "end_time": "21:50:50",
      "start_datetime": "2026-01-02T11:06:10",
      "end_datetime": "2026-01-02T21:50:50",
      "utilization": 0.6019296607531903
    },
    {
      "day": 3,
      "date": "2026-01-03",
      "machine_id": "M1",
      "machine_name": "Small-01",
      "machine_group": "small",
      "sequence_in_day": 1,
      "task_type": "PRODUCE",
      "mold_id": "MO1",
      "component_id": "C1",
      "component_name": "Base Part (multi-day workload)",
      "color": "black",
      "produced_qty": 1846,
      "used_hours": 10.255555555555556,
      "start_hour": 0,
      "end_hour": 10.255555555555556,
      "start_hour_clock": 4,
      "end_hour_clock": 14.255555555555556,
      "start_time": "04:00:00",
      "end_time": "14:15:20",
      "start_datetime": "2026-01-03T04:00:00",
      "end_datetime": "2026-01-03T14:15:20",
      "utilization": 0.5745409274821041
    },
    {
      "day": 3,
      "date": "2026-01-03",
      "machine_id": "M2",
      "machine_name": "Small-02",
      "machine_group": "small",
      "sequence_in_day": 1,
      "task_type": "CHANGE_COLOR",
      "from_color": "red",
      "to_color": "white",
      "used_hours": 0.5,
      "start_hour": 0,
      "end_hour": 0.5,
      "start_hour_clock": 4,
      "end_hour_clock": 4.5,
      "start_time": "04:00:00",
      "end_time": "04:30:00",
      "start_datetime": "2026-01-03T04:00:00",
      "end_datetime": "2026-01-03T04:30:00",
      "utilization": 0.02801120448179272
    },
    {
      "day": 3,
      "date": "2026-01-03",
      "machine_id": "M2",
      "machine_name": "Small-02",
      "machine_group": "small",
      "sequence_in_day": 2,
      "task_type": "CHANGE_MOLD",
      "from_mold_id": "MO3",
      "to_mold_id": "MO2",
      "used_hours": 1,
      "start_hour": 0.5,
      "end_hour": 1.5,
      "start_hour_clock": 4.5,
      "end_hour_clock": 5.5,
      "start_time": "04:30:00",
      "end_time": "05:30:00",
      "start_datetime": "2026-01-03T04:30:00",
      "end_datetime": "2026-01-03T05:30:00",
      "utilization": 0.05602240896358544
    },
    {
      "day": 3,
      "date": "2026-01-03",
      "machine_id": "M2",
      "machine_name": "Small-02",
      "machine_group": "small",
      "sequence_in_day": 3,
      "task_type": "WAIT",
      "used_hours": 8.755555555555556,
      "start_hour": 1.5,
      "end_hour": 10.255555555555556,
      "start_hour_clock": 5.5,
      "end_hour_clock": 14.255555555555556,
      "start_time": "05:30:00",
      "end_time": "14:15:20",
      "start_datetime": "2026-01-03T05:30:00",
      "end_datetime": "2026-01-03T14:15:20",
      "utilization": 0.4905073140367259
    },
    {
      "day": 3,
      "date": "2026-01-03",
      "machine_id": "M2",
      "machine_name": "Small-02",
      "machine_group": "small",
      "sequence_in_day": 4,
      "task_type": "TRANSFER",
      "component_id": "C2",
      "component_name": "Cover (wait_all on C1 + transfer)",
      "used_hours": 2,
      "start_hour": 10.255555555555556,
      "end_hour": 12.255555555555556,
      "start_hour_clock": 14.255555555555556,
      "end_hour_clock": 16.255555555555556,
      "start_time": "14:15:20",
      "end_time": "16:15:20",
      "start_datetime": "2026-01-03T14:15:20",
      "end_datetime": "2026-01-03T16:15:20",
      "utilization": 0.11204481792717089
    },
    {
      "day": 3,
      "date": "2026-01-03",
      "machine_id": "M2",
      "machine_name": "Small-02",
      "machine_group": "small",
      "sequence_in_day": 5,
      "task_type": "PRODUCE",
      "mold_id": "MO2",
      "component_id": "C2",
      "component_name": "Cover (wait_all on C1 + transfer)",
      "color": "white",
      "produced_qty": 671,
      "used_hours": 5.591666666666667,
      "start_hour": 12.255555555555556,
      "end_hour": 17.84722222222222,
      "start_hour_clock": 16.255555555555556,
      "end_hour_clock": 21.84722222222222,
      "start_time": "16:15:20",
      "end_time": "21:50:50",
      "start_datetime": "2026-01-03T16:15:20",
      "end_datetime": "2026-01-03T21:50:50",
      "utilization": 0.3132586367880486
    },
    {
      "day": 3,
      "date": "2026-01-03",
      "machine_id": "M3",
      "machine_name": "Medium-01",
      "machine_group": "medium",
      "sequence_in_day": 1,
      "task_type": "PRODUCE",
      "mold_id": "MO5",
      "component_id": "C5",
      "component_name": "Frame (wait_all on C3 + C4, forces WAIT task)",
      "color": "black",
      "produced_qty": 533,
      "used_hours": 5.9222222222222225,
      "start_hour": 0,
      "end_hour": 5.9222222222222225,
      "start_hour_clock": 4,
      "end_hour_clock": 9.922222222222222,
      "start_time": "04:00:00",
      "end_time": "09:55:20",
      "start_datetime": "2026-01-03T04:00:00",
      "end_datetime": "2026-01-03T09:55:20",
      "utilization": 0.33177715530656715
    },
    {
      "day": 4,
      "date": "2026-01-04",
      "machine_id": "M2",
      "machine_name": "Small-02",
      "machine_group": "small",
      "sequence_in_day": 1,
      "task_type": "PRODUCE",
      "mold_id": "MO2",
      "component_id": "C2",
      "component_name": "Cover (wait_all on C1 + transfer)",
      "color": "white",
      "produced_qty": 2141,
      "used_hours": 17.841666666666665,
      "start_hour": 0,
      "end_hour": 17.841666666666665,
      "start_hour_clock": 4,
      "end_hour_clock": 21.841666666666665,
      "start_time": "04:00:00",
      "end_time": "21:50:30",
      "start_datetime": "2026-01-04T04:00:00",
      "end_datetime": "2026-01-04T21:50:30",
      "utilization": 0.9995331465919701
    },
    {
      "day": 5,
      "date": "2026-01-05",
      "machine_id": "M2",
      "machine_name": "Small-02",
      "machine_group": "small",
      "sequence_in_day": 1,
      "task_type": "PRODUCE",
      "mold_id": "MO2",
      "component_id": "C2",
      "component_name": "Cover (wait_all on C1 + transfer)",
      "color": "white",
      "produced_qty": 188,
      "used_hours": 1.5666666666666667,
      "start_hour": 0,
      "end_hour": 1.5666666666666667,
      "start_hour_clock": 4,
      "end_hour_clock": 5.566666666666666,
      "start_time": "04:00:00",
      "end_time": "05:34:00",
      "start_datetime": "2026-01-05T04:00:00",
      "end_datetime": "2026-01-05T05:34:00",
      "utilization": 0.08776844070961719
    }
  ],
  "unmet": {},
  "score": 116491.22222222222
}