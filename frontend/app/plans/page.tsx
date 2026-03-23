"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import {
  Plus,
  Eye,
  Copy,
  Trash2,
  Check,
  CheckCircle2,
  FileText,
  FlaskConical,
} from "lucide-react"
import { AppHeader } from "@/components/app-header"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import {
  getPlans,
  createPlan,
  createDemoPlan,
  duplicatePlan,
  deletePlan,
  updatePlan,
  setActivePlanId,
  getActivePlanId,
} from "@/lib/storage"
import type { Plan } from "@/lib/types"
import { toast } from "sonner"

export default function PlansPage() {
  const [plans, setPlans] = useState<Plan[]>([])
  const [activePlanId, setActiveId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [newPlanName, setNewPlanName] = useState("")
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState("")

  useEffect(() => {
    setPlans(getPlans())
    setActiveId(getActivePlanId())
  }, [])

  function refresh() {
    setPlans(getPlans())
    setActiveId(getActivePlanId())
  }

  function handleCreate() {
    const plan = createPlan({ name: newPlanName.trim() || undefined })
    setActivePlanId(plan.id)
    setNewPlanName("")
    setCreateDialogOpen(false)
    refresh()
    toast.success(`Plan "${plan.name}" created and set as active`)
  }

  function handleSelect(planId: string) {
    setActivePlanId(planId)
    refresh()
    const plan = plans.find((p) => p.id === planId)
    toast.success(`"${plan?.name}" is now the active plan`)
  }

  function handleDuplicate(planId: string) {
    const newPlan = duplicatePlan(planId)
    if (newPlan) {
      refresh()
      toast.success(`Plan duplicated as "${newPlan.name}"`)
    }
  }

  function handleDelete() {
    if (!deleteTarget) return
    const plan = plans.find((p) => p.id === deleteTarget)
    deletePlan(deleteTarget)
    setDeleteTarget(null)
    refresh()
    toast.success(`Plan "${plan?.name}" deleted`)
  }

  function startEditing(plan: Plan) {
    setEditingId(plan.id)
    setEditingName(plan.name)
  }

  function saveEditing() {
    if (!editingId) return
    updatePlan(editingId, { name: editingName.trim() })
    setEditingId(null)
    setEditingName("")
    refresh()
    toast.success("Plan name updated")
  }

  function cancelEditing() {
    setEditingId(null)
    setEditingName("")
  }

  function handleLoadDemo() {
    const plan = createDemoPlan()
    refresh()
    toast.success(`Demo plan "${plan.name}" created with sample data and run result`)
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
            <Button variant="outline" onClick={handleLoadDemo}>
              <FlaskConical className="mr-2 h-4 w-4" />
              Load Demo Data
            </Button>
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
              const lastRun = plan.runs.length > 0 ? plan.runs[plan.runs.length - 1] : null
              const unavailableMachines = plan.machines.filter(
                (m) => m.status === "unavailable"
              ).length

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
                          {plan.runs.length} run{plan.runs.length !== 1 && "s"}
                        </Badge>
                      </div>
                    </div>

                    {/* Stats row */}
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span>
                        Created:{" "}
                        {new Date(plan.created_at).toLocaleDateString()}
                      </span>
                      <span>Machines: {plan.machines.length}</span>
                      {unavailableMachines > 0 && (
                        <span className="text-amber-600">
                          ({unavailableMachines} unavailable)
                        </span>
                      )}
                      <span>Molds: {plan.molds.length}</span>
                      <span>Components: {plan.components.length}</span>
                      {lastRun && (
                        <span>
                          Last run: {new Date(lastRun.created_at).toLocaleString()}
                        </span>
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
                        variant="outline"
                        onClick={() => handleDuplicate(plan.id)}
                      >
                        <Copy className="mr-1.5 h-3.5 w-3.5" />
                        Duplicate
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
