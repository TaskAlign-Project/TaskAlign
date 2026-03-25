"use client"

import { useEffect, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { Mold, Component } from "@/lib/types"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  mold: Mold | null
  existingIds: string[]
  allComponents: Component[]
  onSave: (mold: Mold) => void
}

const EMPTY: Mold = {
  id: "",       // UUID — empty for new, filled by backend
  code: "",     // e.g. "MLD-001"
  name: "",
  group: "small",
  tonnage: 0,
  component_id: "",
}

export function MoldFormDialog({
  open,
  onOpenChange,
  mold,
  existingIds,
  allComponents,
  onSave,
}: Props) {
  const isEdit = mold !== null
  const [form, setForm] = useState<Mold>(EMPTY)
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    setForm(mold ? { ...mold, component_id: mold.component_id ?? "" } : EMPTY)
    setErrors({})
  }, [mold, open])

  function validate(): boolean {
    const e: Record<string, string> = {}
    if (!form.code.trim()) e.code = "Code is required"
    else if (!isEdit && existingIds.includes(form.code.trim()))
      e.code = "Code already exists"
    if (form.tonnage <= 0) e.tonnage = "Tonnage must be > 0"
    setErrors(e)
    return Object.keys(e).length === 0
  }

  function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault()
    if (!validate()) return
    onSave({ ...form, code: form.code.trim(), name: form.name.trim() })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-card-foreground">
            {isEdit ? "Edit Mold" : "Add Mold"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="mold-code">Code</Label>
            <Input
              id="mold-code"
              value={form.code}
              disabled={isEdit}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
              placeholder="e.g. MLD-001"
            />
            {errors.code && (
              <p className="text-xs text-destructive">{errors.code}</p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="mold-name">Name</Label>
            <Input
              id="mold-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Group</Label>
            <Select
              value={form.group}
              onValueChange={(v) =>
                setForm({ ...form, group: v as Mold["group"] })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="small">Small</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="large">Large</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="mold-tonnage">Tonnage</Label>
            <Input
              id="mold-tonnage"
              type="number"
              step="any"
              value={form.tonnage || ""}
              onChange={(e) =>
                setForm({ ...form, tonnage: parseFloat(e.target.value) || 0 })
              }
            />
            {errors.tonnage && (
              <p className="text-xs text-destructive">{errors.tonnage}</p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Component ID</Label>
            <p className="text-xs text-muted-foreground">
              Select the component that uses this mold.
            </p>
            <Select
              value={form.component_id || "__none__"}
              onValueChange={(v) =>
                setForm({ ...form, component_id: v === "__none__" ? "" : v })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select component (optional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">None</SelectItem>
                {allComponents.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    <span className="font-mono">{c.id}</span> - {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-md bg-muted px-3 py-2">
            <p className="text-xs text-muted-foreground leading-relaxed">
              Note: Mold group must match machine group, and mold tonnage must
              be &lt;= machine tonnage for a valid assignment.
            </p>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit">{isEdit ? "Update" : "Create"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
