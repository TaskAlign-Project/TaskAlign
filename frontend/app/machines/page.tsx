"use client"

import { useEffect, useState, useMemo } from "react"
import { Plus, Pencil, Trash2, Search, Upload } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { AppHeader } from "@/components/app-header"
import { NoPlanState } from "@/components/no-plan-state"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ExcelImportDialog } from "@/components/excel-import-dialog"
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
import { MachineFormDialog } from "@/components/machine-form-dialog"
import { getActivePlan, updateActivePlanMachines } from "@/lib/storage"
import type { PlanMachine, MachineStatus, Plan } from "@/lib/types"
import { toast } from "sonner"

export default function MachinesPage() {
  const [plan, setPlan] = useState<Plan | null>(null)
  const [machines, setLocal] = useState<PlanMachine[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [editing, setEditing] = useState<PlanMachine | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)

  // Filter state
  const [searchQuery, setSearchQuery] = useState("")
  const [groupFilter, setGroupFilter] = useState<"all" | "small" | "medium" | "large">("all")
  const [statusFilter, setStatusFilter] = useState<"all" | "available" | "unavailable">("all")

  useEffect(() => {
    const activePlan = getActivePlan()
    setPlan(activePlan)
    setLocal(activePlan?.machines ?? [])
    setLoaded(true)
  }, [])

  function persist(next: PlanMachine[]) {
    setLocal(next)
    updateActivePlanMachines(next)
  }

  function handleSave(m: PlanMachine) {
    if (editing) {
      persist(machines.map((x) => (x.id === m.id ? m : x)))
      toast.success(`Machine "${m.name}" updated`)
    } else {
      persist([...machines, m])
      toast.success(`Machine "${m.name}" created`)
    }
    setEditing(null)
  }

  function handleDelete() {
    if (!deleteTarget) return
    persist(machines.filter((m) => m.id !== deleteTarget))
    toast.success("Machine deleted")
    setDeleteTarget(null)
  }

  function handleStatusChange(machineId: string, status: MachineStatus) {
    const updated = machines.map((m) =>
      m.id === machineId ? { ...m, status } : m
    )
    persist(updated)
    toast.success(`Machine status updated to ${status}`)
  }

  function handleImport(data: PlanMachine[], mode: "replace" | "append") {
    if (mode === "replace") {
      persist(data)
      toast.success(`Imported ${data.length} machines (replaced all)`)
    } else {
      // Append, but skip duplicates by ID
      const existingIds = new Set(machines.map((m) => m.id))
      const newMachines = data.filter((m) => !existingIds.has(m.id))
      const skipped = data.length - newMachines.length
      persist([...machines, ...newMachines])
      toast.success(
        `Imported ${newMachines.length} machines${skipped > 0 ? ` (${skipped} duplicates skipped)` : ""}`
      )
    }
  }

  // Filter machines
  const filteredMachines = useMemo(() => {
    let result = machines

    // Search by ID or name
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(
        (m) =>
          m.id.toLowerCase().includes(q) ||
          m.name.toLowerCase().includes(q)
      )
    }

    // Filter by group
    if (groupFilter !== "all") {
      result = result.filter((m) => m.group === groupFilter)
    }

    // Filter by status
    if (statusFilter !== "all") {
      result = result.filter((m) => m.status === statusFilter)
    }

    return result
  }, [machines, searchQuery, groupFilter, statusFilter])

  if (!loaded) return null

  if (!plan) {
    return (
      <div className="flex flex-col h-full">
        <AppHeader
          title="Machines"
          description="Manage your injection molding machines"
        />
        <NoPlanState description="Select or create a plan to manage machines." />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <AppHeader
        title="Machines"
        description={`Managing machines for "${plan.name}"`}
      />
      <div className="flex-1 p-4 md:p-6 flex flex-col gap-4 overflow-y-auto">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            {filteredMachines.length} of {machines.length} machine{machines.length !== 1 && "s"}
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
              Add Machine
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
            <Label className="text-xs">Group</Label>
            <Select value={groupFilter} onValueChange={(v) => setGroupFilter(v as typeof groupFilter)}>
              <SelectTrigger className="w-32 h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Groups</SelectItem>
                <SelectItem value="small">Small</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="large">Large</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Status</Label>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
              <SelectTrigger className="w-32 h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="available">Available</SelectItem>
                <SelectItem value="unavailable">Unavailable</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {(searchQuery || groupFilter !== "all" || statusFilter !== "all") && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearchQuery("")
                setGroupFilter("all")
                setStatusFilter("all")
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
                <TableHead>Group</TableHead>
                <TableHead className="text-right">Tonnage</TableHead>
                <TableHead className="text-right">Hours/Day</TableHead>
                <TableHead className="text-right">Efficiency</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredMachines.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className="text-center py-8 text-muted-foreground"
                  >
                    {machines.length === 0
                      ? "No machines yet. Add one to get started."
                      : "No machines match the current filters."}
                  </TableCell>
                </TableRow>
              ) : (
                filteredMachines.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="font-mono text-sm">{m.id}</TableCell>
                    <TableCell className="font-medium">{m.name}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="capitalize">
                        {m.group}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">{m.tonnage}</TableCell>
                    <TableCell className="text-right">
                      {m.hours_per_day}
                    </TableCell>
                    <TableCell className="text-right">{m.efficiency}</TableCell>
                    <TableCell>
                      <Select
                        value={m.status}
                        onValueChange={(v) =>
                          handleStatusChange(m.id, v as MachineStatus)
                        }
                      >
                        <SelectTrigger className="w-[120px] h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="available">
                            <span className="flex items-center gap-2">
                              <span className="h-2 w-2 rounded-full bg-emerald-500" />
                              Available
                            </span>
                          </SelectItem>
                          <SelectItem value="unavailable">
                            <span className="flex items-center gap-2">
                              <span className="h-2 w-2 rounded-full bg-red-500" />
                              Unavailable
                            </span>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setEditing(m)
                            setDialogOpen(true)
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                          <span className="sr-only">Edit {m.name}</span>
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleteTarget(m.id)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                          <span className="sr-only">Delete {m.name}</span>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <MachineFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        machine={editing}
        existingIds={machines.map((m) => m.id)}
        onSave={handleSave}
      />

      <ExcelImportDialog<PlanMachine>
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        type="machines"
        onImport={handleImport}
      />

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Machine</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this machine? This action cannot be
              undone.
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
