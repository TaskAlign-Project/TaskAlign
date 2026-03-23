"use client"

import { useEffect, useState, useMemo } from "react"
import { Plus, Pencil, Trash2, Search, Upload } from "lucide-react"
import { AppHeader } from "@/components/app-header"
import { NoPlanState } from "@/components/no-plan-state"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ExcelImportDialog } from "@/components/excel-import-dialog"
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { ComponentFormDialog } from "@/components/component-form-dialog"
import { getActivePlan, updateActivePlanComponents } from "@/lib/storage"
import type { Component, Plan } from "@/lib/types"
import { toast } from "sonner"

export default function ComponentsPage() {
  const [plan, setPlan] = useState<Plan | null>(null)
  const [components, setLocal] = useState<Component[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Component | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)

  // Filter state
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<"all" | "done" | "undone">("all")
  const [startDateFilter, setStartDateFilter] = useState("")
  const [dueDateFilter, setDueDateFilter] = useState("")

  useEffect(() => {
    const activePlan = getActivePlan()
    setPlan(activePlan)
    setLocal(activePlan?.components ?? [])
    setLoaded(true)
  }, [])

  function persist(next: Component[]) {
    setLocal(next)
    updateActivePlanComponents(next)
  }

  function handleSave(c: Component) {
    if (editing) {
      persist(components.map((x) => (x.id === c.id ? c : x)))
      toast.success(`Component "${c.name}" updated`)
    } else {
      persist([...components, c])
      toast.success(`Component "${c.name}" created`)
    }
    setEditing(null)
  }

  function handleDelete() {
    if (!deleteTarget) return
    persist(components.filter((c) => c.id !== deleteTarget))
    toast.success("Component deleted")
    setDeleteTarget(null)
  }

  function handleImport(data: Component[], mode: "replace" | "append") {
    if (mode === "replace") {
      persist(data)
      toast.success(`Imported ${data.length} components (replaced all)`)
    } else {
      const existingIds = new Set(components.map((c) => c.id))
      const newComponents = data.filter((c) => !existingIds.has(c.id))
      const skipped = data.length - newComponents.length
      persist([...components, ...newComponents])
      toast.success(
        `Imported ${newComponents.length} components${skipped > 0 ? ` (${skipped} duplicates skipped)` : ""}`
      )
    }
  }

  // Filter components
  const filteredComponents = useMemo(() => {
    let result = components

    // Search by ID or name
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(
        (c) =>
          c.id.toLowerCase().includes(q) ||
          c.name.toLowerCase().includes(q)
      )
    }

    // Filter by status
    if (statusFilter === "done") {
      result = result.filter((c) => (c.finished ?? 0) >= c.quantity && c.quantity > 0)
    } else if (statusFilter === "undone") {
      result = result.filter((c) => (c.finished ?? 0) < c.quantity || c.quantity === 0)
    }

    // Filter by start date
    if (startDateFilter) {
      result = result.filter((c) => c.start_date && c.start_date >= startDateFilter)
    }

    // Filter by due date
    if (dueDateFilter) {
      result = result.filter((c) => c.due_date && c.due_date <= dueDateFilter)
    }

    return result
  }, [components, searchQuery, statusFilter, startDateFilter, dueDateFilter])

  if (!loaded) return null

  if (!plan) {
    return (
      <div className="flex flex-col h-full">
        <AppHeader
          title="Components"
          description="Manage parts to be produced"
        />
        <NoPlanState description="Select or create a plan to manage components." />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <AppHeader
        title="Components"
        description={`Managing components for "${plan.name}"`}
      />
      <div className="flex-1 p-4 md:p-6 flex flex-col gap-4 overflow-y-auto">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            {filteredComponents.length} of {components.length} component{components.length !== 1 && "s"}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setImportDialogOpen(true)}
            >
              <Upload className="mr-2 h-4 w-4" />
              Import from Excel
            </Button>
            <Button
              onClick={() => {
                setEditing(null)
                setDialogOpen(true)
              }}
            >
              <Plus className="mr-2 h-4 w-4" />
              Add Component
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-end gap-4 p-3 rounded-lg border bg-muted/30">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Search</Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by ID or name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 w-48 h-8"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Status</Label>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
              <SelectTrigger className="w-32 h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="done">Done</SelectItem>
                <SelectItem value="undone">Undone</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Start Date From</Label>
            <Input
              type="date"
              value={startDateFilter}
              onChange={(e) => setStartDateFilter(e.target.value)}
              className="w-36 h-8"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Due Date Until</Label>
            <Input
              type="date"
              value={dueDateFilter}
              onChange={(e) => setDueDateFilter(e.target.value)}
              className="w-36 h-8"
            />
          </div>

          {(searchQuery || statusFilter !== "all" || startDateFilter || dueDateFilter) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearchQuery("")
                setStatusFilter("all")
                setStartDateFilter("")
                setDueDateFilter("")
              }}
              className="h-8"
            >
              Clear filters
            </Button>
          )}
        </div>

        <div className="rounded-lg border bg-card overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Name</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Finished</TableHead>
                <TableHead className="text-right">Cycle (s)</TableHead>
                <TableHead>Mold</TableHead>
                <TableHead>Color</TableHead>
                <TableHead>Start Date</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead className="text-right">Lead</TableHead>
                <TableHead>Dependencies</TableHead>
                <TableHead>Order Code</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredComponents.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={13}
                    className="text-center py-8 text-muted-foreground"
                  >
                    {components.length === 0
                      ? "No components yet. Add one to get started."
                      : "No components match the current filters."}
                  </TableCell>
                </TableRow>
              ) : (
                filteredComponents.map((c) => {
                  const isComplete = (c.finished ?? 0) >= c.quantity && c.quantity > 0
                  return (
                    <TableRow
                      key={c.id}
                      className={isComplete ? "bg-emerald-500/10" : ""}
                    >
                      <TableCell className="font-mono text-sm">
                        {c.id}
                        {isComplete && (
                          <Badge variant="default" className="ml-2 text-[10px] bg-emerald-600">
                            Done
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell className="text-right">
                        {c.quantity.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right">
                        {(c.finished ?? 0).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right">
                        {c.cycle_time_sec}
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {c.mold_id}
                      </TableCell>
                      <TableCell>{c.color}</TableCell>
                      <TableCell className="text-xs">
                        {c.start_date ? new Date(c.start_date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "-"}
                      </TableCell>
                      <TableCell className="text-xs">
                        {c.due_date ? new Date(c.due_date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        {c.lead_time_days}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {c.prerequisites.length === 0 ? (
                            <span className="text-xs text-muted-foreground">
                              None
                            </span>
                          ) : (
                            <>
                              {c.prerequisites.slice(0, 2).map((p) => (
                                <Badge
                                  key={p}
                                  variant="outline"
                                  className="text-xs font-mono"
                                >
                                  {p}
                                </Badge>
                              ))}
                              {c.prerequisites.length > 2 && (
                                <Badge variant="secondary" className="text-xs">
                                  +{c.prerequisites.length - 2} more
                                </Badge>
                              )}
                            </>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {c.order_code ? (
                          <Badge variant="outline" className="text-xs font-mono">
                            {c.order_code}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">None</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setEditing(c)
                              setDialogOpen(true)
                            }}
                          >
                            <Pencil className="h-4 w-4" />
                            <span className="sr-only">Edit {c.name}</span>
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setDeleteTarget(c.id)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                            <span className="sr-only">Delete {c.name}</span>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <ComponentFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        component={editing}
        existingIds={components.map((c) => c.id)}
        allComponents={components}
        molds={plan.molds}
        onSave={handleSave}
      />

      <ExcelImportDialog<Component>
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        type="components"
        onImport={handleImport}
      />

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Component</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this component? This action cannot
              be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
