import * as XLSX from "xlsx"
import type { PlanMachine, Mold, Component, MachineStatus } from "./types"

// Expected column headers for each type
export const MACHINE_COLUMNS = [
  "id",
  "name",
  "group",
  "tonnage",
  "hours_per_day",
  "efficiency",
  "status",
] as const

export const MOLD_COLUMNS = [
  "id",
  "name",
  "group",
  "tonnage",
  "component_ids",
] as const

export const COMPONENT_COLUMNS = [
  "id",
  "name",
  "quantity",
  "finished",
  "cycle_time_sec",
  "mold_id",
  "color",
  "start_date",
  "due_date",
  "lead_time_days",
  "prerequisites",
  "dependency_mode",
  "transfer_time_minutes",
  "order_codes",
] as const

export type ImportType = "machines" | "molds" | "components"

export interface ImportResult<T> {
  success: boolean
  data: T[]
  errors: string[]
  warnings: string[]
}

function parseArrayField(value: unknown): string[] {
  if (!value) return []
  if (Array.isArray(value)) return value.map(String)
  const str = String(value).trim()
  if (!str) return []
  // Support comma-separated or semicolon-separated values
  return str.split(/[,;]/).map((s) => s.trim()).filter(Boolean)
}

function parseGroup(value: unknown): "small" | "medium" | "large" {
  const str = String(value).toLowerCase().trim()
  if (str === "small" || str === "medium" || str === "large") return str
  return "small"
}

function parseStatus(value: unknown): MachineStatus {
  const str = String(value).toLowerCase().trim()
  if (str === "unavailable") return "unavailable"
  return "available"
}

function parseDependencyMode(value: unknown): "wait" | "parallel" {
  const str = String(value).toLowerCase().trim()
  if (str === "parallel") return "parallel"
  return "wait"
}

function parseDate(value: unknown): string {
  if (!value) return new Date().toISOString().split("T")[0]
  
  // If it's already a valid date string
  if (typeof value === "string") {
    const trimmed = value.trim()
    // Check if it's already in YYYY-MM-DD format
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed
    // Try to parse other date formats
    const date = new Date(trimmed)
    if (!isNaN(date.getTime())) {
      return date.toISOString().split("T")[0]
    }
  }
  
  // Excel stores dates as numbers (days since 1900-01-01)
  if (typeof value === "number") {
    const date = XLSX.SSF.parse_date_code(value)
    if (date) {
      const month = String(date.m).padStart(2, "0")
      const day = String(date.d).padStart(2, "0")
      return `${date.y}-${month}-${day}`
    }
  }
  
  return new Date().toISOString().split("T")[0]
}

export function parseMachinesFromExcel(file: File): Promise<ImportResult<PlanMachine>> {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer)
        const workbook = XLSX.read(data, { type: "array", cellDates: true })
        const sheetName = workbook.SheetNames[0]
        const worksheet = workbook.Sheets[sheetName]
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet)

        const machines: PlanMachine[] = []
        const errors: string[] = []
        const warnings: string[] = []

        rows.forEach((row, index) => {
          const rowNum = index + 2 // +2 for header row and 0-index
          
          // Normalize column names (case-insensitive, trim whitespace)
          const normalizedRow: Record<string, unknown> = {}
          for (const [key, value] of Object.entries(row)) {
            normalizedRow[key.toLowerCase().trim().replace(/\s+/g, "_")] = value
          }
          
          const id = String(normalizedRow.id ?? "").trim()
          if (!id) {
            errors.push(`Row ${rowNum}: Missing required field "id"`)
            return
          }
          
          const name = String(normalizedRow.name ?? id).trim()
          const group = parseGroup(normalizedRow.group)
          const tonnage = Number(normalizedRow.tonnage) || 0
          const hours_per_day = Number(normalizedRow.hours_per_day ?? normalizedRow.hoursperday ?? 24) || 24
          const efficiency = Number(normalizedRow.efficiency) || 1
          const status = parseStatus(normalizedRow.status)
          
          if (tonnage <= 0) {
            warnings.push(`Row ${rowNum}: Tonnage is 0 or negative`)
          }
          
          machines.push({
            id,
            name,
            group,
            tonnage,
            hours_per_day,
            efficiency,
            status,
          })
        })

        resolve({ success: errors.length === 0, data: machines, errors, warnings })
      } catch (err) {
        resolve({
          success: false,
          data: [],
          errors: [`Failed to parse Excel file: ${err instanceof Error ? err.message : "Unknown error"}`],
          warnings: [],
        })
      }
    }
    reader.onerror = () => {
      resolve({
        success: false,
        data: [],
        errors: ["Failed to read file"],
        warnings: [],
      })
    }
    reader.readAsArrayBuffer(file)
  })
}

