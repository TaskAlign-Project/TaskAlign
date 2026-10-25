// app/page.tsx

"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Cog, Box, Puzzle, CalendarClock } from "lucide-react"
import { AppHeader } from "@/components/app-header"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { getActivePlan } from "@/lib/storage"
// import { plansApi } from "@/lib/api"
import { machinesApi, moldsApi, componentsApi } from "@/lib/api"


export default function DashboardPage() {
  const [counts, setCounts] = useState({ machines: 0, molds: 0, components: 0 })

  useEffect(() => {
    async function refresh() {
      const plan = getActivePlan() as any
      if (!plan?.id) {
        setCounts({ machines: 0, molds: 0, components: 0 })
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
      } catch {
        setCounts({ machines: 0, molds: 0, components: 0 })
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
