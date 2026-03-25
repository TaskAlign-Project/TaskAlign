"use client"

import { useState, useRef } from "react"
import { Upload, FileSpreadsheet, Download, AlertCircle, CheckCircle2 } from "lucide-react"
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
import {
  type ImportType,
  type ImportResult,
  parseMachinesFromExcel,
  parseMoldsFromExcel,
  parseComponentsFromExcel,
  generateTemplate,
  MACHINE_COLUMNS,
  MOLD_COLUMNS,
  COMPONENT_COLUMNS,
} from "@/lib/excel-import"
import type { PlanMachine, Mold, Component } from "@/lib/types"

import { machinesApi, moldsApi, componentsApi} from "@/lib/api"
import { toast } from "sonner"

interface Props<T> {
  open: boolean
  onOpenChange: (open: boolean) => void
  type: ImportType
  onImport: (data: T[], mode: "replace" | "append") => void
}

const TYPE_LABELS: Record<ImportType, string> = {
  machines: "Machines",
  molds: "Molds",
  components: "Components",
}

const TYPE_COLUMNS: Record<ImportType, readonly string[]> = {
  machines: MACHINE_COLUMNS,
  molds: MOLD_COLUMNS,
  components: COMPONENT_COLUMNS,
}

type AnyImportData = PlanMachine | Mold | Component

export function ExcelImportDialog<T extends AnyImportData>({
  open,
  onOpenChange,
  type,
  onImport,
}: Props<T>) {
  const [file, setFile] = useState<File | null>(null)
  const [result, setResult] = useState<ImportResult<T> | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0]
    if (selected) {
      setFile(selected)
      setResult(null)
      processFile(selected)
    }
  }

  async function processFile(f: File) {
    setIsProcessing(true)
    try {
      let parseResult: ImportResult<AnyImportData>
      switch (type) {
        case "machines":
          parseResult = await parseMachinesFromExcel(f)
          break
        case "molds":
          parseResult = await parseMoldsFromExcel(f)
          break
        case "components":
          parseResult = await parseComponentsFromExcel(f)
          break
      }
      setResult(parseResult as ImportResult<T>)
    } catch {
      setResult({
        success: false,
        data: [],
        errors: ["Failed to process file"],
        warnings: [],
      })
    } finally {
      setIsProcessing(false)
    }
  }

  // function handleImport(mode: "replace" | "append") {
  //   if (result && result.data.length > 0) {
  //     onImport(result.data, mode)
  //     handleClose()
  //   }
  // }

  // Inside ExcelImportDialog
  async function handleImport(mode: "replace" | "append") {
    if (!file) return
    setIsProcessing(true)
    try {
      if (type === "machines") {
        await machinesApi.import(file)
      } else if (type === "molds") {
        await moldsApi.import(file)
      } else if (type === "components") {
        await componentsApi.import(file)
      }

      toast.success(`Imported ${TYPE_LABELS[type]} successfully`)
      onImport([], mode)
      handleClose()
    } catch (error) {
      console.error(error)
      toast.error(`Failed to import ${TYPE_LABELS[type]}`)
    } finally {
      setIsProcessing(false)
    }
  }

  function handleClose() {
    setFile(null)
    setResult(null)
    onOpenChange(false)
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  function handleDownloadTemplate() {
    generateTemplate(type)
  }

  const columns = TYPE_COLUMNS[type]

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Import {TYPE_LABELS[type]} from Excel</DialogTitle>
          <DialogDescription>
            Upload an Excel file (.xlsx, .xls) to import {TYPE_LABELS[type].toLowerCase()}.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {/* File upload area */}
          <div
            className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileSelect}
              className="hidden"
            />
            {file ? (
              <div className="flex flex-col items-center gap-2">
                <FileSpreadsheet className="h-10 w-10 text-emerald-500" />
                <p className="font-medium">{file.name}</p>
                <p className="text-xs text-muted-foreground">
                  Click to select a different file
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <Upload className="h-10 w-10 text-muted-foreground" />
                <p className="font-medium">Click to select Excel file</p>
                <p className="text-xs text-muted-foreground">
                  Supports .xlsx and .xls files
                </p>
              </div>
            )}
          </div>

          {/* Processing indicator */}
          {isProcessing && (
            <div className="text-center text-sm text-muted-foreground">
              Processing file...
            </div>
          )}

          {/* Results */}
          {result && !isProcessing && (
            <div className="flex flex-col gap-3">
              {/* Summary */}
              <div className="flex items-center gap-2">
                {result.data.length > 0 ? (
                  <>
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    <span className="text-sm">
                      Found {result.data.length} {TYPE_LABELS[type].toLowerCase()} to import
                    </span>
                  </>
                ) : (
                  <>
                    <AlertCircle className="h-4 w-4 text-destructive" />
                    <span className="text-sm text-destructive">
                      No valid data found
                    </span>
                  </>
                )}
              </div>

              {/* Errors */}
              {result.errors.length > 0 && (
                <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3">
                  <p className="text-xs font-medium text-destructive mb-2">
                    Errors ({result.errors.length})
                  </p>
                  <ScrollArea className="h-24">
                    <ul className="text-xs text-destructive space-y-1">
                      {result.errors.map((err, i) => (
                        <li key={i}>{err}</li>
                      ))}
                    </ul>
                  </ScrollArea>
                </div>
              )}

              {/* Warnings */}
              {result.warnings.length > 0 && (
                <div className="rounded-md border border-amber-500/50 bg-amber-500/10 p-3">
                  <p className="text-xs font-medium text-amber-600 mb-2">
                    Warnings ({result.warnings.length})
                  </p>
                  <ScrollArea className="h-24">
                    <ul className="text-xs text-amber-600 space-y-1">
                      {result.warnings.map((warn, i) => (
                        <li key={i}>{warn}</li>
                      ))}
                    </ul>
                  </ScrollArea>
                </div>
              )}
            </div>
          )}

          {/* Expected columns */}
          <div className="rounded-md bg-muted p-3">
            <p className="text-xs font-medium mb-2">Expected columns:</p>
            <div className="flex flex-wrap gap-1">
              {columns.map((col) => (
                <Badge key={col} variant="secondary" className="text-xs font-mono">
                  {col}
                </Badge>
              ))}
            </div>
          </div>

          {/* Download template */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleDownloadTemplate}
            className="w-full"
          >
            <Download className="mr-2 h-4 w-4" />
            Download Template
          </Button>
        </div>

        <DialogFooter className="flex gap-2 sm:gap-2">
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          {result && result.data.length > 0 && (
            <>
              <Button
                variant="secondary"
                onClick={() => handleImport("append")}
              >
                Append to Existing
              </Button>
              <Button onClick={() => handleImport("replace")}>
                Replace All
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
