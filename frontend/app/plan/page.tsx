// plan/page.tsx

"use client"

import { useEffect, useState, useCallback } from "react"
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
  getActivePlanId,
  setActivePlanId,
  setCurrentRun,
  getCurrentRunId,
} from "@/lib/storage"
import { plansApi, machinesApi, moldsApi, componentsApi, runsApi } from "@/lib/api"
import type { Plan, PlanRun, Machine, Mold, Component, ScheduleResponse } from "@/lib/types"
import { toast } from "sonner"

type RunMode = "fresh" | "resume"

// Local form state mirrors the flat Plan fields we care about
interface SetupForm {
  current_date: string
  start_time: string
  month_days: number
  mold_change_time_minutes: number
  color_change_time_minutes: number
  pop_size: number
  n_generations: number
  mutation_rate: number
}

function planToForm(plan: Plan): SetupForm {
  return {
    current_date: plan.current_date ?? new Date().toISOString().split("T")[0],
    start_time: plan.start_time ?? "08:00",
    month_days: plan.month_days ?? 22,
    mold_change_time_minutes: plan.mold_change_time_minutes ?? 90,
    color_change_time_minutes: plan.color_change_time_minutes ?? 30,
    pop_size: plan.pop_size ?? 50,
    n_generations: plan.n_generations ?? 100,
    mutation_rate: plan.mutation_rate ?? 0.1,
  }
}

