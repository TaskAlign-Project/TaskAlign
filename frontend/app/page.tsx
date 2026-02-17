"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Cog, Box, Puzzle, CalendarClock, Database } from "lucide-react"
import { AppHeader } from "@/components/app-header"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { getMachines, getMolds, getComponents, loadExampleData } from "@/lib/storage"
import { toast } from "sonner"

export default function DashboardPage() {
  const [counts, setCounts] = useState({ machines: 0, molds: 0, components: 0 })

  useEffect(() => {
    setCounts({
      machines: getMachines().length,
      molds: getMolds().length,
      components: getComponents().length,
    })
  }, [])

  function handleLoadExample() {
    loadExampleData()
    setCounts({
      machines: getMachines().length,
      molds: getMolds().length,
      components: getComponents().length,
    })
    toast.success("Example data loaded successfully")
  }

  return (
    <div className="flex flex-col h-full">
      <AppHeader title="Dashboard" description="Factory scheduling overview" />
      <div className="flex-1 p-4 md:p-6 flex flex-col gap-6">
        {/* Hero */}
        <section className="rounded-lg border bg-card p-6 md:p-8">
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-card-foreground text-balance">
            TaskAlign — Factory Scheduling System
          </h2>
          <p className="mt-2 text-muted-foreground max-w-2xl leading-relaxed">
            Plan and optimize your injection molding monthly production schedule
            with a genetic-algorithm-assisted draft scheduler. Manage machines,
            molds, and components, then generate an optimized production plan in
            seconds.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
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
        <section>
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
            Quick Status
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
            />
          </div>
        </section>

        {/* Load Example Data */}
        <section className="rounded-lg border bg-card p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h3 className="font-semibold text-card-foreground">
                Get started quickly
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                Load example machines, molds, and components.
              </p>
            </div>
            <Button variant="secondary" onClick={handleLoadExample}>
              <Database className="mr-2 h-4 w-4" />
              Load Example Data
            </Button>
          </div>
        </section>
      </div>
    </div>
  )
}

function StatusCard({
  label,
  count,
  href,
  icon,
}: {
  label: string
  count: number
  href: string
  icon: React.ReactNode
}) {
  return (
    <Link href={href} className="group">
      <Card className="transition-colors group-hover:border-primary/40">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {label}
          </CardTitle>
          <span className="text-muted-foreground">{icon}</span>
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-bold text-card-foreground">{count}</p>
          <p className="text-xs text-muted-foreground mt-1">saved locally</p>
        </CardContent>
      </Card>
    </Link>
  )
}
