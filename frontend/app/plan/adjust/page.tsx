// adjust/page.tsx

"use client"

import { useEffect, useState, useMemo, useCallback, useRef } from "react"
import Link from "next/link"
import {
  ArrowLeft,
  RotateCcw,
  Save,
  CheckCircle,
  AlertTriangle,
  FileQuestion,
  FlaskConical,
  Search,
  History,
  Info,
  X,
  GripVertical,
  Undo2,
  Copy,
} from "lucide-react"
import { AppHeader } from "@/components/app-header"
import { NoPlanState } from "@/components/no-plan-state"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import type { Assignment, Plan, PlanRun, PlanMachine } from "@/lib/types"
import {
  getActivePlan,
  getCurrentRun,
  setCurrentRun,
  addDemoRunToActivePlan,
  getPlanById,
} from "@/lib/storage"
import {
  computeTimeRange,
  generateDayColumns,
  formatHourAMPM,
  formatDayAsDate,
  toAbsoluteHour,
  type GanttTimeRange,
} from "@/lib/gantt"

// ---- Constants ----
const ROW_HEIGHT = 52
const HEADER_HEIGHT = 32
const LABEL_WIDTH = 180
const SNAP_MINUTES = 15
const SNAP_HOURS = SNAP_MINUTES / 60

// ---- Task bar colors - ALL types are now draggable ----
const GANTT_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  PRODUCE: { bg: "bg-emerald-500", border: "border-emerald-600", text: "text-emerald-50" },
  TRANSFER: { bg: "bg-purple-500", border: "border-purple-600", text: "text-purple-50" },
  WAIT: { bg: "bg-zinc-400", border: "border-zinc-500", text: "text-zinc-50" },
  CHANGE_MOLD: { bg: "bg-amber-500", border: "border-amber-600", text: "text-amber-50" },
  CHANGE_COLOR: { bg: "bg-sky-500", border: "border-sky-600", text: "text-sky-50" },
}

// ---- Zoom presets ----
const ZOOM_PRESETS = [
  { label: "50%", pxPerHour: 20 },
  { label: "100%", pxPerHour: 40 },
  { label: "150%", pxPerHour: 60 },
] as const

// ---- Validation types ----
interface ValidationResult {
  valid: boolean
  violations: ValidationViolation[]
}

interface ValidationViolation {
  severity: "error" | "warning"
  type: string
  message: string
  taskIndex?: number
}

// ---- Editable assignment (with tracking) ----
interface EditableAssignment extends Assignment {
  _originalIndex: number
  _modified: boolean
}

