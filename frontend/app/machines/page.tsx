"use client"

import { useEffect, useState, useMemo } from "react"
import { Plus, Pencil, Trash2, Search, Upload } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { AppHeader } from "@/components/app-header"
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
import { machinesApi } from "@/lib/api"
import type { PlanMachine, MachineStatus } from "@/lib/types"
import { toast } from "sonner"

export default function MachinesPage() {
  const [machines, setMachines] = useState<PlanMachine[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [editing, setEditing] = useState<PlanMachine | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const [searchQuery, setSearchQuery] = useState("")
  const [groupFilter, setGroupFilter] = useState<"all" | "small" | "medium" | "large">("all")
  const [statusFilter, setStatusFilter] = useState<"all" | "available" | "unavailable">("all")

  // Load from backend
  async function loadMachines() {
    try {
      setLoading(true)
      const data = await machinesApi.list()
      setMachines(data)
    } catch {
      toast.error("Failed to load machines")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadMachines()
  }, [])

  // Create / Update
  async function handleSave(m: PlanMachine) {
    try {
      if (editing) {
        await machinesApi.update(m.id, m)
        toast.success(`Machine "${m.name}" updated`)
      } else {
        await machinesApi.create(m)
        toast.success(`Machine "${m.name}" created`)
      }
      setEditing(null)
      loadMachines()
    } catch {
      toast.error("Failed to save machine")
    }
  }

  // Delete
  async function handleDelete() {
    if (!deleteTarget) return
    try {
      await machinesApi.delete(deleteTarget)
      toast.success("Machine deleted")
      setDeleteTarget(null)
      loadMachines()
    } catch {
      toast.error("Failed to delete machine")
    }
  }

  // Status Update
  async function handleStatusChange(machineId: string, status: MachineStatus) {
    try {
      const machine = machines.find((m) => m.id === machineId)
      if (!machine) return
      await machinesApi.update(machineId, { ...machine, status })
      toast.success(`Status updated`)
      loadMachines()
    } catch {
      toast.error("Failed to update status")
    }
  }

  // Import
  async function handleImport(_: any, mode: "replace" | "append") {
    try {
      // ExcelImportDialog will send file directly to backend
      toast.success("Import completed")
      loadMachines()
    } catch {
      toast.error("Import failed")
    }
  }

  const filteredMachines = useMemo(() => {
    let result = machines

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(
        (m) =>
          m.id.toLowerCase().includes(q) ||
          m.name.toLowerCase().includes(q)
      )
    }

    if (groupFilter !== "all") {
      result = result.filter((m) => m.group === groupFilter)
    }

    if (statusFilter !== "all") {
      result = result.filter((m) => m.status === statusFilter)
    }

    return result
  }, [machines, searchQuery, groupFilter, statusFilter])

  if (loading) return null

  return (
    <div className="flex flex-col h-full">
      <AppHeader
        title="Machines"
        description="Manage global injection molding machines"
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

        {/* Table */}
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
              {filteredMachines.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="font-mono text-sm">{m.code ?? m.id}</TableCell>
                  <TableCell>{m.name}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{m.group}</Badge>
                  </TableCell>
                  <TableCell className="text-right">{m.tonnage}</TableCell>
                  <TableCell className="text-right">{m.hours_per_day}</TableCell>
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
                        <SelectItem value="available">Available</SelectItem>
                        <SelectItem value="unavailable">Unavailable</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>

                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setEditing(m)
                          setDialogOpen(true)
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>

                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setDeleteTarget(m.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <MachineFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        machine={editing}
        existingIds={machines.map((m) => m.code ?? m.id)}
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
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}