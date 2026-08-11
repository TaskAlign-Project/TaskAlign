"use client"

import { useRef, useState } from "react"
import {
  Upload,
  FileSpreadsheet,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  X,
} from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { clientImportApi, type ClientImportResult } from "@/lib/api"
import { toast } from "sonner"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  planId: string | null
  /** Called after a successful (non-preview) import so the page can reload. */
  onImported: () => void | Promise<void>
}

/**
 * Import molds + components from the client's two native exports.
 *
 * Both files feed one request: molds and components are both derived from
 * Overview_Lastest.xlsx, so importing them separately would mean uploading the
 * same file twice and would let the two sets drift apart.
 */
export function ClientImportDialog({ open, onOpenChange, planId, onImported }: Props) {
  const [overview, setOverview] = useState<File | null>(null)
  const [zppi, setZppi] = useState<File | null>(null)
  const [mode, setMode] = useState<"append" | "replace">("replace")
  const [skipCompleted, setSkipCompleted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState<ClientImportResult | null>(null)

  const overviewRef = useRef<HTMLInputElement>(null)
  const zppiRef = useRef<HTMLInputElement>(null)

  const ready = Boolean(overview && zppi && planId)

  function reset() {
    setOverview(null)
    setZppi(null)
    setPreview(null)
    setBusy(false)
    if (overviewRef.current) overviewRef.current.value = ""
    if (zppiRef.current) zppiRef.current.value = ""
  }

  function close() {
    reset()
    onOpenChange(false)
  }

  async function submit(dryRun: boolean) {
    if (!overview || !zppi || !planId) return
    setBusy(true)
    try {
      const result = await clientImportApi.importClientFormat({
        planId,
        overview,
        zppi,
        mode,
        skipCompleted,
        dryRun,
      })
      setPreview(result)
      if (!dryRun) {
        toast.success(
          `Imported ${result.components.created} components and ${result.molds.created} molds`
        )
        await onImported()
        close()
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Import failed"
      toast.error(message)
      setPreview(null)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : close())}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import from Overview + ZPPI010</DialogTitle>
          <DialogDescription>
            Upload both files. Molds and components are imported together, since
            both come from the Overview sheet.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {!planId && (
            <div className="flex items-center gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-3">
              <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
              <span className="text-sm text-destructive">
                Select an active plan before importing.
              </span>
            </div>
          )}

          <FileSlot
            label="Overview file"
            hint="Overview_Lastest.xlsx — molds, cycle times, colours"
            file={overview}
            inputRef={overviewRef}
            onSelect={(f) => {
              setOverview(f)
              setPreview(null)
            }}
          />
          <FileSlot
            label="Production orders file"
            hint="ZPPI010_Lastest.xlsx — quantities, dates, order numbers"
            file={zppi}
            inputRef={zppiRef}
            onSelect={(f) => {
              setZppi(f)
              setPreview(null)
            }}
          />

          {/* Options */}
          <div className="flex flex-wrap items-end gap-4 rounded-lg border bg-muted/30 p-3">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">Existing components</Label>
              <Select
                value={mode}
                onValueChange={(v) => {
                  setMode(v as "append" | "replace")
                  setPreview(null)
                }}
              >
                <SelectTrigger className="h-8 w-44 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="replace">Replace all</SelectItem>
                  <SelectItem value="append">Keep and add new</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2 pb-1.5">
              <Checkbox
                id="skip-completed"
                checked={skipCompleted}
                onCheckedChange={(v) => {
                  setSkipCompleted(v === true)
                  setPreview(null)
                }}
              />
              <Label htmlFor="skip-completed" className="text-xs font-normal">
                Exclude orders already produced in full
              </Label>
            </div>
          </div>

          {busy && (
            <p className="text-center text-sm text-muted-foreground">Processing…</p>
          )}

          {preview && !busy && <PreviewPanel result={preview} />}
        </div>

        <DialogFooter className="flex gap-2 sm:gap-2">
          <Button variant="outline" onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="secondary"
            onClick={() => submit(true)}
            disabled={!ready || busy}
          >
            Preview
          </Button>
          <Button onClick={() => submit(false)} disabled={!ready || busy}>
            Import
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function FileSlot({
  label,
  hint,
  file,
  inputRef,
  onSelect,
}: {
  label: string
  hint: string
  file: File | null
  inputRef: React.RefObject<HTMLInputElement>
  onSelect: (file: File | null) => void
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs">{label}</Label>
      <div
        className="flex cursor-pointer items-center gap-3 rounded-lg border-2 border-dashed p-3 transition-colors hover:border-primary/50"
        onClick={() => inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={(e) => onSelect(e.target.files?.[0] ?? null)}
        />
        {file ? (
          <>
            <FileSpreadsheet className="h-6 w-6 shrink-0 text-emerald-500" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{file.name}</p>
              <p className="text-xs text-muted-foreground">
                {(file.size / 1024 / 1024).toFixed(1)} MB
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0"
              onClick={(e) => {
                e.stopPropagation()
                if (inputRef.current) inputRef.current.value = ""
                onSelect(null)
              }}
            >
              <X className="h-4 w-4" />
            </Button>
          </>
        ) : (
          <>
            <Upload className="h-6 w-6 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <p className="text-sm font-medium">Click to select</p>
              <p className="truncate text-xs text-muted-foreground">{hint}</p>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function PreviewPanel({ result }: { result: ClientImportResult }) {
  const stats = result.stats ?? {}
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
        <span className="text-sm">
          {result.dry_run ? "Preview — nothing saved yet" : "Imported"}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Molds new" value={result.molds.created} />
        <Stat label="Molds updated" value={result.molds.updated} />
        <Stat label="Components" value={result.components.created} />
        <Stat
          label={result.components.deleted ? "Replaced" : "Skipped"}
          value={result.components.deleted || result.components.skipped}
        />
      </div>

      {typeof stats.orders_already_complete === "number" && (
        <p className="text-xs text-muted-foreground">
          {stats.orders} orders read · {stats.orders_already_complete} already
          complete · {stats.orders_unmatched} without an Overview row ·{" "}
          {stats.components_without_color} without a colour
        </p>
      )}

      {result.errors.length > 0 && (
        <MessageList
          tone="error"
          title={`Errors (${result.errors.length})`}
          items={result.errors}
        />
      )}
      {result.warnings.length > 0 && (
        <MessageList
          tone="warning"
          title={`Warnings (${result.warnings.length})`}
          items={result.warnings}
        />
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border bg-card px-3 py-2">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="text-lg font-semibold tabular-nums">{value.toLocaleString()}</p>
    </div>
  )
}

function MessageList({
  tone,
  title,
  items,
}: {
  tone: "error" | "warning"
  title: string
  items: string[]
}) {
  const isError = tone === "error"
  return (
    <div
      className={`rounded-md border p-3 ${
        isError
          ? "border-destructive/50 bg-destructive/10"
          : "border-amber-500/50 bg-amber-500/10"
      }`}
    >
      <p
        className={`mb-2 flex items-center gap-1.5 text-xs font-medium ${
          isError ? "text-destructive" : "text-amber-600"
        }`}
      >
        {isError ? (
          <AlertCircle className="h-3.5 w-3.5" />
        ) : (
          <AlertTriangle className="h-3.5 w-3.5" />
        )}
        {title}
      </p>
      <ScrollArea className="max-h-32">
        <ul
          className={`space-y-1 text-xs ${
            isError ? "text-destructive" : "text-amber-700"
          }`}
        >
          {items.map((text, i) => (
            <li key={i}>{text}</li>
          ))}
        </ul>
      </ScrollArea>
    </div>
  )
}