// ---- Time formatting helpers ----
function formatTimeHHMM(hour: number): string {
  const h = Math.floor(hour)
  const m = Math.round((hour - h) * 60)
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`
}

function parseTimeToHour(time: string): number {
  const [h, m] = time.split(":").map(Number)
  return h + (m || 0) / 60
}

function formatDateFromDay(day: number, startDate: string): string {
  const [y, m, d] = startDate.split("-").map(Number)
  const base = new Date(y, m - 1, d + day - 1)
  const yy = base.getFullYear()
  const mm = String(base.getMonth() + 1).padStart(2, "0")
  const dd = String(base.getDate()).padStart(2, "0")
  return `${yy}-${mm}-${dd}`
  // const base = new Date(startDate)
  // base.setDate(base.getDate() + day - 1)
  // return base.toISOString().split("T")[0]
}

function dayFromDate(date: string, startDate: string): number {
  const [sy, sm, sd] = startDate.split("-").map(Number)
  const [ty, tm, td] = date.split("-").map(Number)
  const start = new Date(sy, sm - 1, sd)
  const target = new Date(ty, tm - 1, td)
  const diff = Math.floor((target.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
  return diff + 1
  // const start = new Date(startDate)
  // const target = new Date(date)
  // const diff = Math.floor((target.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
  // return diff + 1
}

export default function AdjustPage() {
  const [plan, setPlan] = useState<Plan | null>(null)
  const [currentRun, setCurrentRunState] = useState<PlanRun | null>(null)
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [machines, setMachines] = useState<PlanMachine[]>([])

  useEffect(() => {
    const activePlan = getActivePlan()
    setPlan(activePlan)

    if (activePlan) {
      const baseUrl = "http://localhost:8000"

      // Fetch machines
      fetch(`${baseUrl}/api/v1/machines`)
        .then((res) => res.json())
        .then((data: any[]) => {
          // DB returns { id, code, name, group, status, ... }
          // Normalize to PlanMachine shape (id = code)
          setMachines(data.map(m => ({
            id: m.code ?? m.id,
            name: m.name,
            group: m.group,
            tonnage: m.tonnage,
            hours_per_day: m.hours_per_day,
            efficiency: m.efficiency,
            status: m.status,
          })))
        })
        .catch((err) => console.error("Failed to fetch machines:", err))

      // Fetch runs (existing code)
      // Fetch runs
      fetch(`${baseUrl}/api/v1/plans/${activePlan.id}/runs`)
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          return res.json()
        })
        .then((runs: any[]) => {
          if (runs && runs.length > 0) {
            const latestRun = runs[0]
            const normalizedRun = {
              ...latestRun,
              assignments: (latestRun.assignments ?? []).map(normalizeAssignment),
            }
            setCurrentRunState(normalizedRun)
            setSelectedRunId(latestRun.id)
            setPlan((prev) => prev ? { ...prev, runs } : prev)
          }
        })
        .catch((err) => console.error("Failed to fetch runs:", err))
        .finally(() => setLoaded(true))
    } else {
      setLoaded(true)
    }
  }, [])

  async function handleRunChange(runId: string) {
    if (!plan) return
    const baseUrl = "http://localhost:8000"
    try {
      const res = await fetch(`${baseUrl}/api/v1/runs/${runId}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const run = await res.json()
      const normalizedRun = {
        ...run,
        assignments: (run.assignments ?? []).map(normalizeAssignment),
      }
      setCurrentRunState(normalizedRun)
      setSelectedRunId(runId)
      toast.success("Switched to selected run")
    } catch {
      toast.error("Failed to load run")
    }
  }

  function loadDemo() {
    const run = addDemoRunToActivePlan()
    if (run && plan) {
      const updatedPlan = getPlanById(plan.id)
      if (updatedPlan) {
        setPlan(updatedPlan)
        setCurrentRunState(run)
        setSelectedRunId(run.id)
      }
      toast.success("Demo run added to current plan")
    } else {
      toast.error("Could not add demo run - no active plan")
    }
  }

  if (!loaded) return null

  if (!plan) {
    return (
      <div className="flex flex-col h-full">
        <AppHeader
          title="Adjust Production Plan (Manual)"
          description="Edit tasks to adjust timing and machine allocation"
        />
        <NoPlanState description="Select or create a plan to adjust the schedule." />
      </div>
    )
  }

  if (!currentRun) {
    return (
      <div className="flex flex-col h-full">
        <AppHeader
          title="Adjust Production Plan (Manual)"
          description={`Adjusting "${plan.name}"`}
        />
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="flex flex-col items-center gap-4 text-center max-w-sm">
            <div className="flex items-center justify-center w-14 h-14 rounded-full bg-muted">
              <FileQuestion className="h-7 w-7 text-muted-foreground" />
            </div>
            <h2 className="text-lg font-semibold text-card-foreground">
              No schedule runs yet
            </h2>
            <p className="text-sm text-muted-foreground">
              Run the scheduler first or load demo data to adjust the timeline.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Button asChild>
                <Link href="/plan">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Run Scheduler
                </Link>
              </Button>
              <Button variant="outline" onClick={loadDemo}>
                <FlaskConical className="mr-2 h-4 w-4" />
                Load Demo Result
              </Button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // In AdjustPage return:
  return (
    <AdjustContent
      plan={plan}
      currentRun={currentRun}
      selectedRunId={selectedRunId}
      onRunChange={handleRunChange}
      // onLoadDemo={loadDemo}
      machines={machines}   // ← add this
    />
  )
}

// ---- Main adjust content ----
function AdjustContent({
  plan,
  currentRun,
  selectedRunId,
  onRunChange,
  machines,             // ← add
}: {
  plan: Plan
  currentRun: PlanRun
  selectedRunId: string | null
  onRunChange: (runId: string) => void
  // onLoadDemo: () => void
  machines: PlanMachine[]   // ← add
}) {
  const startDate =
    currentRun.request_snapshot?.current_date ??
    (plan as any).current_date ??               // DB plan has current_date at top level
    plan.setup?.current_date ??
    "2026-01-01"
  
  const originalAssignments = useMemo(
    () => (currentRun as any).assignments ?? [],
    [currentRun]
  )

  // Editable assignments state
  const [assignments, setAssignments] = useState<EditableAssignment[]>(() =>
    originalAssignments.map((a, i) => ({
      ...a,
      _originalIndex: i,
      _modified: false,
    }))
  )

  // Reset when run changes
  useEffect(() => {
    setAssignments(
      originalAssignments.map((a, i) => ({
        ...a,
        _originalIndex: i,
        _modified: false,
      }))
    )
    setSelectedTaskIndex(null)
    setValidationResult(null)
  }, [originalAssignments])

  // Filters
  const [filterDayStart, setFilterDayStart] = useState("all")
  const [filterDayEnd, setFilterDayEnd] = useState("all")
  const [filterMachineGroup, setFilterMachineGroup] = useState("all")
  const [searchQuery, setSearchQuery] = useState("")
  const [zoomIdx, setZoomIdx] = useState(1)

  // UI State
  const [selectedTaskIndex, setSelectedTaskIndex] = useState<number | null>(null)
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null)
  const [validating, setValidating] = useState(false)

  const pxPerHour = ZOOM_PRESETS[zoomIdx].pxPerHour

  // Get selected task
  const selectedTask = selectedTaskIndex !== null 
    ? assignments.find(a => a._originalIndex === selectedTaskIndex) ?? null 
    : null

  // Check if there are unsaved changes
  const hasChanges = useMemo(
    () => assignments.some((a) => a._modified),
    [assignments]
  )

  // Derived data
  const days = useMemo(
    () => [...new Set(assignments.map((a) => a.day).filter((d) => d != null && d > 0))].sort((a, b) => a - b),
    [assignments]
  )

  const machineGroupMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const m of machines) {
      map.set(m.id, m.group)
    }
    return map
  }, [machines])

  const machineGroups = useMemo(
    () => [...new Set(machines.map((m) => m.group).filter((g) => g && g.trim() !== ""))].sort(),
    [machines]
  )

  // Filter assignments
  const filtered = useMemo(() => {
    let arr = assignments
    if (filterDayStart !== "all") {
      const start = Number(filterDayStart)
      arr = arr.filter((a) => a.day >= start)
    }
    if (filterDayEnd !== "all") {
      const end = Number(filterDayEnd)
      arr = arr.filter((a) => a.day <= end)
    }
    if (filterMachineGroup !== "all") {
      arr = arr.filter((a) => machineGroupMap.get(a.machine_id) === filterMachineGroup)
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      arr = arr.filter(
        (a) =>
          (a.component_id ?? "").toLowerCase().includes(q) ||
          (a.component_name ?? "").toLowerCase().includes(q) ||
          (a.mold_id ?? "").toLowerCase().includes(q) ||
          a.machine_name.toLowerCase().includes(q) ||
          a.machine_id.toLowerCase().includes(q)
      )
    }
    return arr.sort(
      (a, b) => a.day - b.day || a.machine_id.localeCompare(b.machine_id) || a.start_hour_clock - b.start_hour_clock
    )
  }, [assignments, filterDayStart, filterDayEnd, filterMachineGroup, machineGroupMap, searchQuery])

  // Compute time range and grouping from filtered
  const range = useMemo(() => computeTimeRange(filtered), [filtered])
  const machineRows = useMemo(() => groupByMachineEditable(filtered), [filtered])
  const dayColumns = useMemo(() => generateDayColumns(range), [range])

  const timelineWidth = range.totalHours * pxPerHour
  const totalHeight = HEADER_HEIGHT + machineRows.length * ROW_HEIGHT

  // Find overlaps for visual highlighting
  const overlaps = useMemo(() => findOverlaps(assignments), [assignments])

  // Check if selected task has overlap
  const selectedTaskHasError = selectedTaskIndex !== null && overlaps.has(taskKey(selectedTask!))

  // Reset all changes
  function handleReset() {
    setAssignments(
      originalAssignments.map((a, i) => ({
        ...a,
        _originalIndex: i,
        _modified: false,
      }))
    )
    setSelectedTaskIndex(null)
    setValidationResult(null)
    toast.success("Changes reset to original schedule")
  }

  // Reset single task
  function handleResetTask(index: number) {
    const original = originalAssignments[index]
    if (!original) return
    setAssignments((prev) =>
      prev.map((a) =>
        a._originalIndex === index
          ? { ...original, _originalIndex: index, _modified: false }
          : a
      )
    )
    toast.success("Task reset to original values")
  }

  // Update a task (from drag or form)
  function updateTask(index: number, updates: Partial<EditableAssignment>) {
    setAssignments((prev) =>
      prev.map((a) =>
        a._originalIndex === index
          ? { ...a, ...updates, _modified: true }
          : a
      )
    )
  }

  // Duplicate a task (for splitting production across days)
  function duplicateTask(index: number) {
    const taskToDuplicate = assignments.find(a => a._originalIndex === index)
    if (!taskToDuplicate) return

    // Find the next available original index (for tracking)
    const maxIndex = Math.max(...assignments.map(a => a._originalIndex))
    const newIndex = maxIndex + 1

    // Create duplicated task, defaulting to next day
    const newTask: EditableAssignment = {
      ...taskToDuplicate,
      _originalIndex: newIndex,
      _modified: true,
      day: taskToDuplicate.day + 1, // Default to next day
      start_hour_clock: 0, // Start at beginning of day
      end_hour_clock: taskToDuplicate.end_hour_clock - taskToDuplicate.start_hour_clock, // Same duration
      used_hours: taskToDuplicate.used_hours,
    }

    setAssignments(prev => [...prev, newTask])
    setSelectedTaskIndex(newIndex) // Select the new task
    toast.success("Task duplicated - adjust date and qty as needed")
  }

  // Save & Validate
  async function handleSaveValidate() {
    setValidating(true)
    setValidationResult(null)

    try {
      const planId = plan.id

      // Map EditableAssignment → AssignmentItem shape the API expects
      const payload = {
        assignments: assignments.map((a) => ({
          day: a.day,
          date: a.date ?? "",
          machine_id: a.machine_id,
          machine_name: a.machine_name,
          machine_group: a.machine_group ?? "",
          sequence_in_day: a.sequence_in_day ?? 0,
          task_type: a.task_type,
          used_hours: a.used_hours,
          start_hour: a.start_hour_clock,
          end_hour: a.end_hour_clock,
          start_datetime: a.start_datetime ?? "",
          end_datetime: a.end_datetime ?? "",
          component_id: a.component_id ?? null,
          produced_qty: a.produced_qty ?? null,
          mold_id: a.mold_id ?? null,
          from_mold_id: a.from_mold_id ?? null,
          to_mold_id: a.to_mold_id ?? null,
          from_color: a.from_color ?? null,
          to_color: a.to_color ?? null,
          color: a.color ?? null,
          utilization: a.utilization ?? null,
        })),
      }

      const res = await fetch(
        `http://localhost:8000/api/v1/plans/${planId}/check`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      )

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.detail ?? "Check failed")
      }

      const data = await res.json()

      // Map API response → ValidationResult shape used by the UI
      const result: ValidationResult = {
        valid: !data.against_rule && !data.has_unmet,
        violations: [
          ...data.violations.map((v: { rule: string; detail: string }) => ({
            severity: "error" as const,
            type: v.rule,
            message: v.detail,
          })),
          ...data.unmet_details.map((u: { component_id: string; required: number; produced: number; shortfall: number }) => ({
            severity: "warning" as const,
            type: "Unmet Demand",
            message: `${u.component_id}: need ${u.required}, produced ${u.produced}, short ${u.shortfall}`,
          })),
        ],
      }

      setValidationResult(result)

      if (result.valid) {
        // Save as a new run for the current active plan
        const saveRes = await fetch(
          `http://localhost:8000/api/v1/plans/${planId}/runs`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...payload,
              source: "manual_adjust",
            }),
          }
        )

        if (!saveRes.ok) {
          let msg = "Saved locally but failed to persist run"
          try {
            const err = await saveRes.json()
            msg = err.detail ?? msg
          } catch {
            msg = `HTTP ${saveRes.status}`
          }
          toast.warning(msg)
        } else {
          const newRun = await saveRes.json()
          toast.success(`Plan valid & saved as new run (${newRun.run_name ?? newRun.id})`)
        }
      } else {
        toast.error(`Found ${result.violations.length} issue(s)`)
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Validation failed"
      toast.error(message)
    } finally {
      setValidating(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      <AppHeader
        title="Adjust Production Plan (Manual)"
        description={`Adjusting "${plan.name}"`}
      />

      <div className="flex-1 p-4 md:p-6 flex flex-col gap-4 overflow-hidden">
        {/* Top bar */}
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant="secondary" className="text-sm">
            {plan.name}
          </Badge>
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-muted-foreground" />
            <Select value={selectedRunId ?? ""} onValueChange={onRunChange}>
              <SelectTrigger className="w-[180px] h-8">
                <SelectValue placeholder="Select run" />
              </SelectTrigger>
              <SelectContent>
                {/* {(plan.runs ?? [])
                  .filter((run) => run.id && run.id.trim() !== "")
                  .map((run, idx) => (
                    <SelectItem key={run.id} value={run.id}>
                      Run #{idx + 1} - {new Date(run.created_at).toLocaleDateString()}
                    </SelectItem>
                  ))} */}
                    {(() => {
                    const sortedRuns = [...(plan.runs ?? [])]
                      .filter((run) => run.id && run.id.trim() !== "")
                      .sort((a, b) =>
                        new Date(b.run_at ?? b.created_at ?? 0).getTime() -
                        new Date(a.run_at ?? a.created_at ?? 0).getTime()
                      )
                    return sortedRuns.map((run, idx) => (
                      <SelectItem key={run.id} value={run.id}>
                        Run #{sortedRuns.length - idx} -{" "}
                        {run.run_at ?? run.created_at
                          ? new Date(run.run_at ?? run.created_at).toLocaleDateString()
                          : "No date"}
                      </SelectItem>
                    ))
                  })()}
              </SelectContent>
            </Select>
          </div>
          {hasChanges && (
            <Badge variant="outline" className="bg-amber-500/10 text-amber-700 border-amber-500/30">
              Unsaved changes
            </Badge>
          )}
          <div className="ml-auto flex items-center gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href="/plan/output">
                <ArrowLeft className="mr-2 h-3.5 w-3.5" />
                Back to Output
              </Link>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleReset}
              disabled={!hasChanges}
            >
              <RotateCcw className="mr-2 h-3.5 w-3.5" />
              Reset All
            </Button>
            <Button
              size="sm"
              onClick={handleSaveValidate}
              disabled={validating}
            >
              <Save className="mr-2 h-3.5 w-3.5" />
              {validating ? "Validating..." : "Save & Validate"}
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Date Range</Label>
            <div className="flex items-center gap-1">
              <Select value={filterDayStart} onValueChange={setFilterDayStart}>
                <SelectTrigger className="w-32 h-8 text-xs">
                  <SelectValue placeholder="Start" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  {days.map((d) => (
                    <SelectItem key={d} value={String(d)}>
                      {formatDayAsDate(d, startDate)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-xs text-muted-foreground">to</span>
              <Select value={filterDayEnd} onValueChange={setFilterDayEnd}>
                <SelectTrigger className="w-32 h-8 text-xs">
                  <SelectValue placeholder="End" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  {days.map((d) => (
                    <SelectItem key={d} value={String(d)}>
                      {formatDayAsDate(d, startDate)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Machine Group</Label>
            <Select value={filterMachineGroup} onValueChange={setFilterMachineGroup}>
              <SelectTrigger className="w-28 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All groups</SelectItem>
                {machineGroups.map((g) =>
                  g ? (
                    <SelectItem key={g} value={g}>
                      {g.charAt(0).toUpperCase() + g.slice(1)}
                    </SelectItem>
                  ) : null
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Search</Label>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                className="pl-7 h-8 text-xs w-48"
                placeholder="component, mold, machine..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Zoom</Label>
            <div className="flex gap-1">
              {ZOOM_PRESETS.map((preset, i) => (
                <button
                  key={preset.label}
                  onClick={() => setZoomIdx(i)}
                  className={cn(
                    "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
                    i === zoomIdx
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-card text-muted-foreground border-border hover:bg-muted"
                  )}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
          <p className="text-xs text-muted-foreground pb-1">
            {filtered.length} of {assignments.length} assignments
          </p>
        </div>

        {/* Main content: Gantt + Inspector */}
        <div className="flex-1 flex gap-4 overflow-hidden min-h-0">
          {/* Gantt Chart */}
          <div className="flex-1 rounded-lg border bg-card overflow-hidden">
            <div className="flex h-full">
              {/* Fixed machine label column */}
              <div
                className="shrink-0 border-r bg-muted/30 overflow-y-auto"
                style={{ width: LABEL_WIDTH }}
              >
                <div
                  className="flex items-end px-3 border-b bg-muted/50 sticky top-0 z-10"
                  style={{ height: HEADER_HEIGHT }}
                >
                  <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider pb-1.5">
                    Machine
                  </span>
                </div>
                {machineRows.map((row) => (
                  <div
                    key={row.machineId}
                    className="flex flex-col justify-center px-3 border-b"
                    style={{ height: ROW_HEIGHT }}
                  >
                    <span className="text-xs font-mono font-semibold text-card-foreground leading-tight truncate">
                      {row.machineId}
                    </span>
                    <span className="text-[10px] text-muted-foreground leading-tight truncate">
                      {row.machineName}
                    </span>
                  </div>
                ))}
              </div>

              {/* Scrollable timeline */}
              <div className="flex-1 overflow-auto relative">
                <div
                  style={{ width: timelineWidth, height: totalHeight }}
                  className="relative"
                >
                  {/* Header */}
                  <div
                    className="sticky top-0 z-20"
                    style={{ height: HEADER_HEIGHT }}
                  >
                    <div className="flex border-b bg-muted/50" style={{ height: HEADER_HEIGHT }}>
                      {dayColumns.map((col) => {
                        const left =
                          ((col.startHour - range.rangeStart) / range.totalHours) *
                          timelineWidth
                        const width = (24 / range.totalHours) * timelineWidth
                        return (
                          <div
                            key={col.day}
                            className="absolute top-0 flex items-center justify-center border-r text-[11px] font-semibold text-card-foreground"
                            style={{ left, width, height: HEADER_HEIGHT }}
                          >
                            {formatDayAsDate(col.day, startDate)}
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  {/* Grid lines */}
                  {dayColumns.map((col) => {
                    const left =
                      ((col.startHour - range.rangeStart) / range.totalHours) *
                      timelineWidth
                    return (
                      <div
                        key={`day-line-${col.day}`}
                        className="absolute top-0 bottom-0 border-l border-border/60"
                        style={{ left, height: totalHeight }}
                      />
                    )
                  })}

                  {/* Machine rows with tasks */}
                  {machineRows.map((row, rowIdx) => {
                    const rowTop = HEADER_HEIGHT + rowIdx * ROW_HEIGHT
                    return (
                      <DraggableRow
                        key={row.machineId}
                        row={row}
                        rowIdx={rowIdx}
                        rowTop={rowTop}
                        range={range}
                        timelineWidth={timelineWidth}
                        pxPerHour={pxPerHour}
                        overlaps={overlaps}
                        selectedTaskIndex={selectedTaskIndex}
                        onSelectTask={setSelectedTaskIndex}
                        onUpdateTask={updateTask}
                        machineRows={machineRows}
                        startDate={startDate}
                      />
                    )
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Inspector Panel */}
          <div className="w-80 shrink-0 flex flex-col gap-4">
            {/* Task Inspector */}
            <Card className="flex-1 flex flex-col overflow-hidden">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Info className="h-4 w-4" />
                  Task Details
                  {selectedTask?._modified && (
                    <Badge variant="outline" className="text-[10px] ml-auto bg-amber-500/10 text-amber-700 border-amber-500/30">
                      Modified
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex-1 overflow-y-auto">
                {selectedTask ? (
 <TaskInspector
  task={selectedTask}
  originalTask={originalAssignments[selectedTask._originalIndex] ?? null}
  startDate={startDate}
  machines={machines}
  components={plan.components ?? []}
  days={days}
  onUpdate={(updates) => updateTask(selectedTask._originalIndex, updates)}
  onReset={() => handleResetTask(selectedTask._originalIndex)}
  onDuplicate={() => duplicateTask(selectedTask._originalIndex)}
  hasError={selectedTaskHasError}
  />
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Click a task bar to view and edit details
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Validation Results */}
            {validationResult && (
              <Card className={validationResult.valid ? "border-emerald-500/40" : "border-red-500/40"}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    {validationResult.valid ? (
                      <>
                        <CheckCircle className="h-4 w-4 text-emerald-600" />
                        <span className="text-emerald-700">Plan is Valid</span>
                      </>
                    ) : (
                      <>
                        <AlertTriangle className="h-4 w-4 text-red-600" />
                        <span className="text-red-700">Validation Issues</span>
                      </>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="ml-auto h-6 w-6 p-0"
                      onClick={() => setValidationResult(null)}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {validationResult.valid ? (
                    <p className="text-xs text-muted-foreground">
                      No issues detected. The plan is ready.
                    </p>
                  ) : (
                    <ScrollArea className="h-40">
                      <div className="flex flex-col gap-2">
                        {validationResult.violations.map((v, i) => (
                          <div
                            key={i}
                            className={cn(
                              "rounded-md p-2 text-xs",
                              v.severity === "error"
                                ? "bg-red-500/10 text-red-800 border border-red-500/30"
                                : "bg-amber-500/10 text-amber-800 border border-amber-500/30"
                            )}
                          >
                            <span className="font-semibold">{v.type}:</span> {v.message}
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Legend */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs text-muted-foreground">Legend</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex flex-wrap gap-2">
                  {Object.entries(GANTT_COLORS).map(([type, colors]) => (
                    <div key={type} className="flex items-center gap-1.5">
                      <div className={cn("w-3 h-3 rounded-sm", colors.bg)} />
                      <span className="text-[10px] text-muted-foreground">
                        {type === "PRODUCE" ? "Production" : type === "WAIT" ? "Wait" : type === "CHANGE_MOLD" ? "Mold" : type === "CHANGE_COLOR" ? "Color" : "Transfer"}
                      </span>
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-muted-foreground mt-2">
                  Drag any task to adjust time/machine, or use the form fields for precise editing. Tasks snap to 15-min intervals.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}

// ---- Draggable Row ----
function DraggableRow({
  row,
  rowIdx,
  rowTop,
  range,
  timelineWidth,
  pxPerHour,
  overlaps,
  selectedTaskIndex,
  onSelectTask,
  onUpdateTask,
  machineRows,
  startDate,
}: {
  row: EditableMachineRow
  rowIdx: number
  rowTop: number
  range: GanttTimeRange
  timelineWidth: number
  pxPerHour: number
  overlaps: Set<string>
  selectedTaskIndex: number | null
  onSelectTask: (index: number | null) => void
  onUpdateTask: (index: number, updates: Partial<EditableAssignment>) => void
  machineRows: EditableMachineRow[]
  startDate: string
}) {
  return (
    <div
      className="absolute w-full border-b border-border/30"
      style={{ top: rowTop, height: ROW_HEIGHT }}
    >
      {rowIdx % 2 === 0 && <div className="absolute inset-0 bg-muted/10" />}

      {row.tasks.map((task, taskIdx) => (
        <DraggableTask
          key={`${task.day}-${task._originalIndex}-${taskIdx}`}
          task={task}
          range={range}
          timelineWidth={timelineWidth}
          pxPerHour={pxPerHour}
          isOverlap={overlaps.has(taskKey(task))}
          isSelected={selectedTaskIndex === task._originalIndex}
          onSelect={() => onSelectTask(task._originalIndex)}
          onUpdate={(updates) => onUpdateTask(task._originalIndex, updates)}
          machineRows={machineRows}
          currentRowIdx={rowIdx}
          startDate={startDate}
        />
      ))}
    </div>
  )
}

// ---- Draggable Task ----
function DraggableTask({
  task,
  range,
  timelineWidth,
  pxPerHour,
  isOverlap,
  isSelected,
  onSelect,
  onUpdate,
  machineRows,
  currentRowIdx,
}: {
  task: EditableAssignment
  range: GanttTimeRange
  timelineWidth: number
  pxPerHour: number
  isOverlap: boolean
  isSelected: boolean
  onSelect: () => void
  onUpdate: (updates: Partial<EditableAssignment>) => void
  machineRows: EditableMachineRow[]
  currentRowIdx: number
  startDate: string
}) {
  const colors = GANTT_COLORS[task.task_type] ?? GANTT_COLORS.WAIT

  const [dragging, setDragging] = useState(false)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const dragStartRef = useRef({ x: 0, y: 0, startHour: 0, machineIdx: 0 })

  // Calculate position
  const clampedStart = Math.max(0, Math.min(24, task.start_hour_clock))
  const clampedEnd = Math.max(0, Math.min(24, task.end_hour_clock))
  const absStart = toAbsoluteHour(task.day, clampedStart)
  const absEnd = toAbsoluteHour(task.day, clampedEnd)
  const leftPct = ((absStart - range.rangeStart) / range.totalHours) * 100
  const widthPct = Math.max(((absEnd - absStart) / range.totalHours) * 100, 0.5)

  // Drag handlers
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()

      dragStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        startHour: task.start_hour_clock,
        machineIdx: currentRowIdx,
      }
      setDragging(true)
      setDragOffset({ x: 0, y: 0 })
    },
    [task.start_hour_clock, currentRowIdx]
  )

  useEffect(() => {
    if (!dragging) return

    const handleMouseMove = (e: MouseEvent) => {
      const dx = e.clientX - dragStartRef.current.x
      const dy = e.clientY - dragStartRef.current.y
      setDragOffset({ x: dx, y: dy })
    }

    const handleMouseUp = (e: MouseEvent) => {
      const dx = e.clientX - dragStartRef.current.x
      const dy = e.clientY - dragStartRef.current.y

      // Calculate new start hour (snap to 15 min)
      const hourDelta = dx / pxPerHour
      let newStartHour = dragStartRef.current.startHour + hourDelta
      newStartHour = Math.round(newStartHour / SNAP_HOURS) * SNAP_HOURS

      // Calculate new machine row
      const rowDelta = Math.round(dy / ROW_HEIGHT)
      let newRowIdx = dragStartRef.current.machineIdx + rowDelta
      newRowIdx = Math.max(0, Math.min(machineRows.length - 1, newRowIdx))

      const duration = task.end_hour_clock - task.start_hour_clock
      const updates: Partial<EditableAssignment> = {}

      // Clamp to day boundaries
      if (newStartHour < 0) newStartHour = 0
      if (newStartHour + duration > 24) newStartHour = 24 - duration
      // if (newStartHour + duration > 24) 
      // {
      //     updates.day = task.day + 1
      //     newStartHour = 0
      // }

      const newMachine = machineRows[newRowIdx]

      if (newStartHour !== task.start_hour_clock) {
        updates.start_hour_clock = newStartHour
        updates.end_hour_clock = newStartHour + duration
        updates.used_hours = duration
      }

      if (newMachine && newMachine.machineId !== task.machine_id) {
        updates.machine_id = newMachine.machineId
        updates.machine_name = newMachine.machineName
      }

      if (Object.keys(updates).length > 0) {
        onUpdate(updates)
      }

      setDragging(false)
      setDragOffset({ x: 0, y: 0 })
    }

    window.addEventListener("mousemove", handleMouseMove)
    window.addEventListener("mouseup", handleMouseUp)

    return () => {
      window.removeEventListener("mousemove", handleMouseMove)
      window.removeEventListener("mouseup", handleMouseUp)
    }
  }, [dragging, task, pxPerHour, machineRows, onUpdate])

  const label =
    task.task_type === "PRODUCE"
      ? `${task.component_id ?? ""} x${task.produced_qty?.toLocaleString() ?? 0}`
      : task.task_type === "CHANGE_MOLD"
        ? task.to_mold_id ?? "Mold"
        : task.task_type === "CHANGE_COLOR"
          ? task.to_color ?? "Color"
          : task.task_type === "TRANSFER"
            ? "Transfer"
            : task.task_type

  return (
    <div
      className={cn(
        "absolute rounded border flex items-center px-1.5 overflow-hidden transition-all cursor-grab",
        colors.bg,
        colors.border,
        colors.text,
        dragging && "cursor-grabbing opacity-70 z-50 shadow-lg",
        isOverlap && "ring-2 ring-red-500 ring-offset-1",
        isSelected && "ring-2 ring-foreground/40 ring-offset-1",
        task._modified && !isSelected && !isOverlap && "ring-1 ring-amber-500"
      )}
      style={{
        left: `${leftPct}%`,
        width: `${widthPct}%`,
        top: 8,
        height: ROW_HEIGHT - 16,
        minWidth: 4,
        transform: dragging ? `translate(${dragOffset.x}px, ${dragOffset.y}px)` : undefined,
      }}
      onMouseDown={handleMouseDown}
      onClick={(e) => {
        e.stopPropagation()
        onSelect()
      }}
    >
      <GripVertical className="h-3 w-3 shrink-0 opacity-60 mr-0.5" />
      <span className="text-[10px] font-medium truncate leading-none whitespace-nowrap">
        {label}
      </span>
    </div>
  )
}

// ---- Task Inspector with editable fields ----
function TaskInspector({ 
  task, 
  originalTask,
  startDate,
  machines,
  components,
  days,
  onUpdate,
  onReset,
  onDuplicate,
  hasError,
}: { 
  task: EditableAssignment
  originalTask: Assignment | null
  startDate: string
  machines?: PlanMachine[]
  components: { id: string; cycle_time_sec: number }[]
  days: number[]
  onUpdate: (updates: Partial<EditableAssignment>) => void
  onReset: () => void
  onDuplicate: () => void
  hasError: boolean
}) {
  const colors = GANTT_COLORS[task.task_type] ?? GANTT_COLORS.WAIT
  const duration = task.end_hour_clock - task.start_hour_clock

  // Store the original cycle time (seconds per unit) - calculated once from original task data
  // This ensures we always have a reliable cycle time even after qty changes
  const originalCycleTimeSec = useMemo(() => {
    // First try to find from components
    const comp = components.find(c => c.id === task.component_id)
    if (comp && comp.cycle_time_sec > 0) {
      return comp.cycle_time_sec
    }
    // Fallback: calculate from original task data (before any modifications)
    const origQty = originalTask?.produced_qty ?? task.produced_qty
    const origHours = originalTask?.used_hours ?? task.used_hours
    if (origQty && origQty > 0 && origHours && origHours > 0) {
      return (origHours * 3600) / origQty
    }
    return 0
  }, [task.component_id, task._originalIndex, components, originalTask])

  // Local form state for controlled inputs
  const [dateValue, setDateValue] = useState(formatDateFromDay(task.day, startDate))
  const [machineValue, setMachineValue] = useState(task.machine_id)
  const [startTimeValue, setStartTimeValue] = useState(formatTimeHHMM(task.start_hour_clock))
  const [endTimeValue, setEndTimeValue] = useState(formatTimeHHMM(task.end_hour_clock))
  const [producedQtyValue, setProducedQtyValue] = useState(String(task.produced_qty ?? 0))
  const [localError, setLocalError] = useState<string | null>(null)

  // Sync local state when task changes
  useEffect(() => {
    setDateValue(formatDateFromDay(task.day, startDate))
    setMachineValue(task.machine_id)
    setStartTimeValue(formatTimeHHMM(task.start_hour_clock))
    setEndTimeValue(formatTimeHHMM(task.end_hour_clock))
    setProducedQtyValue(String(task.produced_qty ?? 0))
    setLocalError(null)
  }, [task._originalIndex, task.day, task.machine_id, task.start_hour_clock, task.end_hour_clock, task.produced_qty, startDate])

  // Apply date change
  function handleDateChange(newDate: string) {
    setDateValue(newDate)
    const newDay = dayFromDate(newDate, startDate)
    if (newDay > 0) {
      onUpdate({ day: newDay })
      setLocalError(null)
    } else {
      setLocalError("Invalid date (before start date)")
    }
  }

  // Apply machine change
  function handleMachineChange(newMachineId: string) {
    setMachineValue(newMachineId)
    const machine = machines.find(m => m.id === newMachineId)
    if (machine) {
      onUpdate({ 
        machine_id: machine.id, 
        machine_name: machine.name 
      })
    }
  }

  // Apply start time change (auto-adjust end time to keep duration)
  function handleStartTimeChange(newStartTime: string) {
    setStartTimeValue(newStartTime)
    const newStartHour = parseTimeToHour(newStartTime)
    
    // Keep duration, shift end time
    let newEndHour = newStartHour + duration
    
    // Validate
    if (newStartHour < 0 || newStartHour >= 24) {
      setLocalError("Start time must be between 00:00 and 23:59")
      return
    }
    if (newEndHour > 24) {
      newEndHour = 24
      setLocalError("Task truncated to fit within day")
    } else {
      setLocalError(null)
    }
    
    setEndTimeValue(formatTimeHHMM(newEndHour))
    onUpdate({ 
      start_hour_clock: newStartHour, 
      end_hour_clock: newEndHour,
      used_hours: newEndHour - newStartHour,
    })
  }

  // Apply produced qty change - recalculates duration based on stored original cycle time
  function handleProducedQtyChange(value: string) {
    setProducedQtyValue(value)
    const qty = parseInt(value) || 0
    if (qty >= 0) {
      // Use the stored original cycle time (calculated once from original task data)
      if (originalCycleTimeSec > 0) {
        // Calculate new duration in hours: qty * cycle_time_sec / 3600
        const newDurationHours = (qty * originalCycleTimeSec) / 3600
        const newEndHour = Math.min(24, task.start_hour_clock + newDurationHours)
        
        setEndTimeValue(formatTimeHHMM(newEndHour))
        onUpdate({ 
          produced_qty: qty,
          end_hour_clock: newEndHour,
          used_hours: newEndHour - task.start_hour_clock,
        })
      } else {
        // No cycle time available, just update qty without changing duration
        onUpdate({ produced_qty: qty })
      }
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Task type header */}
      <div className="flex items-center gap-2">
        <div className={cn("w-3 h-3 rounded-sm", colors.bg)} />
        <span className="text-sm font-semibold">{task.task_type}</span>
      </div>

      {/* Error display */}
      {(localError || hasError) && (
        <div className="rounded-md p-2 bg-red-500/10 text-red-800 border border-red-500/30 text-xs">
          <AlertTriangle className="inline h-3 w-3 mr-1" />
          {localError || "This task overlaps with another task"}
        </div>
      )}

      {/* Editable fields */}
      <div className="flex flex-col gap-3">
        {/* Date */}
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">Date</Label>
          <Input
            type="date"
            value={dateValue}
            onChange={(e) => handleDateChange(e.target.value)}
            className="h-8 text-xs font-mono"
          />
        </div>

        {/* Machine */}
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">Machine</Label>
          <Select value={machineValue} onValueChange={handleMachineChange}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {machines
                .filter(m => m.status === "available")
                .map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    <span className="font-mono">{m.id}</span> - {m.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>

        {/* Time range - only Start Time is editable */}
        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">Start Time</Label>
            <Input
              type="time"
              value={startTimeValue}
              onChange={(e) => handleStartTimeChange(e.target.value)}
              className="h-8 text-xs font-mono"
              step="900"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">End Time</Label>
            <Input
              type="time"
              value={endTimeValue}
              readOnly
              disabled
              className="h-8 text-xs font-mono bg-muted"
            />
            <p className="text-[10px] text-muted-foreground">Auto-calculated</p>
          </div>
        </div>

        {/* Duration (read-only) */}
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Duration</span>
          <span className="font-mono">
            {formatHourAMPM(task.start_hour_clock)} - {formatHourAMPM(task.end_hour_clock)} ({task.used_hours.toFixed(2)}h)
          </span>
        </div>

        {/* Produced Qty (only for PRODUCE) */}
        {task.task_type === "PRODUCE" && (
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">Produced Qty</Label>
            <Input
              type="number"
              value={producedQtyValue}
              onChange={(e) => handleProducedQtyChange(e.target.value)}
              className="h-8 text-xs font-mono"
              min={0}
            />
            <p className="text-[10px] text-muted-foreground">
              Changing qty will recalculate end time based on cycle time
            </p>
          </div>
        )}

        {/* Task-specific read-only details */}
        <div className="border-t pt-3 mt-1">
          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
            {task.task_type === "PRODUCE" && (
              <>
                <span className="text-muted-foreground">Component</span>
                <span>
                  <span className="font-mono">{task.component_id}</span> {task.component_name}
                </span>

                <span className="text-muted-foreground">Mold</span>
                <span className="font-mono">{task.mold_id}</span>

                <span className="text-muted-foreground">Color</span>
                <span>{task.color}</span>
              </>
            )}

            {task.task_type === "CHANGE_COLOR" && (
              <>
                <span className="text-muted-foreground">From</span>
                <span>{task.from_color ?? "?"}</span>
                <span className="text-muted-foreground">To</span>
                <span className="font-semibold">{task.to_color ?? "?"}</span>
              </>
            )}

            {task.task_type === "CHANGE_MOLD" && (
              <>
                <span className="text-muted-foreground">From Mold</span>
                <span className="font-mono">{task.from_mold_id ?? "?"}</span>
                <span className="text-muted-foreground">To Mold</span>
                <span className="font-mono font-semibold">{task.to_mold_id ?? "?"}</span>
              </>
            )}

            {task.task_type === "TRANSFER" && (
              <>
                <span className="text-muted-foreground">Component</span>
                <span>
                  <span className="font-mono">{task.component_id}</span> {task.component_name}
                </span>
              </>
            )}
          </div>
        </div>

  {/* Action buttons */}
  <div className="flex gap-2 mt-2">
    {task.task_type === "PRODUCE" && (
      <Button
        variant="outline"
        size="sm"
        onClick={onDuplicate}
        className="flex-1"
      >
        <Copy className="mr-2 h-3.5 w-3.5" />
        Duplicate
      </Button>
    )}
    {task._modified && (
      <Button
        variant="outline"
        size="sm"
        onClick={onReset}
        className="flex-1"
      >
        <Undo2 className="mr-2 h-3.5 w-3.5" />
        Reset Task
      </Button>
    )}
  </div>
      </div>
    </div>
  )
}

// ---- Helper types and functions ----
interface EditableMachineRow {
  machineId: string
  machineName: string
  tasks: EditableAssignment[]
}

function groupByMachineEditable(assignments: EditableAssignment[]): EditableMachineRow[] {
  const map = new Map<string, EditableMachineRow>()
  for (const task of assignments) {
    if (!map.has(task.machine_id)) {
      map.set(task.machine_id, {
        machineId: task.machine_id,
        machineName: task.machine_name,
        tasks: [],
      })
    }
    map.get(task.machine_id)!.tasks.push(task)
  }
  for (const row of map.values()) {
    row.tasks.sort(
      (a, b) =>
        toAbsoluteHour(a.day, a.start_hour_clock) - toAbsoluteHour(b.day, b.start_hour_clock)
    )
  }
  return [...map.values()].sort((a, b) => a.machineId.localeCompare(b.machineId))
}

function taskKey(task: EditableAssignment): string {
  return `${task.machine_id}-${task.day}-${task._originalIndex}`
}

function findOverlaps(assignments: EditableAssignment[]): Set<string> {
  const overlaps = new Set<string>()
  const byMachineDay = new Map<string, EditableAssignment[]>()

  for (const a of assignments) {
    const key = `${a.machine_id}-${a.day}`
    if (!byMachineDay.has(key)) byMachineDay.set(key, [])
    byMachineDay.get(key)!.push(a)
  }

  for (const tasks of byMachineDay.values()) {
    for (let i = 0; i < tasks.length; i++) {
      for (let j = i + 1; j < tasks.length; j++) {
        const a = tasks[i]
        const b = tasks[j]
        if (a.start_hour_clock < b.end_hour_clock && b.start_hour_clock < a.end_hour_clock) {
          overlaps.add(taskKey(a))
          overlaps.add(taskKey(b))
        }
      }
    }
  }

  return overlaps
}

function validatePlan(
  assignments: EditableAssignment[],
  machines: PlanMachine[],
  overlaps: Set<string>
): ValidationResult {
  const violations: ValidationViolation[] = []

  // Check overlaps
  if (overlaps.size > 0) {
    violations.push({
      severity: "error",
      type: "Overlap",
      message: `${overlaps.size / 2} tasks overlap on the same machine/day`,
    })
  }

  // Check machine availability
  const unavailableMachines = new Set(
    machines.filter((m) => m.status === "unavailable").map((m) => m.id)
  )
  const tasksOnUnavailable = assignments.filter((a) =>
    unavailableMachines.has(a.machine_id)
  )
  if (tasksOnUnavailable.length > 0) {
    violations.push({
      severity: "error",
      type: "Machine Unavailable",
      message: `${tasksOnUnavailable.length} tasks assigned to unavailable machines`,
    })
  }

  // Check hours exceed day
  for (const a of assignments) {
    if (a.end_hour_clock > 24) {
      violations.push({
        severity: "error",
        type: "Time Overflow",
        message: `Task ${a.component_id || a.task_type} on ${a.machine_id} exceeds 24 hours`,
        taskIndex: a._originalIndex,
      })
    }
  }

  return {
    valid: violations.length === 0,
    violations,
  }
}

function normalizeAssignment(raw: any): Assignment {
  return {
    ...raw,
    start_hour_clock: raw.start_hour_clock ?? raw.start_hour ?? 0,
    end_hour_clock:   raw.end_hour_clock   ?? raw.end_hour   ?? 0,
    machine_group:    raw.machine_group    ?? "",
    date:             raw.date ?? raw.start_datetime?.split("T")[0] ?? "",
  }
}