export function parseMoldsFromExcel(file: File): Promise<ImportResult<Mold>> {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer)
        const workbook = XLSX.read(data, { type: "array", cellDates: true })
        const sheetName = workbook.SheetNames[0]
        const worksheet = workbook.Sheets[sheetName]
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet)

        const molds: Mold[] = []
        const errors: string[] = []
        const warnings: string[] = []

        rows.forEach((row, index) => {
          const rowNum = index + 2
          
          const normalizedRow: Record<string, unknown> = {}
          for (const [key, value] of Object.entries(row)) {
            normalizedRow[key.toLowerCase().trim().replace(/\s+/g, "_")] = value
          }
          
          const id = String(normalizedRow.id ?? "").trim()
          if (!id) {
            errors.push(`Row ${rowNum}: Missing required field "id"`)
            return
          }
          
          const name = String(normalizedRow.name ?? id).trim()
          const group = parseGroup(normalizedRow.group)
          const tonnage = Number(normalizedRow.tonnage) || 0
          const component_ids = parseArrayField(normalizedRow.component_ids ?? normalizedRow.componentids ?? normalizedRow.components)
          
          if (tonnage <= 0) {
            warnings.push(`Row ${rowNum}: Tonnage is 0 or negative`)
          }
          
          molds.push({
            id,
            name,
            group,
            tonnage,
            component_ids,
          })
        })

        resolve({ success: errors.length === 0, data: molds, errors, warnings })
      } catch (err) {
        resolve({
          success: false,
          data: [],
          errors: [`Failed to parse Excel file: ${err instanceof Error ? err.message : "Unknown error"}`],
          warnings: [],
        })
      }
    }
    reader.onerror = () => {
      resolve({
        success: false,
        data: [],
        errors: ["Failed to read file"],
        warnings: [],
      })
    }
    reader.readAsArrayBuffer(file)
  })
}

