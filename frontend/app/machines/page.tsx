"use client"

import { useEffect, useState } from "react"
import { Plus, Pencil, Trash2 } from "lucide-react"
import { AppHeader } from "@/components/app-header"
import { Button } from "@/components/ui/button"
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
import { getMachines, setMachines } from "@/lib/storage"
import type { Machine } from "@/lib/types"
import { toast } from "sonner"

export default function MachinesPage() {
  const [machines, setLocal] = useState<Machine[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Machine | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)

  useEffect(() => {
    setLocal(getMachines())
  }, [])

  function persist(next: Machine[]) {
    setLocal(next)
    setMachines(next)
  }

  function handleSave(m: Machine) {
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

  return (
    <div className="flex flex-col h-full">
      <AppHeader
        title="Machines"
        description="Manage your injection molding machines"
      />
      <div className="flex-1 p-4 md:p-6 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {machines.length} machine{machines.length !== 1 && "s"}
          </p>
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
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {machines.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="text-center py-8 text-muted-foreground"
                  >
                    No machines yet. Add one to get started.
                  </TableCell>
                </TableRow>
              ) : (
                machines.map((m) => (
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
