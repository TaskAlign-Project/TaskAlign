import type { Assignment } from "./types"

// ---- Absolute time conversion ----
// Each day has 24 conceptual hours. We convert day+hour to an absolute hour offset.
export function toAbsoluteHour(day: number, hour: number): number {
  return (day - 1) * 24 + hour
}

// ---- Date helpers ----
// Converts a day number to a real calendar date based on a start date
export function dayToDate(day: number, startDate: string): Date {
  const start = new Date(startDate)
  const result = new Date(start)
  result.setDate(start.getDate() + day - 1)
  return result
}

// Formats a date as "1 Jan 2026"
export function formatDateShort(date: Date): string {
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

// Formats a day number as a calendar date string
export function formatDayAsDate(day: number, startDate: string): string {
  return formatDateShort(dayToDate(day, startDate))
}

// ---- AM/PM time formatting ----
// Converts a decimal hour (0-24) to AM/PM format string
export function formatHourAMPM(hour: number): string {
  const h = Math.floor(hour) % 24
  const m = Math.round((hour - Math.floor(hour)) * 60)
  const period = h >= 12 ? "PM" : "AM"
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  if (m === 0) {
    return `${h12}:00 ${period}`
  }
  return `${h12}:${m.toString().padStart(2, "0")} ${period}`
}

// Formats hour for tick display (shorter version)
// absHour is absolute hour from day 1, so we need to get the hour within the day
export function formatTickHour(absHour: number): string {
  const hourInDay = ((absHour % 24) + 24) % 24 // Ensure positive modulo
  const period = hourInDay >= 12 ? "PM" : "AM"
  const h12 = hourInDay === 0 ? 12 : hourInDay > 12 ? hourInDay - 12 : hourInDay
  return `${h12}${period}`
}

export interface GanttTimeRange {
  minDay: number
  maxDay: number
  rangeStart: number // absolute hour (start of first day = 0)
  rangeEnd: number   // absolute hour (end of last day = 24)
  totalHours: number
}

export function computeTimeRange(assignments: Assignment[]): GanttTimeRange {
  if (assignments.length === 0) {
    // Single day: 0-24 hours
    return { minDay: 1, maxDay: 1, rangeStart: 0, rangeEnd: 24, totalHours: 24 }
  }
  const days = assignments.map((a) => a.day)
  const minDay = Math.min(...days)
  const maxDay = Math.max(...days)
  // Each day spans 0-24 hours within its own column
  const rangeStart = (minDay - 1) * 24
  const rangeEnd = maxDay * 24
  return { minDay, maxDay, rangeStart, rangeEnd, totalHours: rangeEnd - rangeStart }
}

// ---- Grouping by machine ----
export interface GanttMachineRow {
  machineId: string
  machineName: string
  tasks: SplitTask[]
}

export function groupByMachine(assignments: Assignment[]): GanttMachineRow[] {
  // First split tasks that span multiple days
  const splitTasks = splitTasksAcrossDays(assignments)
  
  const map = new Map<string, GanttMachineRow>()
  for (const task of splitTasks) {
    if (!map.has(task.machine_id)) {
      map.set(task.machine_id, {
        machineId: task.machine_id,
        machineName: task.machine_name,
        tasks: [],
      })
    }
    map.get(task.machine_id)!.tasks.push(task)
  }
  // Sort tasks within each machine by absolute start
  for (const row of map.values()) {
    row.tasks.sort(
      (a, b) =>
        toAbsoluteHour(a.day, a.displayStartHour) -
        toAbsoluteHour(b.day, b.displayStartHour)
    )
  }
  return [...map.values()].sort((a, b) =>
    a.machineId.localeCompare(b.machineId)
  )
}

// ---- Bar position helpers ----
// These calculate position as percentage of total timeline width
// Tasks are already split by day, so displayStartHour/displayEndHour are within 0-24
export function barLeftPercent(
  task: SplitTask,
  range: GanttTimeRange
): number {
  // Clamp start hour to day boundaries (0-24)
  const clampedStart = Math.max(0, Math.min(24, task.displayStartHour))
  const absStart = toAbsoluteHour(task.day, clampedStart)
  return ((absStart - range.rangeStart) / range.totalHours) * 100
}

export function barWidthPercent(
  task: SplitTask,
  range: GanttTimeRange
): number {
  // Clamp both hours to day boundaries (0-24)
  const clampedStart = Math.max(0, Math.min(24, task.displayStartHour))
  const clampedEnd = Math.max(0, Math.min(24, task.displayEndHour))
  const absStart = toAbsoluteHour(task.day, clampedStart)
  const absEnd = toAbsoluteHour(task.day, clampedEnd)
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
    case "TRANSFER":
      return "Transfer"
    default:
      return task.task_type
  }
}

// ---- Split tasks that span across days ----
// This ensures no task visually extends beyond its day boundary (0-24 hours)
export interface SplitTask extends Assignment {
  originalTask: Assignment
  splitIndex: number
  totalSplits: number
  displayStartHour: number // Hour within the day (0-24), clamped
  displayEndHour: number   // Hour within the day (0-24), clamped
}

export function splitTasksAcrossDays(tasks: Assignment[]): SplitTask[] {
  const result: SplitTask[] = []
  
  for (const task of tasks) {
    const startDay = task.day
    let startHour = task.start_hour_clock
    let endHour = task.end_hour_clock
    
    // Normalize negative start hours (shouldn't happen but just in case)
    if (startHour < 0) startHour = 0
    
    // If task fits within a single day (0-24 hours), no splitting needed
    if (endHour <= 24 && startHour >= 0) {
      result.push({
        ...task,
        originalTask: task,
        splitIndex: 0,
        totalSplits: 1,
        displayStartHour: Math.max(0, Math.min(24, startHour)),
        displayEndHour: Math.max(0, Math.min(24, endHour)),
      })
    } else {
      // Task spans multiple days - split it into day-sized chunks
      const totalDuration = endHour - startHour
      let remainingHours = totalDuration
      let currentDay = startDay
      let currentStartHour = startHour
      let splitIndex = 0
      
      // Calculate total splits needed
      const totalSplits = Math.ceil((startHour + totalDuration) / 24) - Math.floor(startHour / 24)
      
      while (remainingHours > 0.001) { // Use small epsilon to avoid floating point issues
        // Clamp current start hour to 0-24 range for this day
        const dayStartHour = Math.max(0, currentStartHour % 24)
        const hoursUntilEndOfDay = 24 - dayStartHour
        const hoursThisDay = Math.min(remainingHours, hoursUntilEndOfDay)
        const dayEndHour = dayStartHour + hoursThisDay
        
        // Only add if there's actual duration in this day
        if (hoursThisDay > 0.001) {
          result.push({
            ...task,
            day: currentDay,
            start_hour_clock: dayStartHour,
            end_hour_clock: dayEndHour,
            used_hours: hoursThisDay,
            originalTask: task,
            splitIndex,
            totalSplits,
            displayStartHour: Math.max(0, Math.min(24, dayStartHour)),
            displayEndHour: Math.max(0, Math.min(24, dayEndHour)),
          })
          splitIndex += 1
        }
        
        remainingHours -= hoursThisDay
        currentDay += 1
        currentStartHour = 0 // Next day starts at hour 0
      }
    }
  }
  
  return result
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
    // Day column spans full 24 hours (0-24) within that day
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
  // Generate ticks at regular intervals starting from rangeStart
  for (let h = range.rangeStart; h <= range.rangeEnd; h += interval) {
    ticks.push(h)
  }
  return ticks
}
