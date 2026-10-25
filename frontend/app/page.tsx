// app/page.tsx

"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Cog, Box, Puzzle, CalendarClock, Gauge } from "lucide-react"
import { AppHeader } from "@/components/app-header"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { getActivePlan } from "@/lib/storage"
// import { plansApi } from "@/lib/api"
import { machinesApi, moldsApi, componentsApi } from "@/lib/api"
import { computeProductionProgress, type ProductionProgress } from "@/lib/production-progress"


type ProgressState =
  | { kind: "loading" }
  | { kind: "none" } // no plan selected
  | { kind: "error" }
  | { kind: "ready"; data: ProductionProgress }

export default function DashboardPage() {
  const [counts, setCounts] = useState({ machines: 0, molds: 0, components: 0 })
  const [progress, setProgress] = useState<ProgressState>({ kind: "loading" })

  useEffect(() => {
    async function refresh() {
      const plan = getActivePlan() as any
      if (!plan?.id) {
        setCounts({ machines: 0, molds: 0, components: 0 })
        setProgress({ kind: "none" })
        return
      }

      try {
        const [machines, molds, components] = await Promise.all([
          machinesApi.list(),
          moldsApi.list(),
          componentsApi.list(plan.id),
        ])
        setCounts({
          machines: machines.length,
          molds: molds.length,
          components: components.length,
        })
        setProgress({ kind: "ready", data: computeProductionProgress(components) })
      } catch {
        setCounts({ machines: 0, molds: 0, components: 0 })
        setProgress({ kind: "error" })
      }

      // If counts missing from cache, fetch fresh from API
      // if (plan.machine_count == null) {
      //   try {
      //     const fresh = await plansApi.getById(plan.id)  // or plansApi.get(plan.id)
      //     setCounts({
      //       machines: fresh?.machine_count ?? 0,
      //       molds:    fresh?.mold_count    ?? 0,
      //       components: fresh?.component_count ?? 0,
      //     })
      //     return
      //   } catch {}
      // }

      // setCounts({
      //   machines: plan.machine_count ?? 0,
      //   molds:    plan.mold_count    ?? 0,
      //   components: plan.component_count ?? 0,
      // })
    }

    refresh()
    window.addEventListener("focus", refresh)
    window.addEventListener("activePlanChanged", refresh)
    return () => {
      window.removeEventListener("focus", refresh)
      window.removeEventListener("activePlanChanged", refresh)
    }
  }, [])

  return (
    <div className="flex flex-col h-full">
      <AppHeader title="Dashboard" description="Factory scheduling overview" />
      <div className="flex-1 p-4 md:p-6">
        {/* Bento grid: one large hero tile beside three status tiles */}
        <div className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:auto-rows-[minmax(7.5rem,auto)]">
          {/* Hero */}
          <section className="flex flex-col rounded-xl border bg-card p-5 sm:col-span-2 lg:row-span-2">
            <h2 className="text-xl md:text-2xl font-semibold tracking-tight text-card-foreground text-balance">
              TaskAlign — Factory Scheduling System
            </h2>
            <p className="mt-2 text-sm text-muted-foreground max-w-2xl leading-relaxed">
              Plan and optimize your injection molding monthly production schedule
              with a genetic-algorithm-assisted draft scheduler. Manage machines,
              molds, and components, then generate an optimized production plan in
              seconds.
            </p>
            <div className="mt-auto flex flex-wrap gap-2 pt-6">
              <Button asChild>
                <Link href="/machines">
                  <Cog className="mr-2 h-4 w-4" />
                  Machines
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/molds">
                  <Box className="mr-2 h-4 w-4" />
                  Molds
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/components">
                  <Puzzle className="mr-2 h-4 w-4" />
                  Components
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/plan">
                  <CalendarClock className="mr-2 h-4 w-4" />
                  Setup Plan
                </Link>
              </Button>
            </div>
          </section>

          {/* Quick Status */}
          <h3 className="sr-only">Quick Status</h3>
          <StatusCard
            label="Machines"
            count={counts.machines}
            href="/machines"
            icon={<Cog className="h-5 w-5" />}
          />
          <StatusCard
            label="Molds"
            count={counts.molds}
            href="/molds"
            icon={<Box className="h-5 w-5" />}
          />
          <StatusCard
            label="Components"
            count={counts.components}
            href="/components"
            icon={<Puzzle className="h-5 w-5" />}
            className="sm:col-span-2"
          />

          {/* Production progress */}
          <ProgressCard state={progress} className="sm:col-span-2 lg:col-span-4" />
        </div>
      </div>
    </div>
  )
}

