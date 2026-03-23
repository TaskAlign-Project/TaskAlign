"use client"

import Link from "next/link"
import { FolderKanban } from "lucide-react"
import { Button } from "@/components/ui/button"

interface Props {
  title?: string
  description?: string
}

export function NoPlanState({
  title = "No plan selected",
  description = "Select or create a plan to manage this data.",
}: Props) {
  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="flex flex-col items-center gap-4 text-center max-w-sm">
        <div className="flex items-center justify-center w-14 h-14 rounded-full bg-muted">
          <FolderKanban className="h-7 w-7 text-muted-foreground" />
        </div>
        <h2 className="text-lg font-semibold text-card-foreground">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
        <Button asChild>
          <Link href="/plans">Go to Plans</Link>
        </Button>
      </div>
    </div>
  )
}
