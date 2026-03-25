"use client"

import { useEffect, useState, useMemo } from "react"
import { Plus, Pencil, Trash2, Search, Upload } from "lucide-react"
import { AppHeader } from "@/components/app-header"
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
import { MoldFormDialog } from "@/components/mold-form-dialog"
import { moldsApi, componentsApi } from "@/lib/api"
import type { Mold, Component } from "@/lib/types"
import { toast } from "sonner"

export default function MoldsPage() {
  const [molds, setMolds] = useState<Mold[]>([])
  const [components, setComponents] = useState<Component[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Mold | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const [searchQuery, setSearchQuery] = useState("")
  const [groupFilter, setGroupFilter] = useState<"all" | "small" | "medium" | "large">("all")

  //  Load molds and components from backend
  async function loadMolds() {
  try {
    setLoading(true)
    // Try to get both, but don't crash if components fail (yet)
    const moldsData = await moldsApi.list()
    let componentsData: Component[] = []
    
    try {
      componentsData = await componentsApi.list()
    } catch (e) {
      console.warn("Components API not ready yet")
    }

    setMolds(moldsData)
    setComponents(componentsData)
  } catch (err) {
    console.error(err)
    toast.error("Failed to load molds from backend")
  } finally {
    setLoading(false)
  }
}

  useEffect(() => {
    loadMolds()
  }, [])

  //  Create / Update
  async function handleSave(m: Mold) {
    try {
      if (editing) {
        await moldsApi.update(m.id, { ...m })
        toast.success(`Mold "${m.name}" updated`)
      } else {
        await moldsApi.create(m)
        toast.success(`Mold "${m.name}" created`)
      }
      setEditing(null)
      loadMolds()
    } catch {
      toast.error("Failed to save mold")
    }
  }

  //  Delete
  async function handleDelete() {
    if (!deleteTarget) return
    try {
      await moldsApi.delete(deleteTarget)
      toast.success("Mold deleted")
      setDeleteTarget(null)
      loadMolds()
    } catch {
      toast.error("Failed to delete mold")
    }
  }

  //  Import
  async function handleImport(data: Mold[], mode: "replace" | "append") {
    try {
      if (mode === "replace") {
        // Delete all existing molds first
        await Promise.all(molds.map((m) => moldsApi.delete(m.id)))
      }

      // Create each imported mold
      await Promise.all(data.map((m) => moldsApi.create(m)))

      const skipped = mode === "append"
        ? data.length - data.length // adjust if backend returns duplicates
        : 0

      toast.success(`Imported ${data.length} molds`)
      loadMolds()
    } catch (err) {
      console.error(err)
      toast.error("Import failed — check console for details")
    }
  }

  const filteredMolds = useMemo(() => {
    let result = molds

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

    return result
  }, [molds, searchQuery, groupFilter])

  if (loading) return null

  return (
    <div className="flex flex-col h-full">
      <AppHeader
        title="Molds"
        description="Manage global injection molds"
      />

      <div className="flex-1 p-4 md:p-6 flex flex-col gap-4 overflow-y-auto">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            {filteredMolds.length} of {molds.length} mold{molds.length !== 1 && "s"}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setImportDialogOpen(true)}>
              <Upload className="mr-2 h-4 w-4" />
              Import from Excel
            </Button>
            <Button onClick={() => { setEditing(null); setDialogOpen(true) }}>
              <Plus className="mr-2 h-4 w-4" />
              Add Mold
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

          {(searchQuery || groupFilter !== "all") && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setSearchQuery(""); setGroupFilter("all") }}
              className="h-8"
            >
              Clear filters
            </Button>
          )}
        </div>

        <div className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
          Mold group must match machine group. Mold tonnage must be &lt;= machine tonnage for a valid assignment.
        </div>

        <div className="rounded-lg border bg-card overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Group</TableHead>
                <TableHead className="text-right">Tonnage</TableHead>
                <TableHead>Component ID</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredMolds.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    {molds.length === 0
                      ? "No molds yet. Add one to get started."
                      : "No molds match the current filters."}
                  </TableCell>
                </TableRow>
              ) : (
                filteredMolds.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="font-mono text-sm">{m.code}</TableCell>
                    <TableCell className="font-medium">{m.name}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="capitalize">{m.group}</Badge>
                    </TableCell>
                    <TableCell className="text-right">{m.tonnage}</TableCell>
                    <TableCell>
                      {m.component_id ? (
                        <Badge variant="outline" className="text-xs font-mono">
                          {m.component_id}
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
                          onClick={() => { setEditing(m); setDialogOpen(true) }}
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
        allComponents={components}
        onSave={handleSave}
      />

      <ExcelImportDialog<Mold>
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        type="molds"
        onImport={handleImport}
      />

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Mold</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone.
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