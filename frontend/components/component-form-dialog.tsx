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
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { ScrollArea } from "@/components/ui/scroll-area"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import type { Component, Mold, DependencyMode } from "@/lib/types"

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
  finished: 0,
  cycle_time_sec: 0,
  mold_id: "",
  color: "",
  start_date: new Date().toISOString().split("T")[0],
  due_date: new Date().toISOString().split("T")[0],
  lead_time_days: 0,
  prerequisites: [],
  dependency_mode: "wait",
  transfer_time_minutes: 0,
  order_code: "",
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
    if (component) {
      setForm({
        ...component,
        start_date: component.start_date ?? new Date().toISOString().split("T")[0],
        due_date: component.due_date ?? new Date().toISOString().split("T")[0],
        dependency_mode: component.dependency_mode ?? "wait",
        transfer_time_minutes: component.transfer_time_minutes ?? 0,
        order_code: component.order_code ?? "",
      })
    } else {
      setForm(EMPTY)
    }
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
    if ((form.finished ?? 0) < 0) e.finished = "Finished must be >= 0"
    if (form.cycle_time_sec <= 0)
      e.cycle_time_sec = "Cycle time must be > 0"
    if (!form.start_date) e.start_date = "Start date is required"
    if (!form.due_date) e.due_date = "Due date is required"
    if (form.start_date && form.due_date && form.start_date > form.due_date)
      e.start_date = "Start date must be before or equal to due date"
    if (form.lead_time_days < 0)
      e.lead_time_days = "Lead time must be >= 0"
    if (!form.mold_id) e.mold_id = "Mold is required"
    if ((form.transfer_time_minutes ?? 0) < 0)
      e.transfer_time_minutes = "Transfer time must be >= 0"
    setErrors(e)
    return Object.keys(e).length === 0
  }

  function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault()
    if (!validate()) return
    onSave({ ...form, id: form.id.trim(), name: form.name.trim() })
    onOpenChange(false)
  }

  const hasPrerequisites = form.prerequisites.length > 0

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

          <div className="grid grid-cols-3 gap-4">
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

            {/* Finished */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="comp-finished">Finished</Label>
              <Input
                id="comp-finished"
                type="number"
                value={form.finished ?? ""}
                onChange={(e) =>
                  setForm({
                    ...form,
                    finished: parseInt(e.target.value) || 0,
                  })
                }
              />
              {errors.finished && (
                <p className="text-xs text-destructive">{errors.finished}</p>
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

          <div className="grid grid-cols-3 gap-4">
            {/* Start Date */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="comp-start">Start Date</Label>
              <Input
                id="comp-start"
                type="date"
                value={form.start_date || ""}
                onChange={(e) =>
                  setForm({
                    ...form,
                    start_date: e.target.value,
                  })
                }
              />
              {errors.start_date && (
                <p className="text-xs text-destructive">{errors.start_date}</p>
              )}
            </div>

            {/* Due Date */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="comp-due">Due Date</Label>
              <Input
                id="comp-due"
                type="date"
                value={form.due_date || ""}
                onChange={(e) =>
                  setForm({
                    ...form,
                    due_date: e.target.value,
                  })
                }
              />
              {errors.due_date && (
                <p className="text-xs text-destructive">{errors.due_date}</p>
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
            <Label>Prerequisites (Dependencies)</Label>
            <p className="text-xs text-muted-foreground">
              Select component dependencies. Dependencies must not form a cycle.
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

          {/* Order Code (single) */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="comp-order-code">Order Code</Label>
            <p className="text-xs text-muted-foreground">
              Each order code should be a separate component entry with its own dates.
            </p>
            <Input
              id="comp-order-code"
              placeholder="e.g., ORD-001"
              value={form.order_code}
              onChange={(e) => setForm({ ...form, order_code: e.target.value })}
            />
          </div>

          {/* Dependency Behavior - only shown when there are prerequisites */}
          {hasPrerequisites && (
            <div className="flex flex-col gap-3 rounded-md border p-3 bg-muted/30">
              <Label>Dependency Behavior</Label>
              <RadioGroup
                value={form.dependency_mode}
                onValueChange={(v) => setForm({ ...form, dependency_mode: v as DependencyMode })}
                className="flex flex-col gap-2"
              >
                <div className="flex items-start gap-2">
                  <RadioGroupItem value="wait" id="dep-wait" className="mt-1" />
                  <div className="flex flex-col gap-0.5">
                    <Label htmlFor="dep-wait" className="font-medium cursor-pointer">
                      Wait for dependencies
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Must wait until all dependencies are finished before production can start.
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <RadioGroupItem value="parallel" id="dep-parallel" className="mt-1" />
                  <div className="flex flex-col gap-0.5">
                    <Label htmlFor="dep-parallel" className="font-medium cursor-pointer">
                      Produce in parallel
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Can be produced in parallel with dependencies.
                    </p>
                  </div>
                </div>
              </RadioGroup>

              {/* Transfer Time */}
              <div className="flex flex-col gap-1.5 mt-2">
                <Label htmlFor="comp-transfer">Transfer/Move Time (minutes)</Label>
                <p className="text-xs text-muted-foreground">
                  Optional time needed to transfer from dependency. Defaults to 0.
                </p>
                <Input
                  id="comp-transfer"
                  type="number"
                  step="1"
                  className="w-32"
                  value={form.transfer_time_minutes ?? ""}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      transfer_time_minutes: parseInt(e.target.value) || 0,
                    })
                  }
                />
                {errors.transfer_time_minutes && (
                  <p className="text-xs text-destructive">
                    {errors.transfer_time_minutes}
                  </p>
                )}
              </div>
            </div>
          )}

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