export function parseComponentsFromExcel(file: File): Promise<ImportResult<Component>> {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer)
        const workbook = XLSX.read(data, { type: "array", cellDates: true })
        const sheetName = workbook.SheetNames[0]
        const worksheet = workbook.Sheets[sheetName]
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet)

        const components: Component[] = []
        const errors: string[] = []
        const warnings: string[] = []

        rows.forEach((row, index) => {
          const rowNum = index + 2
          
          const normalizedRow: Record<string, unknown> = {}
          for (const [key, value] of Object.entries(row)) {
            normalizedRow[key.toLowerCase().trim().replace(/\s+/g, "_")] = value
          }
          
          const id = String(normalizedRow.id ?? "").trim()
          if (!id) {
            errors.push(`Row ${rowNum}: Missing required field "id"`)
            return
          }
          
          const name = String(normalizedRow.name ?? id).trim()
          const quantity = Number(normalizedRow.quantity ?? normalizedRow.qty) || 0
          const finished = Number(normalizedRow.finished) || 0
          const cycle_time_sec = Number(normalizedRow.cycle_time_sec ?? normalizedRow.cycletimesec ?? normalizedRow.cycle_time) || 0
          const mold_id = String(normalizedRow.mold_id ?? normalizedRow.moldid ?? normalizedRow.mold ?? "").trim()
          const color = String(normalizedRow.color ?? "").trim()
          const start_date = parseDate(normalizedRow.start_date ?? normalizedRow.startdate ?? normalizedRow.start)
          const due_date = parseDate(normalizedRow.due_date ?? normalizedRow.duedate ?? normalizedRow.due)
          const lead_time_days = Number(normalizedRow.lead_time_days ?? normalizedRow.leadtimedays ?? normalizedRow.lead_time ?? 0)
          const prerequisites = parseArrayField(normalizedRow.prerequisites ?? normalizedRow.deps ?? normalizedRow.dependencies)
          const dependency_mode = parseDependencyMode(normalizedRow.dependency_mode ?? normalizedRow.dependencymode ?? normalizedRow.dep_mode)
          const transfer_time_minutes = Number(normalizedRow.transfer_time_minutes ?? normalizedRow.transfertimeminutes ?? normalizedRow.transfer_time ?? 0)
          const order_codes = parseArrayField(normalizedRow.order_codes ?? normalizedRow.ordercodes ?? normalizedRow.orders)
          
          if (quantity <= 0) {
            warnings.push(`Row ${rowNum}: Quantity is 0 or negative`)
          }
          if (cycle_time_sec <= 0) {
            warnings.push(`Row ${rowNum}: Cycle time is 0 or negative`)
          }
          if (!mold_id) {
            warnings.push(`Row ${rowNum}: Mold ID is empty`)
          }
          
          components.push({
            id,
            name,
            quantity,
            finished,
            cycle_time_sec,
            mold_id,
            color,
            start_date,
            due_date,
            lead_time_days,
            prerequisites,
            dependency_mode,
            transfer_time_minutes,
            order_codes,
          })
        })

        resolve({ success: errors.length === 0, data: components, errors, warnings })
      } catch (err) {
        resolve({
          success: false,
          data: [],
          errors: [`Failed to parse Excel file: ${err instanceof Error ? err.message : "Unknown error"}`],
          warnings: [],
        })
      }
    }
    reader.onerror = () => {
      resolve({
        success: false,
        data: [],
        errors: ["Failed to read file"],
        warnings: [],
      })
    }
    reader.readAsArrayBuffer(file)
  })
}

// Generate a sample Excel template
export function generateTemplate(type: ImportType): void {
  const wb = XLSX.utils.book_new()
  let ws: XLSX.WorkSheet
  let filename: string

  switch (type) {
    case "machines":
      ws = XLSX.utils.json_to_sheet([
        { id: "M1", name: "Machine 1", group: "small", tonnage: 100, hours_per_day: 24, efficiency: 0.9, status: "available" },
        { id: "M2", name: "Machine 2", group: "medium", tonnage: 200, hours_per_day: 24, efficiency: 0.85, status: "available" },
      ])
      filename = "machines_template.xlsx"
      break
    case "molds":
      ws = XLSX.utils.json_to_sheet([
        { id: "MLD1", name: "Mold 1", group: "small", tonnage: 60, component_ids: "C1,C2" },
        { id: "MLD2", name: "Mold 2", group: "medium", tonnage: 150, component_ids: "C3" },
      ])
      filename = "molds_template.xlsx"
      break
    case "components":
      ws = XLSX.utils.json_to_sheet([
        { id: "C1", name: "Part A", quantity: 1000, finished: 0, cycle_time_sec: 30, mold_id: "MLD1", color: "white", start_date: "2026-01-01", due_date: "2026-01-10", lead_time_days: 2, prerequisites: "", dependency_mode: "wait", transfer_time_minutes: 0, order_codes: "ORD-001" },
        { id: "C2", name: "Part B", quantity: 500, finished: 0, cycle_time_sec: 45, mold_id: "MLD1", color: "blue", start_date: "2026-01-05", due_date: "2026-01-15", lead_time_days: 3, prerequisites: "C1", dependency_mode: "wait", transfer_time_minutes: 30, order_codes: "ORD-001,ORD-002" },
      ])
      filename = "components_template.xlsx"
      break
  }

  XLSX.utils.book_append_sheet(wb, ws, "Data")
  XLSX.writeFile(wb, filename)
}
