"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Circle,
  Cog,
  Box,
  Puzzle,
  Play,
  Eye,
  Settings,
  History,
  AlertTriangle,
  Pencil,
} from "lucide-react"
import { AppHeader } from "@/components/app-header"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  getPlanById,
  setActivePlanId,
  getActivePlanId,
  setCurrentRun,
  getCurrentRunId,
  updatePlan,
} from "@/lib/storage"
import type { Plan, PlanRun } from "@/lib/types"
import { toast } from "sonner"

export default function PlanSummaryPage() {
  const params = useParams()
  const router = useRouter()
  const planId = params.id as string

  const [plan, setPlan] = useState<Plan | null>(null)
  const [activePlanId, setActiveId] = useState<string | null>(null)
  const [currentRunId, setCurrentRunIdState] = useState<string | null>(null)
  const [editingName, setEditingName] = useState(false)
  const [nameValue, setNameValue] = useState("")
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    const p = getPlanById(planId)
    setPlan(p ?? null)
    setActiveId(getActivePlanId())
    setCurrentRunIdState(getCurrentRunId(planId))
    if (p) setNameValue(p.name)
    setLoaded(true)
  }, [planId])

  function refresh() {
    const p = getPlanById(planId)
    setPlan(p ?? null)
    setActiveId(getActivePlanId())
    setCurrentRunIdState(getCurrentRunId(planId))
  }

  function handleSetActive() {
    setActivePlanId(planId)
    refresh()
    toast.success(`"${plan?.name}" is now the active plan`)
  }

  function handleSetCurrentRun(runId: string) {
    setCurrentRun(planId, runId)
    setCurrentRunIdState(runId)
    toast.success("Current run updated")
  }

  function saveName() {
    if (!plan) return
    updatePlan(planId, { name: nameValue.trim() })
    setEditingName(false)
    refresh()
    toast.success("Plan name updated")
  }

  if (!loaded) return null

  if (!plan) {
    return (
      <div className="flex flex-col h-full">
        <AppHeader title="Plan Not Found" description="" />
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="flex flex-col items-center gap-4 text-center">
            <AlertTriangle className="h-12 w-12 text-amber-500" />
            <h2 className="text-lg font-semibold">Plan not found</h2>
            <p className="text-sm text-muted-foreground">
              The requested plan does not exist.
            </p>
            <Button asChild>
              <Link href="/plans">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Plans
              </Link>
            </Button>
          </div>
        </div>
      </div>
    )
  }

  const isActive = plan.id === activePlanId
  const unavailableMachines = plan.machines.filter(
    (m) => m.status === "unavailable"
  ).length
  const latestRun = plan.runs.length > 0 ? plan.runs[plan.runs.length - 1] : null
  const totalUnmet = latestRun
    ? Object.values(latestRun.result.unmet).reduce((s, v) => s + v, 0)
    : 0

  // Finished vs unfinished components
  const finishedComponents = plan.components.filter(
    (c) => (c.finished ?? 0) >= c.quantity && c.quantity > 0
  )
  const unfinishedComponents = plan.components.filter(
    (c) => (c.finished ?? 0) < c.quantity || c.quantity === 0
  )

  return (
    <div className="flex flex-col h-full">
      <AppHeader
        title={
          <div className="flex items-center gap-2">
            {editingName ? (
              <div className="flex items-center gap-2">
                <Input
                  value={nameValue}
                  onChange={(e) => setNameValue(e.target.value)}
                  className="h-8 text-lg font-semibold w-64"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveName()
                    if (e.key === "Escape") {
                      setEditingName(false)
                      setNameValue(plan.name)
                    }
                  }}
                />
                <Button size="sm" variant="ghost" onClick={saveName}>
                  <Check className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <>
                <span>{plan.name}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setEditingName(true)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              </>
            )}
            {isActive && (
              <Badge variant="default" className="ml-2 gap-1">
                <CheckCircle2 className="h-3 w-3" />
                Active
              </Badge>
            )}
          </div>
        }
        description={`Created ${new Date(plan.created_at).toLocaleDateString()}`}
      />

      <div className="flex-1 p-4 md:p-6 flex flex-col gap-6 overflow-y-auto">
        {/* Top actions */}
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" size="sm" asChild>
            <Link href="/plans">
              <ArrowLeft className="mr-2 h-3.5 w-3.5" />
              Back to Plans
            </Link>
          </Button>
          {!isActive && (
            <Button size="sm" onClick={handleSetActive}>
              <Check className="mr-2 h-3.5 w-3.5" />
              Set as Active Plan
            </Button>
          )}
          {isActive && (
            <Button size="sm" asChild>
              <Link href="/plan">
                <Play className="mr-2 h-3.5 w-3.5" />
                Run / Re-run
              </Link>
            </Button>
          )}
          {latestRun && (
            <Button size="sm" variant="outline" asChild>
              <Link href="/plan/output">
                <Eye className="mr-2 h-3.5 w-3.5" />
                View Latest Output
              </Link>
            </Button>
          )}
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <SummaryCard
            label="Start Date"
            value={plan.setup.current_date ? new Date(plan.setup.current_date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "-"}
          />
          <SummaryCard
            label="Machines"
            value={String(plan.machines.length)}
            subValue={
              unavailableMachines > 0
                ? `${unavailableMachines} unavailable`
                : undefined
            }
            alert={unavailableMachines > 0}
          />
          <SummaryCard label="Molds" value={String(plan.molds.length)} />
          <SummaryCard
            label="Components"
            value={String(plan.components.length)}
          />
          <SummaryCard label="Runs" value={String(plan.runs.length)} />
          {latestRun && (
            <>
              <SummaryCard
                label="Last Score"
                value={latestRun.result.score.toFixed(2)}
              />
              <SummaryCard
                label="Unmet Qty"
                value={totalUnmet.toLocaleString()}
                alert={totalUnmet > 0}
              />
            </>
          )}
        </div>

        {/* Component Status */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2 text-emerald-600">
                <CheckCircle2 className="h-4 w-4" />
                Finished Components ({finishedComponents.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {finishedComponents.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No components have met their required quantity yet.
                </p>
              ) : (
                <ScrollArea className="h-32">
                  <div className="flex flex-col gap-1">
                    {finishedComponents.map((c) => (
                      <div
                        key={c.id}
                        className="flex items-center gap-2 text-sm py-1 px-2 rounded bg-emerald-500/10"
                      >
                        <CheckCircle2 className="h-3 w-3 text-emerald-600 shrink-0" />
                        <span className="font-mono text-xs">{c.id}</span>
                        <span className="text-muted-foreground truncate flex-1">{c.name}</span>
                        <span className="text-[10px] text-muted-foreground">
                          Due: {c.due_date ? new Date(c.due_date).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "-"}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {c.finished?.toLocaleString()}/{c.quantity.toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2 text-amber-600">
                <Circle className="h-4 w-4" />
                Unfinished Components ({unfinishedComponents.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {unfinishedComponents.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  All components have met their required quantity.
                </p>
              ) : (
                <ScrollArea className="h-32">
                  <div className="flex flex-col gap-1">
                    {unfinishedComponents.map((c) => (
                      <div
                        key={c.id}
                        className="flex items-center gap-2 text-sm py-1 px-2 rounded bg-amber-500/10"
                      >
                        <Circle className="h-3 w-3 text-amber-600 shrink-0" />
                        <span className="font-mono text-xs">{c.id}</span>
                        <span className="text-muted-foreground truncate flex-1">{c.name}</span>
                        <span className="text-[10px] text-muted-foreground">
                          Due: {c.due_date ? new Date(c.due_date).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "-"}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {(c.finished ?? 0).toLocaleString()}/{c.quantity.toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Edit inputs links */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Settings className="h-4 w-4" />
              Edit Inputs
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!isActive ? (
              <p className="text-sm text-muted-foreground">
                Set this plan as active to edit its inputs.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" asChild>
                  <Link href="/machines">
                    <Cog className="mr-1.5 h-3.5 w-3.5" />
                    Machines
                  </Link>
                </Button>
                <Button size="sm" variant="outline" asChild>
                  <Link href="/molds">
                    <Box className="mr-1.5 h-3.5 w-3.5" />
                    Molds
                  </Link>
                </Button>
                <Button size="sm" variant="outline" asChild>
                  <Link href="/components">
                    <Puzzle className="mr-1.5 h-3.5 w-3.5" />
                    Components
                  </Link>
                </Button>
                <Button size="sm" variant="outline" asChild>
                  <Link href="/plan">
                    <Settings className="mr-1.5 h-3.5 w-3.5" />
                    Setup
                  </Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Run history */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <History className="h-4 w-4" />
              Run History
            </CardTitle>
          </CardHeader>
          <CardContent>
            {plan.runs.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No runs yet. Run the scheduler from the Setup Plan page.
              </p>
            ) : (
              <div className="rounded-lg border overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-16">Run #</TableHead>
                      <TableHead>Timestamp</TableHead>
                      <TableHead>Mode</TableHead>
                      <TableHead className="text-right">Score</TableHead>
                      <TableHead className="text-right">Unmet Qty</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[...plan.runs].reverse().map((run, idx) => {
                      const runNumber = plan.runs.length - idx
                      const isCurrent = run.id === currentRunId
                      const unmetQty = Object.values(run.result.unmet).reduce(
                        (s, v) => s + v,
                        0
                      )

                      return (
                        <TableRow
                          key={run.id}
                          className={isCurrent ? "bg-primary/5" : ""}
                        >
                          <TableCell className="font-mono">
                            #{runNumber}
                            {isCurrent && (
                              <Badge
                                variant="secondary"
                                className="ml-2 text-[10px]"
                              >
                                Current
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-sm">
                            {new Date(run.created_at).toLocaleString()}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                run.mode === "fresh" ? "default" : "secondary"
                              }
                              className="capitalize"
                            >
                              {run.mode}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {run.result.score.toFixed(2)}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {unmetQty.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  handleSetCurrentRun(run.id)
                                  router.push("/plan/output")
                                }}
                              >
                                <Eye className="mr-1 h-3.5 w-3.5" />
                                View
                              </Button>
                              {!isCurrent && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleSetCurrentRun(run.id)}
                                >
                                  <Check className="mr-1 h-3.5 w-3.5" />
                                  Set Current
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function SummaryCard({
  label,
  value,
  subValue,
  alert,
}: {
  label: string
  value: string
  subValue?: string
  alert?: boolean
}) {
  return (
    <Card className={alert ? "border-amber-500/40" : ""}>
      <CardContent className="p-3">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p
          className={`text-xl font-semibold mt-0.5 ${
            alert ? "text-amber-600" : "text-card-foreground"
          }`}
        >
          {value}
        </p>
        {subValue && (
          <p className="text-xs text-amber-600 mt-0.5">{subValue}</p>
        )}
      </CardContent>
    </Card>
  )
}
