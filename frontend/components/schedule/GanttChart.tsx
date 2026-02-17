"use client"

import { useMemo, useState, useCallback, useRef } from "react"
import { cn } from "@/lib/utils"
import type { Assignment } from "@/lib/types"
import {
  computeTimeRange,
  groupByMachine,
  barLeftPercent,
  barWidthPercent,
  barLabel,
  generateDayColumns,
  generateHourTicks,
  toAbsoluteHour,
} from "@/lib/gantt"
import { Badge } from "@/components/ui/badge"

// ---- Zoom presets (px per hour) ----
const ZOOM_PRESETS = [
  { label: "50%", pxPerHour: 20 },
  { label: "100%", pxPerHour: 40 },
  { label: "150%", pxPerHour: 60 },
] as const

// ---- Task bar colors (solid, visible in Gantt) ----
const GANTT_COLORS: Record<
  string,
  { bg: string; border: string; text: string }
> = {
  PRODUCE: {
    bg: "bg-emerald-500",
    border: "border-emerald-600",
    text: "text-emerald-50",
  },
  WAIT: {
    bg: "bg-zinc-400",
    border: "border-zinc-500",
    text: "text-zinc-50",
  },
  CHANGE_MOLD: {
    bg: "bg-amber-500",
    border: "border-amber-600",
    text: "text-amber-50",
  },
  CHANGE_COLOR: {
    bg: "bg-sky-500",
    border: "border-sky-600",
    text: "text-sky-50",
  },
}

const ROW_HEIGHT = 44
const HEADER_HEIGHT = 52
const LABEL_WIDTH = 180

interface GanttChartProps {
  assignments: Assignment[]
  /** Optional: filter to specific day range */
  dayStart?: number
  dayEnd?: number
}

