"use client"

import { useEffect, useState, useMemo, useCallback } from "react"
import Link from "next/link"
import {
  ArrowLeft,
  Download,
  ClipboardCopy,
  FileQuestion,
  FlaskConical,
  Search,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
} from "lucide-react"
import { AppHeader } from "@/components/app-header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { toast } from "sonner"
import { GanttChart } from "@/components/schedule/GanttChart"
import type { ScheduleResponse, Assignment } from "@/lib/types"
import {
  getStoredResult,
  storeResult,
  groupByMachineThenDay,
  computeDailySummaries,
  downloadCSV,
  assignmentsToCSV,
  DEMO_RESULT,
} from "@/lib/schedule-utils"

// ---- Task-type styling ----
const TASK_COLORS: Record<string, { bar: string; badge: string; label: string }> = {
  PRODUCE: {
    bar: "bg-emerald-500/15 border-emerald-500/30",
    badge: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30",
    label: "Production",
  },
  WAIT: {
    bar: "bg-muted border-border",
    badge: "bg-muted text-muted-foreground border-border",
    label: "Wait",
  },
  CHANGE_MOLD: {
    bar: "bg-amber-500/15 border-amber-500/30",
    badge: "bg-amber-500/15 text-amber-700 border-amber-500/30",
    label: "Mold Change",
  },
  CHANGE_COLOR: {
    bar: "bg-sky-500/15 border-sky-500/30",
    badge: "bg-sky-500/15 text-sky-700 border-sky-500/30",
    label: "Color Change",
  },
}

const TASK_TYPES = ["PRODUCE", "CHANGE_COLOR", "CHANGE_MOLD", "WAIT"] as const

function fmt(n: number | undefined | null, decimals = 2): string {
  if (n === null || n === undefined) return ""
  return n.toFixed(decimals)
}

