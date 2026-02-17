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
import { Checkbox } from "@/components/ui/checkbox"
import { ScrollArea } from "@/components/ui/scroll-area"
import type { Component, Mold } from "@/lib/types"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  component: Component | null
  existingIds: string[]
  allComponents: Component[]
  molds: Mold[]
  onSave: (component: Component) => void
}

const EMPTY: Component = {
  id: "",
  name: "",
  quantity: 0,
  cycle_time_sec: 0,
  mold_id: "",
  color: "",
  due_day: 1,
  lead_time_days: 0,
  prerequisites: [],
}

export function ComponentFormDialog({
  open,
  onOpenChange,
  component,
  existingIds,
  allComponents,
  molds,
  onSave,
}: Props) {
  const isEdit = component !== null
  const [form, setForm] = useState<Component>(EMPTY)
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    setForm(component ?? EMPTY)
    setErrors({})
  }, [component, open])

  // Available prerequisites: all components except self
  const availablePrereqs = allComponents.filter((c) => c.id !== form.id)

  function togglePrereq(id: string) {
    setForm((prev) => ({
      ...prev,
      prerequisites: prev.prerequisites.includes(id)
        ? prev.prerequisites.filter((p) => p !== id)
        : [...prev.prerequisites, id],
    }))
  }

  function validate(): boolean {
    const e: Record<string, string> = {}
    if (!form.id.trim()) e.id = "ID is required"
    else if (!isEdit && existingIds.includes(form.id.trim()))
      e.id = "ID already exists"
    if (form.quantity <= 0) e.quantity = "Quantity must be > 0"
    if (form.cycle_time_sec <= 0)
      e.cycle_time_sec = "Cycle time must be > 0"
    if (form.due_day < 1) e.due_day = "Due day must be >= 1"
    if (form.lead_time_days < 0)
      e.lead_time_days = "Lead time must be >= 0"
    if (!form.mold_id) e.mold_id = "Mold is required"
    setErrors(e)
    return Object.keys(e).length === 0
  }

  function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault()
    if (!validate()) return
    onSave({ ...form, id: form.id.trim(), name: form.name.trim() })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-card-foreground">
            {isEdit ? "Edit Component" : "Add Component"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4">
            {/* ID */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="comp-id">ID</Label>
              <Input
                id="comp-id"
                value={form.id}
                disabled={isEdit}
                onChange={(e) => setForm({ ...form, id: e.target.value })}
              />
              {errors.id && (
                <p className="text-xs text-destructive">{errors.id}</p>
              )}
            </div>

            {/* Name */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="comp-name">Name</Label>
              <Input
                id="comp-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Quantity */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="comp-qty">Quantity</Label>
              <Input
                id="comp-qty"
                type="number"
                value={form.quantity || ""}
                onChange={(e) =>
                  setForm({
                    ...form,
                    quantity: parseInt(e.target.value) || 0,
                  })
                }
              />
              {errors.quantity && (
                <p className="text-xs text-destructive">{errors.quantity}</p>
              )}
            </div>

            {/* Cycle Time */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="comp-cycle">Cycle Time (sec)</Label>
              <Input
                id="comp-cycle"
                type="number"
                step="any"
                value={form.cycle_time_sec || ""}
                onChange={(e) =>
                  setForm({
                    ...form,
                    cycle_time_sec: parseFloat(e.target.value) || 0,
                  })
                }
              />
              {errors.cycle_time_sec && (
                <p className="text-xs text-destructive">
                  {errors.cycle_time_sec}
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Mold */}
            <div className="flex flex-col gap-1.5">
              <Label>Mold</Label>
              <Select
                value={form.mold_id}
                onValueChange={(v) => setForm({ ...form, mold_id: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select mold" />
                </SelectTrigger>
                <SelectContent>
                  {molds.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.id} - {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.mold_id && (
                <p className="text-xs text-destructive">{errors.mold_id}</p>
              )}
            </div>

            {/* Color */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="comp-color">Color</Label>
              <Input
                id="comp-color"
                value={form.color}
                onChange={(e) => setForm({ ...form, color: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Due Day */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="comp-due">Due Day</Label>
              <Input
                id="comp-due"
                type="number"
                value={form.due_day || ""}
                onChange={(e) =>
                  setForm({
                    ...form,
                    due_day: parseInt(e.target.value) || 0,
                  })
                }
              />
              {errors.due_day && (
                <p className="text-xs text-destructive">{errors.due_day}</p>
              )}
            </div>

            {/* Lead Time */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="comp-lead">Lead Time (days)</Label>
              <Input
                id="comp-lead"
                type="number"
                value={form.lead_time_days ?? ""}
                onChange={(e) =>
                  setForm({
                    ...form,
                    lead_time_days: parseInt(e.target.value) || 0,
                  })
                }
              />
              {errors.lead_time_days && (
                <p className="text-xs text-destructive">
                  {errors.lead_time_days}
                </p>
              )}
            </div>
          </div>

          {/* Prerequisites */}
          <div className="flex flex-col gap-1.5">
            <Label>Prerequisites</Label>
            <p className="text-xs text-muted-foreground">
              Select component dependencies. Dependencies must not form a cycle
              (backend will validate).
            </p>
            {availablePrereqs.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">
                No other components available.
              </p>
            ) : (
              <ScrollArea className="h-32 rounded-md border p-2">
                <div className="flex flex-col gap-2">
                  {availablePrereqs.map((c) => (
                    <label
                      key={c.id}
                      className="flex items-center gap-2 text-sm cursor-pointer"
                    >
                      <Checkbox
                        checked={form.prerequisites.includes(c.id)}
                        onCheckedChange={() => togglePrereq(c.id)}
                      />
                      <span className="font-mono text-xs">{c.id}</span>
                      <span className="text-muted-foreground">{c.name}</span>
                    </label>
                  ))}
                </div>
              </ScrollArea>
            )}
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
