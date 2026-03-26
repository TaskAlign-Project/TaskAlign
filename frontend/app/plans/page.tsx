"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Plus, Eye, Trash2, Check, CheckCircle2, FileText} from "lucide-react"
import { AppHeader } from "@/components/app-header"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { plansApi } from "@/lib/api" // Import our API
import type { Plan } from "@/lib/types"
import { toast } from "sonner"
import { getActivePlanId, setActivePlanId } from "@/lib/storage"

export default function PlansPage() {
  const [plans, setPlans] = useState<Plan[]>([])
  const [loading, setLoading] = useState(true)
  const [activePlanId, setActiveId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [newPlanName, setNewPlanName] = useState("")
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState("")

  // Load plans from DB on mount
  useEffect(() => {
    loadPlans()
    setActiveId(getActivePlanId())
  }, [])

  async function loadPlans() {
    setLoading(true)
    try {
      const data = await plansApi.list()
      setPlans(data)
    } catch (error) {
      toast.error("Failed to load plans from server")
    } finally {
      setLoading(false)
    }
  }

  async function handleCreate() {
    try {
      const plan = await plansApi.create({ name: newPlanName.trim() || undefined })
      handleSelect(plan.id)
      setNewPlanName("")
      setCreateDialogOpen(false)
      loadPlans()
      toast.success(`Plan "${plan.name}" created`)
    } catch (error) {
      toast.error("Failed to create plan")
    }
  }

  function handleSelect(planId: string) {
    const plan = plans.find((p) => p.id === planId) ?? null
    setActivePlanId(planId, plan)   // ← pass full plan object
    setActiveId(planId)
    toast.success(`"${plan?.name}" is now active`)
  }

  async function handleDelete() {
    if (!deleteTarget) return
    try {
      await plansApi.delete(deleteTarget)
      if (activePlanId === deleteTarget) {
        setActivePlanId(null, null)                     
        setActiveId(null)
      }
      setDeleteTarget(null)
      loadPlans()
      toast.success("Plan deleted")
    } catch (error) {
      toast.error("Failed to delete plan")
    }
  }

  async function saveEditing() {
    if (!editingId) return
    const plan = plans.find((p) => p.id === editingId)
    if (!plan) return
    try {
      await plansApi.update(editingId, {
        name: editingName.trim(),
        current_date: plan.current_date,
        start_time: plan.start_time,
      })
      setEditingId(null)
      loadPlans()
      toast.success("Plan updated")
    } catch (error) {
      toast.error("Failed to update plan")
    }
  }

  function startEditing(plan: Plan) {
    setEditingId(plan.id)
    setEditingName(plan.name)
  }

  function cancelEditing() {
    setEditingId(null)
    setEditingName("")
  }

  return (
    <div className="flex flex-col h-full">
      <AppHeader
        title="Plans"
        description="Create and manage scheduling plans"
      />
      <div className="flex-1 p-4 md:p-6 flex flex-col gap-6 overflow-y-auto">
        {/* Header actions */}
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {plans.length} plan{plans.length !== 1 && "s"}
          </p>
          <div className="flex items-center gap-2">
            <Button onClick={() => setCreateDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Create New Plan
            </Button>
          </div>
        </div>

        {/* Plans list */}
        {plans.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 gap-4">
              <div className="flex items-center justify-center w-14 h-14 rounded-full bg-muted">
                <FileText className="h-7 w-7 text-muted-foreground" />
              </div>
              <div className="text-center">
                <h3 className="text-lg font-semibold text-card-foreground">
                  No plans yet
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Create your first plan to get started with scheduling.
                </p>
              </div>
              <Button onClick={() => setCreateDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Create New Plan
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {plans.map((plan) => {
              const isActive = plan.id === activePlanId
              const lastRun = plan.last_run_at ?? null
              const unavailableMachines = plan.unavailable_machines_count ?? 0

              return (
                <Card
                  key={plan.id}
                  className={isActive ? "border-primary/50 bg-primary/5" : ""}
                >
                  <CardContent className="p-4 flex flex-col gap-3">
                    {/* Top row: name + badges */}
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        {editingId === plan.id ? (
                          <div className="flex items-center gap-2">
                            <Input
                              value={editingName}
                              onChange={(e) => setEditingName(e.target.value)}
                              className="h-8 text-sm"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === "Enter") saveEditing()
                                if (e.key === "Escape") cancelEditing()
                              }}
                            />
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={saveEditing}
                            >
                              <Check className="h-4 w-4" />
                            </Button>
                          </div>
                        ) : (
                          <button
                            onClick={() => startEditing(plan)}
                            className="text-left text-base font-semibold text-card-foreground hover:text-primary transition-colors"
                          >
                            {plan.name}
                          </button>
                        )}
                        {plan.month_label && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {plan.month_label}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {isActive && (
                          <Badge variant="default" className="gap-1">
                            <CheckCircle2 className="h-3 w-3" />
                            Active
                          </Badge>
                        )}
                        <Badge variant="secondary">
                          {plan.run_count ?? 0} run{(plan.run_count ?? 0) !== 1 && "s"}
                        </Badge>
                      </div>
                    </div>

                    {/* Stats row */}
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span>
                        Created:{" "}
                        {new Date(plan.created_at).toLocaleDateString()}
                      </span>
                      <span>Machines: {plan.machine_count ?? 0}</span>
                      {unavailableMachines > 0 && (
                        <span className="text-amber-600">
                          ({unavailableMachines} unavailable)
                        </span>
                      )}
                      <span>Molds: {plan.mold_count ?? 0}</span>
                      <span>Components: {plan.component_count ?? 0}</span>
                      {lastRun && (
                        <span>Last run: {new Date(lastRun).toLocaleString()}</span>
                      )}
                    </div>

                    {/* Actions row */}
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      {!isActive && (
                        <Button
                          size="sm"
                          onClick={() => handleSelect(plan.id)}
                        >
                          <Check className="mr-1.5 h-3.5 w-3.5" />
                          Select
                        </Button>
                      )}
                      <Button size="sm" variant="outline" asChild>
                        <Link href={`/plans/${plan.id}`}>
                          <Eye className="mr-1.5 h-3.5 w-3.5" />
                          View
                        </Link>
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setDeleteTarget(plan.id)}
                      >
                        <Trash2 className="mr-1.5 h-3.5 w-3.5 text-destructive" />
                        Delete
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </div>

      {/* Create dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create New Plan</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="plan-name">Plan Name</Label>
              <Input
                id="plan-name"
                placeholder="e.g., March 2024 Production"
                value={newPlanName}
                onChange={(e) => setNewPlanName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreate()
                }}
              />
              <p className="text-xs text-muted-foreground">
                Leave blank for auto-generated name
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate}>Create Plan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Plan</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this plan? All associated data
              including run history will be permanently removed.
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