function StatusCard({
  label,
  count,
  href,
  icon,
  className = "",
}: {
  label: string
  count: number
  href: string
  icon: React.ReactNode
  className?: string
}) {
  return (
    <Link href={href} className={`group ${className}`}>
      <Card className="h-full transition-colors group-hover:border-primary/50">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {label}
          </CardTitle>
          <span className="text-muted-foreground">{icon}</span>
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-semibold tabular-nums text-card-foreground">{count}</p>
          <p className="text-xs text-muted-foreground mt-1">saved locally</p>
        </CardContent>
      </Card>
    </Link>
  )
}

function ProgressCard({ state, className = "" }: { state: ProgressState; className?: string }) {
  // Without a plan the tile points at Plans; otherwise at the components behind the numbers.
  const href = state.kind === "none" ? "/plans" : "/components"

  return (
    <Link href={href} className={`group ${className}`}>
      <Card className="h-full transition-colors group-hover:border-primary/50">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Production progress
          </CardTitle>
          <span className="text-muted-foreground">
            <Gauge className="h-5 w-5" />
          </span>
        </CardHeader>
        <CardContent>
          {state.kind === "ready" ? (
            <ProgressDetails data={state.data} />
          ) : (
            <p className="py-2 text-sm text-muted-foreground">
              {state.kind === "loading" && "Loading progress…"}
              {state.kind === "none" && "Select a plan to see its production progress."}
              {state.kind === "error" && "Couldn't load production progress."}
            </p>
          )}
        </CardContent>
      </Card>
    </Link>
  )
}

function ProgressDetails({ data }: { data: ProductionProgress }) {
  const { components } = data

  if (data.totalPieces === 0) {
    return <p className="py-2 text-sm text-muted-foreground">This plan has no components yet.</p>
  }

  const groups = [
    { label: "Done", count: components.done, color: "bg-emerald-600" },
    { label: "In progress", count: components.inProgress, color: "bg-primary" },
    { label: "Not started", count: components.notStarted, color: "bg-secondary border border-input" },
  ]

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div>
        <p className="text-3xl font-semibold tabular-nums text-card-foreground">{data.percent}%</p>
        <p className="mt-1 text-sm text-muted-foreground tabular-nums">
          {data.finishedPieces.toLocaleString()} of {data.totalPieces.toLocaleString()} pieces finished
        </p>
        <Progress
          value={data.percent}
          // The shared Progress does not forward `value` to ARIA, so state it here.
          aria-label="Pieces finished"
          aria-valuenow={data.percent}
          aria-valuetext={`${data.percent}% of pieces finished`}
          className="mt-3 h-2"
        />
      </div>

      <div>
        <p className="text-sm text-card-foreground tabular-nums">
          <span className="font-semibold">{components.done.toLocaleString()}</span>
          <span className="text-muted-foreground"> of {components.total.toLocaleString()} components complete</span>
        </p>
        <div
          role="img"
          aria-label={groups.map((g) => `${g.count} ${g.label.toLowerCase()}`).join(", ")}
          className="mt-3 flex h-2 w-full overflow-hidden rounded-full bg-secondary"
        >
          {groups.slice(0, 2).map((g) => (
            <div
              key={g.label}
              className={g.color}
              style={{ flexGrow: g.count, flexBasis: 0, minWidth: g.count > 0 ? 3 : 0 }}
            />
          ))}
          {/* Not-started is the remaining track, so it takes the leftover space */}
          <div style={{ flexGrow: components.notStarted, flexBasis: 0 }} />
        </div>
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {groups.map((g) => (
            <li key={g.label} className="flex items-center gap-1.5 tabular-nums">
              <span className={`h-2 w-2 rounded-full ${g.color}`} />
              {g.label} <span className="font-medium text-card-foreground">{g.count.toLocaleString()}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