export default function OutputPage() {
  const [result, setResult] = useState<ScheduleResponse | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    setResult(getStoredResult())
    setLoaded(true)
  }, [])

  function loadDemo() {
    storeResult(DEMO_RESULT)
    setResult(DEMO_RESULT)
    toast.success("Demo result loaded")
  }

  if (!loaded) return null

  if (!result) {
    return (
      <div className="flex flex-col h-full">
        <AppHeader
          title="Schedule Output"
          description="Timeline-ready plan with setup, waiting, and production tasks"
        />
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="flex flex-col items-center gap-4 text-center max-w-sm">
            <div className="flex items-center justify-center w-14 h-14 rounded-full bg-muted">
              <FileQuestion className="h-7 w-7 text-muted-foreground" />
            </div>
            <h2 className="text-lg font-semibold text-card-foreground">
              No schedule result found
            </h2>
            <p className="text-sm text-muted-foreground">
              Run the scheduler first or load a demo result to see the timeline output.
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

  return <OutputContent data={result} onLoadDemo={loadDemo} />
}

// ---- Main content with filters and tabs ----
function OutputContent({
  data,
  onLoadDemo,
}: {
  data: ScheduleResponse
  onLoadDemo: () => void
}) {
  const [filterDay, setFilterDay] = useState("all")
  const [filterMachine, setFilterMachine] = useState("all")
  const [activeTypes, setActiveTypes] = useState<Set<string>>(new Set(TASK_TYPES))
  const [searchQuery, setSearchQuery] = useState("")
  const [sortMode, setSortMode] = useState<"day" | "machine">("day")

  // Derived data
  const unmetEntries = Object.entries(data.unmet ?? {})
  const totalUnmetQty = unmetEntries.reduce((s, [, v]) => s + v, 0)
  const days = useMemo(
    () => [...new Set(data.assignments.map((a) => a.day))].sort((a, b) => a - b),
    [data.assignments]
  )
  const machines = useMemo(
    () =>
      [
        ...new Map(
          data.assignments.map((a) => [a.machine_id, a.machine_name])
        ).entries(),
      ].sort((a, b) => a[0].localeCompare(b[0])),
    [data.assignments]
  )

  const toggleType = useCallback((type: string) => {
    setActiveTypes((prev) => {
      const next = new Set(prev)
      if (next.has(type)) next.delete(type)
      else next.add(type)
      return next
    })
  }, [])

  const filtered = useMemo(() => {
    let arr = data.assignments
    if (filterDay !== "all") arr = arr.filter((a) => a.day === Number(filterDay))
    if (filterMachine !== "all") arr = arr.filter((a) => a.machine_id === filterMachine)
    arr = arr.filter((a) => activeTypes.has(a.task_type))
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
    if (sortMode === "day") {
      arr = [...arr].sort(
        (a, b) => a.day - b.day || a.machine_id.localeCompare(b.machine_id) || a.start_hour - b.start_hour
      )
    } else {
      arr = [...arr].sort(
        (a, b) => a.machine_id.localeCompare(b.machine_id) || a.day - b.day || a.sequence_in_day - b.sequence_in_day
      )
    }
    return arr
  }, [data.assignments, filterDay, filterMachine, activeTypes, searchQuery, sortMode])

  const timelineGrouped = useMemo(
    () => groupByMachineThenDay(filtered),
    [filtered]
  )
  const { perMachineDay, perDay } = useMemo(
    () => computeDailySummaries(data.assignments),
    [data.assignments]
  )

  function handleCopyCSV() {
    const csv = assignmentsToCSV(filtered)
    navigator.clipboard.writeText(csv).then(() => {
      toast.success("CSV copied to clipboard")
    })
  }

  return (
    <div className="flex flex-col h-full">
      <AppHeader
        title="Schedule Output"
        description="Timeline-ready plan with setup, waiting, and production tasks"
      />
      <div className="flex-1 p-4 md:p-6 flex flex-col gap-6 overflow-y-auto">
        {/* Top actions */}
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" size="sm" asChild>
            <Link href="/plan">
              <ArrowLeft className="mr-2 h-3.5 w-3.5" />
              Back to Setup Plan
            </Link>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => downloadCSV(filtered)}
          >
            <Download className="mr-2 h-3.5 w-3.5" />
            Export CSV
          </Button>
          <Button variant="outline" size="sm" onClick={handleCopyCSV}>
            <ClipboardCopy className="mr-2 h-3.5 w-3.5" />
            Copy CSV
          </Button>
          <Button variant="ghost" size="sm" onClick={onLoadDemo}>
            <FlaskConical className="mr-2 h-3.5 w-3.5" />
            Load Demo
          </Button>
        </div>

        {/* Warning if empty */}
        {data.assignments.length === 0 && (
          <div className="flex items-center gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4">
            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
            <p className="text-sm text-amber-800">
              The assignments array is empty. The scheduler may have found no
              feasible plan.
            </p>
          </div>
        )}

        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <SummaryCard label="Score" value={fmt(data.score, 2)} />
          <SummaryCard
            label="Total Assignments"
            value={String(data.assignments.length)}
          />
          <SummaryCard
            label="Machines"
            value={String(machines.length)}
          />
          <SummaryCard
            label="Days Scheduled"
            value={String(days.length)}
          />
          <SummaryCard
            label="Unmet Components"
            value={String(unmetEntries.length)}
            alert={unmetEntries.length > 0}
          />
          <SummaryCard
            label="Total Unmet Qty"
            value={totalUnmetQty.toLocaleString()}
            alert={totalUnmetQty > 0}
          />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Day</Label>
            <Select value={filterDay} onValueChange={setFilterDay}>
              <SelectTrigger className="w-28 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All days</SelectItem>
                {days.map((d) => (
                  <SelectItem key={d} value={String(d)}>
                    Day {d}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Machine</Label>
            <Select value={filterMachine} onValueChange={setFilterMachine}>
              <SelectTrigger className="w-40 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All machines</SelectItem>
                {machines.map(([id, name]) => (
                  <SelectItem key={id} value={id}>
                    {id} - {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Task Types</Label>
            <div className="flex flex-wrap gap-1.5">
              {TASK_TYPES.map((t) => {
                const active = activeTypes.has(t)
                const style = TASK_COLORS[t]
                return (
                  <button
                    key={t}
                    onClick={() => toggleType(t)}
                    className={`rounded-md border px-2 py-1 text-xs font-medium transition-colors ${
                      active ? style.badge : "bg-muted/40 text-muted-foreground border-border opacity-50"
                    }`}
                  >
                    {style.label}
                  </button>
                )
              })}
            </div>
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
            <Label className="text-xs">Sort</Label>
            <Select value={sortMode} onValueChange={(v) => setSortMode(v as "day" | "machine")}>
              <SelectTrigger className="w-40 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="day">Day, then Machine</SelectItem>
                <SelectItem value="machine">Machine, then Day</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <p className="text-xs text-muted-foreground pb-1">
            {filtered.length} of {data.assignments.length} assignments
          </p>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="gantt" className="flex-1 flex flex-col">
          <TabsList className="w-fit">
            <TabsTrigger value="gantt">Gantt Chart</TabsTrigger>
            <TabsTrigger value="timeline">Timeline View</TabsTrigger>
            <TabsTrigger value="table">Table View</TabsTrigger>
            <TabsTrigger value="daily">Daily Summary</TabsTrigger>
          </TabsList>

          {/* ---- Gantt chart view ---- */}
          <TabsContent value="gantt" className="mt-4">
            <GanttChart
              assignments={data.assignments}
              dayStart={filterDay !== "all" ? Number(filterDay) : undefined}
              dayEnd={filterDay !== "all" ? Number(filterDay) : undefined}
            />
          </TabsContent>

          {/* ---- Timeline view ---- */}
          <TabsContent value="timeline" className="mt-4 flex flex-col gap-2">
            <Legend />
            {Object.keys(timelineGrouped).length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                No assignments match the current filters.
              </p>
            ) : (
              Object.entries(timelineGrouped)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([machineId, dayMap]) => (
                  <MachineTimeline
                    key={machineId}
                    machineId={machineId}
                    machineName={
                      data.assignments.find((a) => a.machine_id === machineId)
                        ?.machine_name ?? machineId
                    }
                    dayMap={dayMap}
                  />
                ))
            )}
          </TabsContent>

          {/* ---- Table view ---- */}
          <TabsContent value="table" className="mt-4">
            <div className="rounded-lg border bg-card overflow-auto max-h-[65vh]">
              <Table>
                <TableHeader className="sticky top-0 bg-card z-10">
                  <TableRow>
                    <TableHead className="text-xs">Day</TableHead>
                    <TableHead className="text-xs">Machine</TableHead>
                    <TableHead className="text-xs">Seq</TableHead>
                    <TableHead className="text-xs">Task</TableHead>
                    <TableHead className="text-xs text-right">Start</TableHead>
                    <TableHead className="text-xs text-right">End</TableHead>
                    <TableHead className="text-xs text-right">Hours</TableHead>
                    <TableHead className="text-xs text-right">Util</TableHead>
                    <TableHead className="text-xs">Mold</TableHead>
                    <TableHead className="text-xs">Component</TableHead>
                    <TableHead className="text-xs text-right">Qty</TableHead>
                    <TableHead className="text-xs">Color</TableHead>
                    <TableHead className="text-xs">Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={13}
                        className="text-center py-8 text-sm text-muted-foreground"
                      >
                        No assignments match the current filters.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filtered.map((a, i) => (
                      <TableRow
                        key={`${a.day}-${a.machine_id}-${a.sequence_in_day}-${i}`}
                      >
                        <TableCell className="text-xs">{a.day}</TableCell>
                        <TableCell className="text-xs">
                          <span className="font-mono">{a.machine_id}</span>{" "}
                          <span className="text-muted-foreground">
                            {a.machine_name}
                          </span>
                        </TableCell>
                        <TableCell className="text-xs">
                          {a.sequence_in_day}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={`text-[10px] ${TASK_COLORS[a.task_type]?.badge ?? ""}`}
                          >
                            {a.task_type}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-right font-mono">
                          {fmt(a.start_hour)}
                        </TableCell>
                        <TableCell className="text-xs text-right font-mono">
                          {fmt(a.end_hour)}
                        </TableCell>
                        <TableCell className="text-xs text-right font-mono">
                          {fmt(a.used_hours)}
                        </TableCell>
                        <TableCell className="text-xs text-right font-mono">
                          {a.utilization != null
                            ? `${(a.utilization * 100).toFixed(1)}%`
                            : ""}
                        </TableCell>
                        <TableCell className="text-xs font-mono">
                          {a.mold_id ?? ""}
                        </TableCell>
                        <TableCell className="text-xs">
                          {a.component_id ? (
                            <>
                              <span className="font-mono">{a.component_id}</span>{" "}
                              <span className="text-muted-foreground">
                                {a.component_name}
                              </span>
                            </>
                          ) : (
                            ""
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-right font-mono">
                          {a.produced_qty != null
                            ? a.produced_qty.toLocaleString()
                            : ""}
                        </TableCell>
                        <TableCell className="text-xs">{a.color ?? ""}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          <TaskDetail a={a} />
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          {/* ---- Daily summary ---- */}
          <TabsContent value="daily" className="mt-4 flex flex-col gap-6">
            {/* Per-day totals */}
            <div>
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
                Daily Totals (All Machines)
              </h3>
              <div className="rounded-lg border bg-card overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Day</TableHead>
                      <TableHead className="text-xs text-right">
                        Machines
                      </TableHead>
                      <TableHead className="text-xs text-right">
                        Production (h)
                      </TableHead>
                      <TableHead className="text-xs text-right">
                        Changeover (h)
                      </TableHead>
                      <TableHead className="text-xs text-right">
                        Wait (h)
                      </TableHead>
                      <TableHead className="text-xs text-right">
                        Total (h)
                      </TableHead>
                      <TableHead className="text-xs text-right">
                        Produced Qty
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {perDay.map((d) => (
                      <TableRow key={d.day}>
                        <TableCell className="text-xs font-medium">
                          Day {d.day}
                        </TableCell>
                        <TableCell className="text-xs text-right">
                          {d.machineCount}
                        </TableCell>
                        <TableCell className="text-xs text-right font-mono">
                          {fmt(d.productionHours)}
                        </TableCell>
                        <TableCell className="text-xs text-right font-mono">
                          {fmt(d.changeoverHours)}
                        </TableCell>
                        <TableCell className="text-xs text-right font-mono">
                          {fmt(d.waitHours)}
                        </TableCell>
                        <TableCell className="text-xs text-right font-mono font-semibold">
                          {fmt(d.totalUsedHours)}
                        </TableCell>
                        <TableCell className="text-xs text-right font-mono">
                          {d.producedQty.toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            {/* Per machine-day breakdown */}
            <div>
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
                Per Machine / Day Breakdown
              </h3>
              <div className="rounded-lg border bg-card overflow-auto max-h-[55vh]">
                <Table>
                  <TableHeader className="sticky top-0 bg-card z-10">
                    <TableRow>
                      <TableHead className="text-xs">Day</TableHead>
                      <TableHead className="text-xs">Machine</TableHead>
                      <TableHead className="text-xs text-right">
                        Production (h)
                      </TableHead>
                      <TableHead className="text-xs text-right">
                        Changeover (h)
                      </TableHead>
                      <TableHead className="text-xs text-right">
                        Wait (h)
                      </TableHead>
                      <TableHead className="text-xs text-right">
                        Total (h)
                      </TableHead>
                      <TableHead className="text-xs text-right">
                        Utilization
                      </TableHead>
                      <TableHead className="text-xs text-right">
                        Produced Qty
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {perMachineDay.map((s) => (
                      <TableRow key={`${s.day}-${s.machineId}`}>
                        <TableCell className="text-xs">Day {s.day}</TableCell>
                        <TableCell className="text-xs">
                          <span className="font-mono">{s.machineId}</span>{" "}
                          <span className="text-muted-foreground">
                            {s.machineName}
                          </span>
                        </TableCell>
                        <TableCell className="text-xs text-right font-mono">
                          {fmt(s.productionHours)}
                        </TableCell>
                        <TableCell className="text-xs text-right font-mono">
                          {fmt(s.changeoverHours)}
                        </TableCell>
                        <TableCell className="text-xs text-right font-mono">
                          {fmt(s.waitHours)}
                        </TableCell>
                        <TableCell className="text-xs text-right font-mono font-semibold">
                          {fmt(s.totalUsedHours)}
                        </TableCell>
                        <TableCell className="text-xs text-right font-mono">
                          {(s.utilization * 100).toFixed(1)}%
                        </TableCell>
                        <TableCell className="text-xs text-right font-mono">
                          {s.producedQty.toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}

// ---- Small components ----

function SummaryCard({
  label,
  value,
  alert,
}: {
  label: string
  value: string
  alert?: boolean
}) {
  return (
    <Card>
      <CardHeader className="pb-1 pt-3 px-4">
        <CardTitle className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-3">
        <p
          className={`text-xl font-bold ${
            alert ? "text-destructive" : "text-card-foreground"
          }`}
        >
          {value}
        </p>
      </CardContent>
    </Card>
  )
}

function Legend() {
  return (
    <div className="flex flex-wrap gap-3 mb-2">
      {TASK_TYPES.map((t) => {
        const style = TASK_COLORS[t]
        return (
          <div key={t} className="flex items-center gap-1.5">
            <div className={`w-3 h-3 rounded-sm border ${style.bar}`} />
            <span className="text-xs text-muted-foreground">{style.label}</span>
          </div>
        )
      })}
    </div>
  )
}

function TaskDetail({ a }: { a: Assignment }) {
  if (a.task_type === "CHANGE_COLOR")
    return (
      <span>
        {a.from_color ?? "?"} {"->"} {a.to_color ?? "?"}
      </span>
    )
  if (a.task_type === "CHANGE_MOLD")
    return (
      <span>
        {a.from_mold_id ?? "?"} {"->"} {a.to_mold_id ?? "?"}
      </span>
    )
  if (a.task_type === "WAIT") return <span>Waiting</span>
  return null
}

function MachineTimeline({
  machineId,
  machineName,
  dayMap,
}: {
  machineId: string
  machineName: string
  dayMap: Record<number, Assignment[]>
}) {
  const [open, setOpen] = useState(true)
  const sortedDays = Object.keys(dayMap)
    .map(Number)
    .sort((a, b) => a - b)

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button className="flex items-center gap-2 w-full rounded-lg border bg-card px-4 py-2.5 text-left hover:bg-muted/50 transition-colors">
          {open ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
          )}
          <span className="font-mono text-sm font-semibold text-card-foreground">
            {machineId}
          </span>
          <span className="text-sm text-muted-foreground">{machineName}</span>
          <span className="ml-auto text-xs text-muted-foreground">
            {sortedDays.length} day{sortedDays.length !== 1 ? "s" : ""}
          </span>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="flex flex-col gap-1 pl-6 pt-1 pb-2">
          {sortedDays.map((day) => (
            <DayRow key={day} day={day} tasks={dayMap[day]} />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

function DayRow({ day, tasks }: { day: number; tasks: Assignment[] }) {
  const maxHour = Math.max(...tasks.map((t) => t.end_hour), 1)

  return (
    <div className="rounded-md border bg-card/60 p-3">
      <p className="text-xs font-medium text-muted-foreground mb-2">
        Day {day}
      </p>
      <div className="flex flex-col gap-1.5">
        {tasks.map((t, i) => {
          const style = TASK_COLORS[t.task_type] ?? TASK_COLORS.WAIT
          const widthPct = Math.max(((t.used_hours / maxHour) * 100), 8)

          return (
            <div key={i} className="flex items-center gap-2">
              <div
                className={`rounded border px-2.5 py-1 flex items-center gap-2 text-xs ${style.bar}`}
                style={{ width: `${widthPct}%`, minWidth: "fit-content" }}
              >
                <span className="font-semibold shrink-0">{t.task_type}</span>
                <span className="text-muted-foreground shrink-0">
                  {fmt(t.start_hour)}{"-"}{fmt(t.end_hour)}h
                </span>
                <span className="text-muted-foreground shrink-0">
                  ({fmt(t.used_hours)}h)
                </span>
                {t.utilization != null && (
                  <span className="text-muted-foreground shrink-0">
                    {(t.utilization * 100).toFixed(1)}%
                  </span>
                )}
              </div>
              <span className="text-xs text-muted-foreground truncate">
                {t.task_type === "PRODUCE" && (
                  <>
                    {t.component_id} {t.component_name}{" "}
                    <span className="font-mono">
                      x{t.produced_qty?.toLocaleString()}
                    </span>{" "}
                    [{t.mold_id}, {t.color}]
                  </>
                )}
                {t.task_type === "CHANGE_COLOR" && (
                  <>
                    {t.from_color ?? "?"} {"->"} {t.to_color ?? "?"}
                  </>
                )}
                {t.task_type === "CHANGE_MOLD" && (
                  <>
                    {t.from_mold_id ?? "?"} {"->"} {t.to_mold_id ?? "?"}
                  </>
                )}
                {t.task_type === "WAIT" && "Waiting"}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
