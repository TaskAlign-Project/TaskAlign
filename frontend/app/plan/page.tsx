"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Play, Loader2, ExternalLink, Sparkles, RotateCcw } from "lucide-react"
import { AppHeader } from "@/components/app-header"
import { NoPlanState } from "@/components/no-plan-state"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { ScheduleResults } from "@/components/schedule-results"
import {
  getActivePlan,
  updateActivePlanSetup,
  appendPlanRun,
  createPlan,
  setActivePlanId,
  getActivePlanId,
} from "@/lib/storage"
import { runSchedule } from "@/lib/api"
import type { Plan, PlanSetup, PlanRun, ScheduleResponse } from "@/lib/types"
import { toast } from "sonner"

type RunMode = "fresh" | "resume"

export default function PlanPage() {
  const router = useRouter()
  const [plan, setPlan] = useState<Plan | null>(null)
  const [form, setForm] = useState<PlanSetup | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ScheduleResponse | null>(null)
  const [mode, setMode] = useState<RunMode>("fresh")
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    const activePlan = getActivePlan()
    setPlan(activePlan)
    setForm(activePlan?.setup ?? null)
    // Default mode based on whether plan has runs
    if (activePlan && activePlan.runs.length > 0) {
      setMode("resume")
    } else {
      setMode("fresh")
    }
    setLoaded(true)
  }, [])

  function refresh() {
    const activePlan = getActivePlan()
    setPlan(activePlan)
    setForm(activePlan?.setup ?? null)
  }

  function updateField(field: keyof PlanSetup, value: number) {
    if (!form || !plan) return
    const next = { ...form, [field]: value }
    setForm(next)
    updateActivePlanSetup(next)
  }

  function updateFieldString(field: keyof PlanSetup, value: string) {
    if (!form || !plan) return
    const next = { ...form, [field]: value }
    setForm(next)
    updateActivePlanSetup(next)
  }

  async function handleRun() {
    setLoading(true)
    setError(null)
    setResult(null)

    let targetPlan = plan
    let targetPlanId = getActivePlanId()

    // Fresh Start mode: create a new plan
    if (mode === "fresh" && plan && plan.runs.length > 0) {
      const newPlan = createPlan({ name: `${plan.name} (Fresh)` })
      setActivePlanId(newPlan.id)
      targetPlan = newPlan
      targetPlanId = newPlan.id
      refresh()
      toast.success(`Created new plan "${newPlan.name}"`)
    }

    if (!targetPlan || !targetPlanId) {
      setError("No active plan selected.")
      setLoading(false)
      return
    }

    const machines = targetPlan.machines.filter((m) => m.status === "available")
    const molds = targetPlan.molds
    const components = targetPlan.components
    const setup = targetPlan.setup

    if (machines.length === 0 || molds.length === 0 || components.length === 0) {
      setError(
        "Please add at least one available machine, mold, and component before running the scheduler."
      )
      setLoading(false)
      return
    }

    try {
      const res = await runSchedule({
        month_days: setup.month_days,
        mold_change_time_minutes: setup.mold_change_time_minutes,
        color_change_time_minutes: setup.color_change_time_minutes,
        machines,
        molds,
        components,
        pop_size: setup.pop_size,
        n_generations: setup.n_generations,
        mutation_rate: setup.mutation_rate,
      })

      // Create run record
      const run: PlanRun = {
        id: crypto.randomUUID(),
        created_at: new Date().toISOString(),
        mode: mode === "fresh" && plan && plan.runs.length > 0 ? "fresh" : plan?.runs.length === 0 ? "fresh" : "resume",
        request_snapshot: {
          month_days: setup.month_days,
          current_date: setup.current_date,
          mold_change_time_minutes: setup.mold_change_time_minutes,
          color_change_time_minutes: setup.color_change_time_minutes,
          pop_size: setup.pop_size,
          n_generations: setup.n_generations,
          mutation_rate: setup.mutation_rate,
          machines: targetPlan.machines,
          molds: targetPlan.molds,
          components: targetPlan.components,
        },
        result: res,
      }

      appendPlanRun(targetPlanId, run)
      setResult(res)
      refresh()
      toast.success("Schedule generated successfully")
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error"
      setError(message)
      toast.error("Scheduler failed")
    } finally {
      setLoading(false)
    }
  }

  if (!loaded) return null

  if (!plan || !form) {
    return (
      <div className="flex flex-col h-full">
        <AppHeader
          title="Setup Plan"
          description="Configure parameters and run the scheduler"
        />
        <NoPlanState description="Select or create a plan to configure and run the scheduler." />
      </div>
    )
  }

  const availableMachines = plan.machines.filter((m) => m.status === "available").length
  const hasRuns = plan.runs.length > 0
  const lastRun = hasRuns ? plan.runs[plan.runs.length - 1] : null

  return (
    <div className="flex flex-col h-full">
      <AppHeader
        title="Setup Plan"
        description={`Configuring "${plan.name}"`}
      />
      <div className="flex-1 p-4 md:p-6 flex flex-col gap-6 overflow-y-auto">
        {/* Plan info */}
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant="secondary" className="text-sm">
            {plan.name}
          </Badge>
          {hasRuns && (
            <Badge variant="outline" className="text-xs">
              {plan.runs.length} previous run{plan.runs.length !== 1 && "s"}
            </Badge>
          )}
          <Button variant="link" size="sm" asChild className="h-auto p-0">
            <Link href={`/plans/${plan.id}`}>View Plan Details</Link>
          </Button>
        </div>

        {/* Data Status */}
        <div className="flex flex-wrap gap-3 text-sm">
          <span className="text-muted-foreground">
            Machines:{" "}
            <span className="font-medium text-card-foreground">
              {availableMachines}/{plan.machines.length}
            </span>
            {plan.machines.length > availableMachines && (
              <span className="text-amber-600 ml-1">
                ({plan.machines.length - availableMachines} unavailable)
              </span>
            )}
          </span>
          <span className="text-muted-foreground">
            Molds:{" "}
            <span className="font-medium text-card-foreground">{plan.molds.length}</span>
          </span>
          <span className="text-muted-foreground">
            Components:{" "}
            <span className="font-medium text-card-foreground">{plan.components.length}</span>
          </span>
        </div>

        {/* Mode selection (only show if plan has runs) */}
        {hasRuns && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl">
            <Card
              className={`cursor-pointer transition-all ${
                mode === "resume"
                  ? "border-primary ring-1 ring-primary"
                  : "hover:border-muted-foreground/50"
              }`}
              onClick={() => setMode("resume")}
            >
              <CardHeader className="p-4 pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <RotateCcw className="h-4 w-4" />
                  Resume
                </CardTitle>
                <CardDescription className="text-xs">
                  Re-run with current inputs on this plan
                </CardDescription>
              </CardHeader>
            </Card>
            <Card
              className={`cursor-pointer transition-all ${
                mode === "fresh"
                  ? "border-primary ring-1 ring-primary"
                  : "hover:border-muted-foreground/50"
              }`}
              onClick={() => setMode("fresh")}
            >
              <CardHeader className="p-4 pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Sparkles className="h-4 w-4" />
                  Fresh Start
                </CardTitle>
                <CardDescription className="text-xs">
                  Create a new plan copy and run
                </CardDescription>
              </CardHeader>
            </Card>
          </div>
        )}

        {/* Plan Setup Form */}
        <Card className="max-w-lg">
          <CardHeader>
            <CardTitle className="text-base">Schedule Parameters</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="current-date">Current Date (Start)</Label>
                <Input
                  id="current-date"
                  type="date"
                  value={form.current_date || ""}
                  onChange={(e) =>
                    updateFieldString("current_date", e.target.value)
                  }
                />
                <p className="text-xs text-muted-foreground">
                  The start date of the schedule
                </p>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="start-time">Start Time</Label>
                <Input
                  id="start-time"
                  type="time"
                  value={form.start_time || "08:00"}
                  onChange={(e) =>
                    updateFieldString("start_time", e.target.value)
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Time when factory begins work
                </p>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="month-days">Month Days</Label>
                <Input
                  id="month-days"
                  type="number"
                  value={form.month_days || ""}
                  onChange={(e) =>
                    updateField("month_days", parseInt(e.target.value) || 0)
                  }
                />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="mold-change">Mold Change Time (minutes)</Label>
              <Input
                id="mold-change"
                type="number"
                step="1"
                value={form.mold_change_time_minutes ?? ""}
                onChange={(e) =>
                  updateField(
                    "mold_change_time_minutes",
                    parseInt(e.target.value) || 0
                  )
                }
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="color-change">Color Change Time (minutes)</Label>
              <Input
                id="color-change"
                type="number"
                step="1"
                value={form.color_change_time_minutes ?? ""}
                onChange={(e) =>
                  updateField(
                    "color_change_time_minutes",
                    parseInt(e.target.value) || 0
                  )
                }
              />
            </div>
          </CardContent>
        </Card>

        {/* Run Button */}
        <div className="flex items-center gap-4">
          <Button onClick={handleRun} disabled={loading} size="lg">
            {loading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Play className="mr-2 h-4 w-4" />
            )}
            {loading
              ? "Running Scheduler..."
              : hasRuns
              ? mode === "fresh"
                ? "Run Fresh"
                : "Re-run"
              : "Run Scheduler"}
          </Button>
          {(result || lastRun) && (
            <Button variant="outline" size="lg" asChild>
              <Link href="/plan/output">
                <ExternalLink className="mr-2 h-4 w-4" />
                View Output
              </Link>
            </Button>
          )}
          {loading && (
            <p className="text-sm text-muted-foreground">
              This may take a moment...
            </p>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
            <p className="text-sm font-medium text-destructive">
              Scheduler Error
            </p>
            <p className="text-sm text-destructive/90 mt-1">{error}</p>
          </div>
        )}

        {/* Results */}
        {result && (
          <>
            <Separator />
            <ScheduleResults data={result} />
          </>
        )}
      </div>
    </div>
  )
}