export default function PlanPage() {
  const router = useRouter()

  const [plan, setPlan] = useState<Plan | null>(null)
  const [form, setForm] = useState<SetupForm | null>(null)
  const [machines, setMachines] = useState<Machine[]>([])
  const [molds, setMolds] = useState<Mold[]>([])
  const [components, setComponents] = useState<Component[]>([])
  const [runs, setRuns] = useState<PlanRun[]>([])

  const [loading, setLoading] = useState(false)
  const [pageLoading, setPageLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ScheduleResponse | null>(null)
  const [mode, setMode] = useState<RunMode>("fresh")

  const planId = getActivePlanId()

  const loadAll = useCallback(async (id: string) => {
    setPageLoading(true)
    try {
      const [p, m, mo, co, r] = await Promise.all([
        plansApi.get(id),
        machinesApi.list(),
        moldsApi.list(),
        componentsApi.list(id),
        runsApi.list(id),
      ])
      setPlan(p)
      setForm(planToForm(p))
      setMachines(m)
      setMolds(mo)
      setComponents(co)
      setRuns(r)
      setMode(r.length > 0 ? "resume" : "fresh")
    } catch {
      toast.error("Failed to load plan data")
    } finally {
      setPageLoading(false)
    }
  }, [])

  useEffect(() => {
    if (planId) {
      loadAll(planId)
    } else {
      setPageLoading(false)
    }
  }, [planId, loadAll])

  async function updateField(field: keyof SetupForm, value: number | string) {
    if (!form || !plan) return
    const next = { ...form, [field]: value }
    setForm(next)
    try {
      await plansApi.update(plan.id, { [field]: value })
    } catch {
      toast.error("Failed to save setting")
    }
  }

  async function handleRun() {
    if (!plan || !form) return
    setLoading(true)
    setError(null)
    setResult(null)

    let targetPlanId = plan.id

    // Fresh Start: create a new plan copy first
    if (mode === "fresh" && runs.length > 0) {
      try {
        const newPlan = await plansApi.create({
          name: `${plan.name} (Fresh)`,
          current_date: form.current_date,
          start_time: form.start_time,
          month_days: form.month_days,
          mold_change_time_minutes: form.mold_change_time_minutes,
          color_change_time_minutes: form.color_change_time_minutes,
          pop_size: form.pop_size,
          n_generations: form.n_generations,
          mutation_rate: form.mutation_rate,
        })
        setActivePlanId(newPlan.id)
        targetPlanId = newPlan.id
        toast.success(`Created new plan "${newPlan.name}"`)
      } catch {
        toast.error("Failed to create fresh plan")
        setLoading(false)
        return
      }
    }

    try {
      // Single call — backend runs GA and saves the run
      const savedRun = await runsApi.run(targetPlanId)

      // Extract result shape for ScheduleResults component
      const scheduleResult: ScheduleResponse = {
        assignments: savedRun.assignments ?? [],
        unmet: savedRun.unmet ?? {},
        score: savedRun.score ?? 0,
      }

      setCurrentRun(targetPlanId, savedRun.id)
      setResult(scheduleResult)
      await loadAll(targetPlanId)
      toast.success("Schedule generated successfully")
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error"
      setError(message)
      toast.error("Scheduler failed")
    } finally {
      setLoading(false)
    }
  }

  if (pageLoading) return null

  if (!planId || !plan || !form) {
    return (
      <div className="flex flex-col h-full">
        <AppHeader title="Setup Plan" description="Configure parameters and run the scheduler" />
        <NoPlanState description="Select or create a plan to configure and run the scheduler." />
      </div>
    )
  }

  const availableMachines = machines.filter((m) => m.status === "available").length
  const hasRuns = runs.length > 0
  const lastRun = hasRuns ? runs[runs.length - 1] : null

  return (
    <div className="flex flex-col h-full">
      <AppHeader title="Setup Plan" description={`Configuring "${plan.name}"`} />
      <div className="flex-1 p-4 md:p-6 flex flex-col gap-6 overflow-y-auto">

        {/* Plan info */}
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant="secondary" className="text-sm">{plan.name}</Badge>
          {hasRuns && (
            <Badge variant="outline" className="text-xs">
              {runs.length} previous run{runs.length !== 1 && "s"}
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
              {availableMachines}/{machines.length}
            </span>
            {machines.length > availableMachines && (
              <span className="text-amber-600 ml-1">
                ({machines.length - availableMachines} unavailable)
              </span>
            )}
          </span>
          <span className="text-muted-foreground">
            Molds: <span className="font-medium text-card-foreground">{molds.length}</span>
          </span>
          <span className="text-muted-foreground">
            Components: <span className="font-medium text-card-foreground">{components.length}</span>
          </span>
        </div>

        {/* Mode selection */}
        {hasRuns && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl">
            <Card
              className={`cursor-pointer transition-all ${
                mode === "resume" ? "border-primary ring-1 ring-primary" : "hover:border-muted-foreground/50"
              }`}
              onClick={() => setMode("resume")}
            >
              <CardHeader className="p-4 pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <RotateCcw className="h-4 w-4" />Resume
                </CardTitle>
                <CardDescription className="text-xs">Re-run with current inputs on this plan</CardDescription>
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
                  onChange={(e) => updateField("current_date", e.target.value)}
                />
                <p className="text-xs text-muted-foreground">Start date of the schedule</p>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="start-time">Start Time</Label>
                <Input
                  id="start-time"
                  type="time"
                  value={form.start_time || "08:00"}
                  onChange={(e) => updateField("start_time", e.target.value)}
                />
                <p className="text-xs text-muted-foreground">Time factory begins work</p>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="month-days">Month Days</Label>
                <Input
                  id="month-days"
                  type="number"
                  value={form.month_days || ""}
                  onChange={(e) => updateField("month_days", parseInt(e.target.value) || 0)}
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
                onChange={(e) => updateField("mold_change_time_minutes", parseInt(e.target.value) || 0)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="color-change">Color Change Time (minutes)</Label>
              <Input
                id="color-change"
                type="number"
                step="1"
                value={form.color_change_time_minutes ?? ""}
                onChange={(e) => updateField("color_change_time_minutes", parseInt(e.target.value) || 0)}
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
              ? mode === "fresh" ? "Run Fresh" : "Re-run"
              : "Run Scheduler"}
          </Button>
          {(result || lastRun) && (
            <Button variant="outline" size="lg" asChild>
              <Link href="/plan/output">
                <ExternalLink className="mr-2 h-4 w-4" />View Output
              </Link>
            </Button>
          )}
          {loading && (
            <p className="text-sm text-muted-foreground">This may take a moment...</p>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
            <p className="text-sm font-medium text-destructive">Scheduler Error</p>
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