export function GanttChart({
  assignments,
  dayStart,
  dayEnd,
}: GanttChartProps) {
  const [zoomIdx, setZoomIdx] = useState(1)
  const [hoveredTask, setHoveredTask] = useState<Assignment | null>(null)
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 })
  const scrollRef = useRef<HTMLDivElement>(null)

  const pxPerHour = ZOOM_PRESETS[zoomIdx].pxPerHour

  // Filter assignments by day range if provided
  const filteredAssignments = useMemo(() => {
    let arr = assignments
    if (dayStart != null) arr = arr.filter((a) => a.day >= dayStart)
    if (dayEnd != null) arr = arr.filter((a) => a.day <= dayEnd)
    return arr
  }, [assignments, dayStart, dayEnd])

  const range = useMemo(
    () => computeTimeRange(filteredAssignments),
    [filteredAssignments]
  )
  const machineRows = useMemo(
    () => groupByMachine(filteredAssignments),
    [filteredAssignments]
  )
  const dayColumns = useMemo(() => generateDayColumns(range), [range])
  const hourTicks = useMemo(() => generateHourTicks(range, 4), [range])

  const timelineWidth = range.totalHours * pxPerHour
  const totalHeight = HEADER_HEIGHT + machineRows.length * ROW_HEIGHT

  const handleMouseEnter = useCallback(
    (task: Assignment, e: React.MouseEvent) => {
      const rect = scrollRef.current?.getBoundingClientRect()
      if (!rect) return
      setHoveredTask(task)
      setTooltipPos({
        x: e.clientX - rect.left + 12,
        y: e.clientY - rect.top + 12,
      })
    },
    []
  )

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!hoveredTask) return
      const rect = scrollRef.current?.getBoundingClientRect()
      if (!rect) return
      setTooltipPos({
        x: e.clientX - rect.left + 12,
        y: e.clientY - rect.top + 12,
      })
    },
    [hoveredTask]
  )

  const handleMouseLeave = useCallback(() => {
    setHoveredTask(null)
  }, [])

  if (filteredAssignments.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-8 text-center">
        No assignments to display in the Gantt chart.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs font-medium text-muted-foreground">Zoom:</span>
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
        <div className="ml-auto flex items-center gap-2">
          <GanttLegend />
        </div>
      </div>

      {/* Chart container */}
      <div className="rounded-lg border bg-card overflow-hidden">
        <div className="flex">
          {/* Fixed machine label column */}
          <div
            className="shrink-0 border-r bg-muted/30"
            style={{ width: LABEL_WIDTH }}
          >
            {/* Header spacer */}
            <div
              className="flex items-end px-3 border-b bg-muted/50"
              style={{ height: HEADER_HEIGHT }}
            >
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider pb-1.5">
                Machine
              </span>
            </div>
            {/* Machine labels */}
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

          {/* Scrollable timeline area */}
          <div
            ref={scrollRef}
            className="flex-1 overflow-x-auto overflow-y-hidden relative"
            onMouseMove={handleMouseMove}
          >
            <div
              style={{ width: timelineWidth, height: totalHeight }}
              className="relative"
            >
              {/* ---- Header rows ---- */}
              <div
                className="sticky top-0 z-20"
                style={{ height: HEADER_HEIGHT }}
              >
                {/* Day labels */}
                <div className="flex border-b bg-muted/50" style={{ height: 28 }}>
                  {dayColumns.map((col) => {
                    const left =
                      ((col.startHour - range.rangeStart) /
                        range.totalHours) *
                      timelineWidth
                    const width = (24 / range.totalHours) * timelineWidth
                    return (
                      <div
                        key={col.day}
                        className="absolute top-0 flex items-center justify-center border-r text-[11px] font-semibold text-card-foreground"
                        style={{ left, width, height: 28 }}
                      >
                        Day {col.day}
                      </div>
                    )
                  })}
                </div>
                {/* Hour ticks */}
                <div
                  className="relative border-b bg-muted/30"
                  style={{ height: HEADER_HEIGHT - 28 }}
                >
                  {hourTicks.map((absH) => {
                    const left =
                      ((absH - range.rangeStart) / range.totalHours) *
                      timelineWidth
                    const hourInDay = absH % 24
                    return (
                      <div
                        key={absH}
                        className="absolute top-0 flex items-center justify-center text-[10px] text-muted-foreground"
                        style={{ left, width: 4 * pxPerHour, height: HEADER_HEIGHT - 28 }}
                      >
                        {hourInDay}h
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* ---- Vertical grid lines ---- */}
              {/* Day boundaries (thicker) */}
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
              {/* Last day end boundary */}
              {dayColumns.length > 0 && (
                <div
                  className="absolute top-0 bottom-0 border-l border-border/60"
                  style={{
                    left:
                      ((dayColumns[dayColumns.length - 1].endHour -
                        range.rangeStart) /
                        range.totalHours) *
                      timelineWidth,
                    height: totalHeight,
                  }}
                />
              )}
              {/* Hour grid lines (lighter) */}
              {hourTicks
                .filter((h) => h % 24 !== 0) // skip day boundaries
                .map((absH) => {
                  const left =
                    ((absH - range.rangeStart) / range.totalHours) *
                    timelineWidth
                  return (
                    <div
                      key={`hour-line-${absH}`}
                      className="absolute border-l border-border/20"
                      style={{
                        left,
                        top: HEADER_HEIGHT,
                        height: totalHeight - HEADER_HEIGHT,
                      }}
                    />
                  )
                })}

              {/* ---- Machine rows with task bars ---- */}
              {machineRows.map((row, rowIdx) => {
                const rowTop = HEADER_HEIGHT + rowIdx * ROW_HEIGHT
                return (
                  <div
                    key={row.machineId}
                    className="absolute w-full border-b border-border/30"
                    style={{
                      top: rowTop,
                      height: ROW_HEIGHT,
                    }}
                  >
                    {/* Alternating row bg */}
                    {rowIdx % 2 === 0 && (
                      <div className="absolute inset-0 bg-muted/10" />
                    )}

                    {/* Task bars */}
                    {row.tasks.map((task, taskIdx) => {
                      const leftPct = barLeftPercent(task, range)
                      const widthPct = barWidthPercent(task, range)
                      const colors =
                        GANTT_COLORS[task.task_type] ?? GANTT_COLORS.WAIT
                      const label = barLabel(task)

                      return (
                        <div
                          key={`${task.day}-${task.sequence_in_day}-${taskIdx}`}
                          className={cn(
                            "absolute rounded border flex items-center px-1.5 cursor-default overflow-hidden transition-opacity",
                            colors.bg,
                            colors.border,
                            colors.text,
                            hoveredTask === task ? "opacity-100 ring-2 ring-foreground/20" : "opacity-90 hover:opacity-100"
                          )}
                          style={{
                            left: `${leftPct}%`,
                            width: `${widthPct}%`,
                            top: 6,
                            height: ROW_HEIGHT - 12,
                            minWidth: 4,
                          }}
                          onMouseEnter={(e) => handleMouseEnter(task, e)}
                          onMouseLeave={handleMouseLeave}
                        >
                          <span className="text-[10px] font-medium truncate leading-none whitespace-nowrap">
                            {label}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>

            {/* Tooltip */}
            {hoveredTask && (
              <div
                className="absolute z-50 pointer-events-none"
                style={{ left: tooltipPos.x, top: tooltipPos.y }}
              >
                <TaskTooltip task={hoveredTask} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ---- Tooltip ----
function TaskTooltip({ task }: { task: Assignment }) {
  const colors = GANTT_COLORS[task.task_type] ?? GANTT_COLORS.WAIT

  return (
    <div className="rounded-lg border bg-popover text-popover-foreground shadow-lg p-3 min-w-[220px] max-w-[300px]">
      <div className="flex items-center gap-2 mb-2">
        <div className={cn("w-2.5 h-2.5 rounded-sm", colors.bg)} />
        <span className="text-xs font-semibold">{task.task_type}</span>
        <Badge variant="outline" className="text-[10px] ml-auto">
          Day {task.day}
        </Badge>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
        <span className="text-muted-foreground">Machine</span>
        <span className="font-mono">
          {task.machine_id} {task.machine_name}
        </span>
        <span className="text-muted-foreground">Time</span>
        <span className="font-mono">
          {task.start_hour.toFixed(1)}h &ndash; {task.end_hour.toFixed(1)}h
        </span>
        <span className="text-muted-foreground">Duration</span>
        <span className="font-mono">{task.used_hours.toFixed(2)}h</span>

        {task.task_type === "PRODUCE" && (
          <>
            <span className="text-muted-foreground">Component</span>
            <span>
              <span className="font-mono">{task.component_id}</span>{" "}
              {task.component_name}
            </span>
            <span className="text-muted-foreground">Mold</span>
            <span className="font-mono">{task.mold_id}</span>
            <span className="text-muted-foreground">Color</span>
            <span>{task.color}</span>
            <span className="text-muted-foreground">Qty Produced</span>
            <span className="font-mono font-semibold">
              {task.produced_qty?.toLocaleString()}
            </span>
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
            <span className="font-mono font-semibold">
              {task.to_mold_id ?? "?"}
            </span>
          </>
        )}

        {task.utilization != null && (
          <>
            <span className="text-muted-foreground">Utilization</span>
            <span className="font-mono">
              {(task.utilization * 100).toFixed(1)}%
            </span>
          </>
        )}
      </div>
    </div>
  )
}

// ---- Legend ----
function GanttLegend() {
  return (
    <div className="flex flex-wrap gap-3">
      {Object.entries(GANTT_COLORS).map(([type, colors]) => (
        <div key={type} className="flex items-center gap-1.5">
          <div className={cn("w-3 h-3 rounded-sm", colors.bg)} />
          <span className="text-[11px] text-muted-foreground">
            {type === "PRODUCE"
              ? "Production"
              : type === "WAIT"
                ? "Wait"
                : type === "CHANGE_MOLD"
                  ? "Mold Change"
                  : "Color Change"}
          </span>
        </div>
      ))}
    </div>
  )
}
