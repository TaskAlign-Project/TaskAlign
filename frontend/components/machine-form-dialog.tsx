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
import type { Machine } from "@/lib/types"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  machine: Machine | null
  existingIds: string[]
  onSave: (machine: Machine) => void
}

const EMPTY: Machine = {
  id: "",
  name: "",
  group: "small",
  tonnage: 0,
  hours_per_day: 0,
  efficiency: 1.0,
}

export function MachineFormDialog({
  open,
  onOpenChange,
  machine,
  existingIds,
  onSave,
}: Props) {
  const isEdit = machine !== null
  const [form, setForm] = useState<Machine>(EMPTY)
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    setForm(machine ?? EMPTY)
    setErrors({})
  }, [machine, open])

  function validate(): boolean {
    const e: Record<string, string> = {}
    if (!form.id.trim()) e.id = "ID is required"
    else if (!isEdit && existingIds.includes(form.id.trim()))
      e.id = "ID already exists"
    if (form.tonnage <= 0) e.tonnage = "Tonnage must be > 0"
    if (form.hours_per_day <= 0) e.hours_per_day = "Hours per day must be > 0"
    if (form.efficiency <= 0 || form.efficiency > 1.5)
      e.efficiency = "Efficiency must be in (0, 1.5]"
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-card-foreground">
            {isEdit ? "Edit Machine" : "Add Machine"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* ID */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="machine-id">ID</Label>
            <Input
              id="machine-id"
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
            <Label htmlFor="machine-name">Name</Label>
            <Input
              id="machine-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>

          {/* Group */}
          <div className="flex flex-col gap-1.5">
            <Label>Group</Label>
            <Select
              value={form.group}
              onValueChange={(v) =>
                setForm({ ...form, group: v as Machine["group"] })
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

          {/* Tonnage */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="machine-tonnage">Tonnage</Label>
            <Input
              id="machine-tonnage"
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

          {/* Hours per Day */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="machine-hours">Hours per Day</Label>
            <Input
              id="machine-hours"
              type="number"
              step="any"
              value={form.hours_per_day || ""}
              onChange={(e) =>
                setForm({
                  ...form,
                  hours_per_day: parseFloat(e.target.value) || 0,
                })
              }
            />
            {errors.hours_per_day && (
              <p className="text-xs text-destructive">{errors.hours_per_day}</p>
            )}
          </div>

          {/* Efficiency */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="machine-efficiency">Efficiency (0 - 1.5]</Label>
            <Input
              id="machine-efficiency"
              type="number"
              step="0.01"
              value={form.efficiency || ""}
              onChange={(e) =>
                setForm({
                  ...form,
                  efficiency: parseFloat(e.target.value) || 0,
                })
              }
            />
            {errors.efficiency && (
              <p className="text-xs text-destructive">{errors.efficiency}</p>
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
