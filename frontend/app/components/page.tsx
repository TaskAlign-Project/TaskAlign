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
import { ComponentFormDialog } from "@/components/component-form-dialog"
import {
  getComponents,
  setComponents,
  getMolds,
} from "@/lib/storage"
import type { Component, Mold } from "@/lib/types"
import { toast } from "sonner"

export default function ComponentsPage() {
  const [components, setLocal] = useState<Component[]>([])
  const [molds, setMoldsLocal] = useState<Mold[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Component | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)

  useEffect(() => {
    setLocal(getComponents())
    setMoldsLocal(getMolds())
  }, [])

  function persist(next: Component[]) {
    setLocal(next)
    setComponents(next)
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

  return (
    <div className="flex flex-col h-full">
      <AppHeader
        title="Components"
        description="Manage parts to be produced"
      />
      <div className="flex-1 p-4 md:p-6 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {components.length} component{components.length !== 1 && "s"}
          </p>
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

        <div className="rounded-lg border bg-card overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Name</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Cycle (s)</TableHead>
                <TableHead>Mold</TableHead>
                <TableHead>Color</TableHead>
                <TableHead className="text-right">Due</TableHead>
                <TableHead className="text-right">Lead</TableHead>
                <TableHead>Dependencies</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {components.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={10}
                    className="text-center py-8 text-muted-foreground"
                  >
                    No components yet. Add one to get started.
                  </TableCell>
                </TableRow>
              ) : (
                components.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-mono text-sm">{c.id}</TableCell>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell className="text-right">
                      {c.quantity.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right">
                      {c.cycle_time_sec}
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {c.mold_id}
                    </TableCell>
                    <TableCell>{c.color}</TableCell>
                    <TableCell className="text-right">{c.due_day}</TableCell>
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
                          c.prerequisites.map((p) => (
                            <Badge
                              key={p}
                              variant="outline"
                              className="text-xs font-mono"
                            >
                              {p}
                            </Badge>
                          ))
                        )}
                      </div>
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
                ))
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
        molds={molds}
        onSave={handleSave}
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
