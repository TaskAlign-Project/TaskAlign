"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Play, Loader2, ExternalLink } from "lucide-react"
import { AppHeader } from "@/components/app-header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { ScheduleResults } from "@/components/schedule-results"
import {
  getMachines,
  getMolds,
  getComponents,
  getPlanSetup,
  setPlanSetup,
} from "@/lib/storage"
import { runSchedule } from "@/lib/api"
import { storeResult } from "@/lib/schedule-utils"
import type { PlanSetup, ScheduleResponse } from "@/lib/types"
import { toast } from "sonner"

export default function PlanPage() {
  const [form, setForm] = useState<PlanSetup>(getPlanSetup())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ScheduleResponse | null>(null)
  const [counts, setCounts] = useState({ machines: 0, molds: 0, components: 0 })

  type PlanMode = "fresh" | "resume"

  const [mode, setMode] = useState<PlanMode>("fresh")

  useEffect(() => {
    setForm(getPlanSetup())
    setCounts({
      machines: getMachines().length,
      molds: getMolds().length,
      components: getComponents().length,
    })
  }, [])

  function updateField(field: keyof PlanSetup, value: number) {
    const next = { ...form, [field]: value }
    setForm(next)
    setPlanSetup(next)
  }

  async function handleRun() {
    setLoading(true)
    setError(null)
    setResult(null)

    const machines = getMachines()
    const molds = getMolds()
    const components = getComponents()

    if (machines.length === 0 || molds.length === 0 || components.length === 0) {
      setError(
        "Please add at least one machine, mold, and component before running the scheduler."
      )
      setLoading(false)
      return
    }

    try {
      const res = await runSchedule({
        mode,
        month_days: form.month_days,
        mold_change_time_hours: form.mold_change_time_hours,
        color_change_time_hours: form.color_change_time_hours,
        machines,
        molds,
        components,
        pop_size: form.pop_size,
        n_generations: form.n_generations,
        mutation_rate: form.mutation_rate,
      })
      setResult(res)
      storeResult(res)
      toast.success("Schedule generated successfully")
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error"
      setError(message)
      toast.error("Scheduler failed")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      <AppHeader
        title="Setup Plan"
        description="Configure parameters and run the scheduler"
      />
      <div className="flex-1 p-4 md:p-6 flex flex-col gap-6 overflow-y-auto">
        {/* Data Status
        <div className="flex flex-wrap gap-3 text-sm">
          <span className="text-muted-foreground">
            Machines:{" "}
            <span className="font-medium text-card-foreground">{counts.machines}</span>
          </span>
          <span className="text-muted-foreground">
            Molds:{" "}
            <span className="font-medium text-card-foreground">{counts.molds}</span>
          </span>
          <span className="text-muted-foreground">
            Components:{" "}
            <span className="font-medium text-card-foreground">{counts.components}</span>
          </span>
        </div> */}
        <div className="flex flex-wrap gap-4 text-sm">
          <div className="bg-muted px-3 py-1.5 rounded-md">
            Machines: <span className="font-semibold">{counts.machines}</span>
          </div>

          <div className="bg-muted px-3 py-1.5 rounded-md">
            Molds: <span className="font-semibold">{counts.molds}</span>
          </div>

          <div className="bg-muted px-3 py-1.5 rounded-md">
            Components: <span className="font-semibold">{counts.components}</span>
          </div>
        </div>

        {/* Plan Setup Form */}
        {/* <Card className="max-w-lg">
          <CardHeader>
            <CardTitle className="text-base">Schedule Parameters</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
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
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="mold-change">Mold Change Time (hours)</Label>
              <Input
                id="mold-change"
                type="number"
                step="0.1"
                value={form.mold_change_time_hours ?? ""}
                onChange={(e) =>
                  updateField(
                    "mold_change_time_hours",
                    parseFloat(e.target.value) || 0
                  )
                }
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="color-change">Color Change Time (hours)</Label>
              <Input
                id="color-change"
                type="number"
                step="0.1"
                value={form.color_change_time_hours ?? ""}
                onChange={(e) =>
                  updateField(
                    "color_change_time_hours",
                    parseFloat(e.target.value) || 0
                  )
                }
              />
            </div>
          </CardContent>
        </Card> */}

        
            <Card>
        <CardHeader>
          <CardTitle className="text-lg">Start Production Plan</CardTitle>
        </CardHeader>

        <CardContent className="grid gap-6 md:grid-cols-2">

          {/* Fresh Start */}
          <div
            onClick={() => setMode("fresh")}
            className={`cursor-pointer rounded-lg border p-5 transition
            ${mode === "fresh"
              ? "border-primary bg-primary/5"
              : "hover:border-muted-foreground/40"
            }`}
          >
            <div className="flex items-center gap-2 mb-2">
              <Play className="h-5 w-5" />
              <h3 className="font-semibold">Fresh Start Mode</h3>
            </div>

            <p className="text-sm text-muted-foreground mb-4">
              Creates a new schedule for factories starting production from zero.
              Ideal for new product lines or complete production resets.
            </p>

            <ul className="text-sm text-muted-foreground space-y-1">
              <li>✔ Optimize machine allocation from scratch</li>
              <li>✔ Set up new production targets</li>
              <li>✔ Start with clean production slate</li>
            </ul>

            <div className="mt-4 flex items-center gap-2">
              <input
                type="radio"
                checked={mode === "fresh"}
                readOnly
              />
              <span className="text-sm font-medium">Select Fresh Start</span>
            </div>
          </div>

          {/* Resume Mode */}
          <div
            onClick={() => setMode("resume")}
            className={`cursor-pointer rounded-lg border p-5 transition
            ${mode === "resume"
              ? "border-primary bg-primary/5"
              : "hover:border-muted-foreground/40"
            }`}
          >
            <div className="flex items-center gap-2 mb-2">
              <Loader2 className="h-5 w-5" />
              <h3 className="font-semibold">Production Resume Mode</h3>
            </div>

            <p className="text-sm text-muted-foreground mb-4">
              Input completed portions and the system recalculates the optimal
              production plan to finish remaining work.
            </p>

            <ul className="text-sm text-muted-foreground space-y-1">
              <li>✔ Continue from current production state</li>
              <li>✔ Recalculate remaining production</li>
              <li>✔ Optimize completion efficiency</li>
            </ul>

            <div className="mt-4 flex items-center gap-2">
              <input
                type="radio"
                checked={mode === "resume"}
                readOnly
              />
              <span className="text-sm font-medium">Select Resume Mode</span>
            </div>
          </div>

        </CardContent>
      </Card>

      
      
        {/* Scheduler Parameters
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Scheduler Parameters</CardTitle>
          </CardHeader>

          <CardContent className="grid gap-6 md:grid-cols-3">
            
            <div className="space-y-2">
              <Label htmlFor="month-days">Month Days</Label>
              <Input
                id="month-days"
                type="number"
                className="h-11 text-base"
                value={form.month_days || ""}
                onChange={(e) =>
                  updateField("month_days", parseInt(e.target.value) || 0)
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="mold-change">Mold Change Time (hours)</Label>
              <Input
                id="mold-change"
                type="number"
                step="0.1"
                className="h-11 text-base"
                value={form.mold_change_time_hours ?? ""}
                onChange={(e) =>
                  updateField(
                    "mold_change_time_hours",
                    parseFloat(e.target.value) || 0
                  )
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="color-change">Color Change Time (hours)</Label>
              <Input
                id="color-change"
                type="number"
                step="0.1"
                className="h-11 text-base"
                value={form.color_change_time_hours ?? ""}
                onChange={(e) =>
                  updateField(
                    "color_change_time_hours",
                    parseFloat(e.target.value) || 0
                  )
                }
              />
            </div>

          </CardContent>
        </Card> */}

        {mode === "fresh" && (
        <Card>
          <CardHeader>
            <CardTitle>Schedule Parameters</CardTitle>
          </CardHeader>

          <CardContent className="grid gap-6 md:grid-cols-3">

            <div className="space-y-2">
              <Label>Month Days</Label>
              <Input
                type="number"
                value={form.month_days || ""}
                onChange={(e) =>
                  updateField("month_days", parseInt(e.target.value) || 0)
                }
              />
            </div>

            <div className="space-y-2">
              <Label>Mold Change Time (hours)</Label>
              <Input
                type="number"
                step="0.1"
                value={form.mold_change_time_hours ?? ""}
                onChange={(e) =>
                  updateField(
                    "mold_change_time_hours",
                    parseFloat(e.target.value) || 0
                  )
                }
              />
            </div>

            <div className="space-y-2">
              <Label>Color Change Time (hours)</Label>
              <Input
                type="number"
                step="0.1"
                value={form.color_change_time_hours ?? ""}
                onChange={(e) =>
                  updateField(
                    "color_change_time_hours",
                    parseFloat(e.target.value) || 0
                  )
                }
              />
            </div>

          </CardContent>
        </Card>
      )}

      {mode === "resume" && (
        <Card>
          <CardHeader>
            <CardTitle>Resume Production State</CardTitle>
          </CardHeader>

          <CardContent className="grid gap-6 md:grid-cols-2">

            <div className="space-y-2">
              <Label>Completed Production (%)</Label>
              <Input
                type="number"
                placeholder="Example: 40"
              />
            </div>

            <div className="space-y-2">
              <Label>Remaining Orders</Label>
              <Input
                type="number"
                placeholder="Example: 1200"
              />
            </div>

          </CardContent>
        </Card>
      )}

        {/* Run Button */}
        {/* <div className="flex items-center gap-4">
          <Button onClick={handleRun} disabled={loading} size="lg">
            {loading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Play className="mr-2 h-4 w-4" />
            )}
            {loading ? "Running Scheduler..." : "Run Scheduler"}
          </Button>
          {result && (
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
        </div> */}
        <div className="flex items-center gap-4 pt-2">
          <Button
            onClick={handleRun}
            disabled={loading}
            size="lg"
            className="px-8 text-base"
          >
            {loading ? (
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            ) : (
              <Play className="mr-2 h-5 w-5" />
            )}
            {loading ? "Running Scheduler..." : "Run Scheduler"}
          </Button>

          {result && (
            <Button variant="secondary" size="lg" asChild>
              <Link href="/plan/output">
                <ExternalLink className="mr-2 h-4 w-4" />
                View Output
              </Link>
            </Button>
          )}

          {loading && (
            <p className="text-sm text-muted-foreground">
              Generating optimized production schedule...
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
