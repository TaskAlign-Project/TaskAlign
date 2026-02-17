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
import { MoldFormDialog } from "@/components/mold-form-dialog"
import { getMolds, setMolds } from "@/lib/storage"
import type { Mold } from "@/lib/types"
import { toast } from "sonner"

export default function MoldsPage() {
  const [molds, setLocal] = useState<Mold[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Mold | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)

  useEffect(() => {
    setLocal(getMolds())
  }, [])

  function persist(next: Mold[]) {
    setLocal(next)
    setMolds(next)
  }

  function handleSave(m: Mold) {
    if (editing) {
      persist(molds.map((x) => (x.id === m.id ? m : x)))
      toast.success(`Mold "${m.name}" updated`)
    } else {
      persist([...molds, m])
      toast.success(`Mold "${m.name}" created`)
    }
    setEditing(null)
  }

  function handleDelete() {
    if (!deleteTarget) return
    persist(molds.filter((m) => m.id !== deleteTarget))
    toast.success("Mold deleted")
    setDeleteTarget(null)
  }

  return (
    <div className="flex flex-col h-full">
      <AppHeader
        title="Molds"
        description="Manage injection molds for your machines"
      />
      <div className="flex-1 p-4 md:p-6 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {molds.length} mold{molds.length !== 1 && "s"}
          </p>
          <Button
            onClick={() => {
              setEditing(null)
              setDialogOpen(true)
            }}
          >
            <Plus className="mr-2 h-4 w-4" />
            Add Mold
          </Button>
        </div>

        <div className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
          Mold group must match machine group. Mold tonnage must be &lt;= machine
          tonnage for a valid assignment.
        </div>

        <div className="rounded-lg border bg-card overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Group</TableHead>
                <TableHead className="text-right">Tonnage</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {molds.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="text-center py-8 text-muted-foreground"
                  >
                    No molds yet. Add one to get started.
                  </TableCell>
                </TableRow>
              ) : (
                molds.map((m) => (
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

      <MoldFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        mold={editing}
        existingIds={molds.map((m) => m.id)}
        onSave={handleSave}
      />

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Mold</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this mold? This action cannot be
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
