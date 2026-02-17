import type { Assignment } from "./types"

// ---- Absolute time conversion ----
// Each day has 24 conceptual hours. We convert day+hour to an absolute hour offset.
export function toAbsoluteHour(day: number, hour: number): number {
  return (day - 1) * 24 + hour
}

export interface GanttTimeRange {
  minDay: number
  maxDay: number
  rangeStart: number // absolute hour
  rangeEnd: number   // absolute hour
  totalHours: number
}

export function computeTimeRange(assignments: Assignment[]): GanttTimeRange {
  if (assignments.length === 0) {
    return { minDay: 1, maxDay: 1, rangeStart: 0, rangeEnd: 24, totalHours: 24 }
  }
  const days = assignments.map((a) => a.day)
  const minDay = Math.min(...days)
  const maxDay = Math.max(...days)
  const rangeStart = (minDay - 1) * 24
  const rangeEnd = maxDay * 24
  return { minDay, maxDay, rangeStart, rangeEnd, totalHours: rangeEnd - rangeStart }
}

// ---- Grouping by machine ----
export interface GanttMachineRow {
  machineId: string
  machineName: string
  tasks: Assignment[]
}

export function groupByMachine(assignments: Assignment[]): GanttMachineRow[] {
  const map = new Map<string, GanttMachineRow>()
  for (const a of assignments) {
    if (!map.has(a.machine_id)) {
      map.set(a.machine_id, {
        machineId: a.machine_id,
        machineName: a.machine_name,
        tasks: [],
      })
    }
    map.get(a.machine_id)!.tasks.push(a)
  }
  // Sort tasks within each machine by absolute start
  for (const row of map.values()) {
    row.tasks.sort(
      (a, b) =>
        toAbsoluteHour(a.day, a.start_hour) -
        toAbsoluteHour(b.day, b.start_hour)
    )
  }
  return [...map.values()].sort((a, b) =>
    a.machineId.localeCompare(b.machineId)
  )
}

// ---- Bar position helpers ----
export function barLeftPercent(
  task: Assignment,
  range: GanttTimeRange
): number {
  const absStart = toAbsoluteHour(task.day, task.start_hour)
  return ((absStart - range.rangeStart) / range.totalHours) * 100
}

export function barWidthPercent(
  task: Assignment,
  range: GanttTimeRange
): number {
  const absStart = toAbsoluteHour(task.day, task.start_hour)
  const absEnd = toAbsoluteHour(task.day, task.end_hour)
  return Math.max(((absEnd - absStart) / range.totalHours) * 100, 0.3)
}

// ---- Bar labels (truncated) ----
export function barLabel(task: Assignment): string {
  switch (task.task_type) {
    case "PRODUCE":
      return `${task.component_id ?? ""} x${task.produced_qty?.toLocaleString() ?? 0}`
    case "CHANGE_MOLD":
      return task.to_mold_id ?? "Mold"
    case "CHANGE_COLOR":
      return task.to_color ?? "Color"
    case "WAIT":
      return "WAIT"
    default:
      return task.task_type
  }
}

// ---- Day/hour grid generation ----
export interface DayColumn {
  day: number
  startHour: number // absolute
  endHour: number   // absolute
}

export function generateDayColumns(range: GanttTimeRange): DayColumn[] {
  const cols: DayColumn[] = []
  for (let d = range.minDay; d <= range.maxDay; d++) {
    cols.push({
      day: d,
      startHour: (d - 1) * 24,
      endHour: d * 24,
    })
  }
  return cols
}

export function generateHourTicks(
  range: GanttTimeRange,
  interval: number = 4
): number[] {
  const ticks: number[] = []
  for (let h = range.rangeStart; h <= range.rangeEnd; h += interval) {
    ticks.push(h)
  }
  return ticks
}
