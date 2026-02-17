"use client"

import { useState, useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Label } from "@/components/ui/label"
import type { ScheduleResponse, Assignment } from "@/lib/types"

const TASK_TYPE_COLORS: Record<string, string> = {
  PRODUCE: "bg-accent text-accent-foreground",
  CHANGE_COLOR: "bg-chart-3/20 text-foreground",
  CHANGE_MOLD: "bg-chart-5/20 text-foreground",
  WAIT: "bg-muted text-muted-foreground",
}

export function ScheduleResults({ data }: { data: ScheduleResponse }) {
  const [filterDay, setFilterDay] = useState<string>("all")
  const [filterMachine, setFilterMachine] = useState<string>("all")

  const unmetEntries = Object.entries(data.unmet)
  const totalUnmetQty = unmetEntries.reduce((s, [, v]) => s + v, 0)

  // Unique days and machines for filters
  const days = useMemo(
    () => [...new Set(data.assignments.map((a) => a.day))].sort((a, b) => a - b),
    [data.assignments]
  )
  const machines = useMemo(
    () =>
      [...new Map(data.assignments.map((a) => [a.machine_id, a.machine_name])).entries()].sort(
        (a, b) => a[0].localeCompare(b[0])
      ),
    [data.assignments]
  )

  const filtered = useMemo(() => {
    let result = data.assignments
    if (filterDay !== "all") result = result.filter((a) => a.day === Number(filterDay))
    if (filterMachine !== "all") result = result.filter((a) => a.machine_id === filterMachine)
    return result
  }, [data.assignments, filterDay, filterMachine])

  // Timeline view: group by machine, then by day
  const timelineData = useMemo(() => {
    const grouped: Record<string, Record<number, Assignment[]>> = {}
    for (const a of data.assignments) {
      if (!grouped[a.machine_id]) grouped[a.machine_id] = {}
      if (!grouped[a.machine_id][a.day]) grouped[a.machine_id][a.day] = []
      grouped[a.machine_id][a.day].push(a)
    }
    // Sort each day's tasks by sequence
    for (const machineId of Object.keys(grouped)) {
      for (const day of Object.keys(grouped[machineId])) {
        grouped[machineId][Number(day)].sort(
          (a, b) => a.sequence_in_day - b.sequence_in_day
        )
      }
    }
    return grouped
  }, [data.assignments])

  return (
    <div className="flex flex-col gap-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Score
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-card-foreground">
              {data.score.toFixed(2)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Unmet Items
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-card-foreground">
              {unmetEntries.length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Unmet Qty
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-card-foreground">
              {totalUnmetQty.toLocaleString()}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Unmet Table */}
      {unmetEntries.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-2">
            Unmet Demand
          </h3>
          <div className="rounded-lg border bg-card overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Component ID</TableHead>
                  <TableHead className="text-right">Unmet Qty</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {unmetEntries.map(([id, qty]) => (
                  <TableRow key={id}>
                    <TableCell className="font-mono text-sm">{id}</TableCell>
                    <TableCell className="text-right font-medium text-destructive">
                      {qty.toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* Assignments */}
      <Tabs defaultValue="table">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
            Assignments ({data.assignments.length})
          </h3>
          <TabsList>
            <TabsTrigger value="table">Table</TabsTrigger>
            <TabsTrigger value="timeline">Timeline</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="table" className="mt-0">
          {/* Filters */}
          <div className="flex flex-wrap items-end gap-4 mb-4">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">Filter by Day</Label>
              <Select value={filterDay} onValueChange={setFilterDay}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Days</SelectItem>
                  {days.map((d) => (
                    <SelectItem key={d} value={String(d)}>
                      Day {d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">Filter by Machine</Label>
              <Select value={filterMachine} onValueChange={setFilterMachine}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Machines</SelectItem>
                  {machines.map(([id, name]) => (
                    <SelectItem key={id} value={id}>
                      {id} - {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">
              Showing {filtered.length} of {data.assignments.length}
            </p>
          </div>

          <div className="rounded-lg border bg-card overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Day</TableHead>
                  <TableHead>Machine</TableHead>
                  <TableHead>Seq</TableHead>
                  <TableHead>Task</TableHead>
                  <TableHead className="text-right">Start</TableHead>
                  <TableHead className="text-right">End</TableHead>
                  <TableHead className="text-right">Hours</TableHead>
                  <TableHead>Component</TableHead>
                  <TableHead className="text-right">Produced</TableHead>
                  <TableHead>Mold</TableHead>
                  <TableHead>Color</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={11}
                      className="text-center py-8 text-muted-foreground"
                    >
                      No assignments match filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((a, i) => (
                    <TableRow key={`${a.day}-${a.machine_id}-${a.sequence_in_day}-${i}`}>
                      <TableCell>{a.day}</TableCell>
                      <TableCell>
                        <span className="font-mono text-xs">{a.machine_id}</span>{" "}
                        <span className="text-muted-foreground text-xs">
                          {a.machine_name}
                        </span>
                      </TableCell>
                      <TableCell>{a.sequence_in_day}</TableCell>
                      <TableCell>
                        <Badge
                          className={
                            TASK_TYPE_COLORS[a.task_type] || "bg-muted text-muted-foreground"
                          }
                        >
                          {a.task_type}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {a.start_hour.toFixed(1)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {a.end_hour.toFixed(1)}
                      </TableCell>
                      <TableCell className="text-right">
                        {a.used_hours.toFixed(1)}
                      </TableCell>
                      <TableCell>
                        {a.task_type === "PRODUCE" ? (
                          <>
                            <span className="font-mono text-xs">
                              {a.component_id}
                            </span>{" "}
                            <span className="text-muted-foreground text-xs">
                              {a.component_name}
                            </span>
                          </>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {a.task_type === "PRODUCE"
                          ? a.produced_qty?.toLocaleString()
                          : "-"}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {a.task_type === "PRODUCE" ? a.mold_id : "-"}
                      </TableCell>
                      <TableCell>
                        {a.task_type === "PRODUCE" ? a.color : "-"}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="timeline" className="mt-0">
          <div className="flex flex-col gap-6">
            {Object.entries(timelineData)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([machineId, dayMap]) => {
                const machineName =
                  data.assignments.find((a) => a.machine_id === machineId)
                    ?.machine_name || machineId
                return (
                  <div key={machineId}>
                    <h4 className="text-sm font-semibold mb-2 text-card-foreground">
                      {machineId} - {machineName}
                    </h4>
                    <div className="flex flex-col gap-2">
                      {Object.entries(dayMap)
                        .sort(([a], [b]) => Number(a) - Number(b))
                        .map(([day, tasks]) => (
                          <div
                            key={day}
                            className="rounded-md border bg-card p-3"
                          >
                            <p className="text-xs font-medium text-muted-foreground mb-2">
                              Day {day}
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {tasks.map((t, i) => (
                                <div
                                  key={i}
                                  className={`rounded-md px-2.5 py-1.5 text-xs ${
                                    TASK_TYPE_COLORS[t.task_type] ||
                                    "bg-muted text-muted-foreground"
                                  }`}
                                >
                                  <span className="font-medium">
                                    {t.task_type}
                                  </span>
                                  {t.task_type === "PRODUCE" && (
                                    <span>
                                      {" "}
                                      {t.component_id} ({t.produced_qty})
                                    </span>
                                  )}
                                  <span className="opacity-70">
                                    {" "}
                                    {t.start_hour.toFixed(1)}-
                                    {t.end_hour.toFixed(1)}h
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                )
              })}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
