export interface ProductionProgress {
  totalPieces: number
  finishedPieces: number
  /** Whole percent of pieces finished, rounded down so 99.6% never reads as 100%. */
  percent: number
  components: {
    total: number
    /** Everything ordered has been produced. */
    done: number
    /** Some, but not all, has been produced. */
    inProgress: number
    notStarted: number
  }
}

type ProgressInput = { quantity?: number | null; finished?: number | null }

export type ComponentStatus = "done" | "in_progress" | "not_started"

/** Ordered and finished quantities as real, non-negative numbers, with finished capped at ordered. */
function normalize(c: ProgressInput): { quantity: number; finished: number } {
  const quantity = Math.max(Number(c.quantity) || 0, 0)
  const finished = Math.min(Math.max(Number(c.finished) || 0, 0), quantity)
  return { quantity, finished }
}

/**
 * Where one component stands. This is the single definition behind both the
 * dashboard's progress tile and the Components page status filter, so the two
 * can never disagree about how many components are "in progress".
 *
 * "Done" matches the filter that already existed there (finished >= quantity,
 * quantity > 0).
 */
export function getComponentStatus(c: ProgressInput): ComponentStatus {
  const { quantity, finished } = normalize(c)
  if (quantity > 0 && finished >= quantity) return "done"
  return finished > 0 ? "in_progress" : "not_started"
}

/**
 * How much of a plan's ordered work is already finished.
 *
 * Finished is capped at the ordered quantity so an over-reported component
 * cannot push the total past 100%.
 */
export function computeProductionProgress(components: readonly ProgressInput[]): ProductionProgress {
  let totalPieces = 0
  let finishedPieces = 0
  let done = 0
  let inProgress = 0
  let notStarted = 0

  for (const c of components) {
    const { quantity, finished } = normalize(c)
    totalPieces += quantity
    finishedPieces += finished

    const status = getComponentStatus(c)
    if (status === "done") done += 1
    else if (status === "in_progress") inProgress += 1
    else notStarted += 1
  }

  return {
    totalPieces,
    finishedPieces,
    percent: totalPieces > 0 ? Math.floor((finishedPieces * 100) / totalPieces) : 0,
    components: { total: components.length, done, inProgress, notStarted },
  }
}
