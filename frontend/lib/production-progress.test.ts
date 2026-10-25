import assert from "node:assert/strict"
import test from "node:test"

import { computeProductionProgress, getComponentStatus } from "./production-progress.ts"

test("sums pieces and splits components into done / in progress / not started", () => {
  const progress = computeProductionProgress([
    { quantity: 1000, finished: 1000 }, // done
    { quantity: 500, finished: 125 }, // in progress
    { quantity: 300, finished: 0 }, // not started
    { quantity: 200, finished: 200 }, // done
  ])

  assert.equal(progress.totalPieces, 2000)
  assert.equal(progress.finishedPieces, 1325)
  assert.equal(progress.percent, 66)
  assert.deepEqual(progress.components, { total: 4, done: 2, inProgress: 1, notStarted: 1 })
})

test("the three component groups always add up to the total", () => {
  const progress = computeProductionProgress([
    { quantity: 10, finished: 10 },
    { quantity: 10, finished: 3 },
    { quantity: 10, finished: 0 },
    { quantity: 0, finished: 0 },
    { quantity: 5 },
  ])
  const { total, done, inProgress, notStarted } = progress.components

  assert.equal(done + inProgress + notStarted, total)
})

test("finished above the ordered quantity is capped, so progress cannot pass 100%", () => {
  const progress = computeProductionProgress([{ quantity: 100, finished: 150 }])

  assert.equal(progress.finishedPieces, 100)
  assert.equal(progress.percent, 100)
  assert.equal(progress.components.done, 1)
})

test("a missing or negative finished counts as nothing finished", () => {
  const progress = computeProductionProgress([
    { quantity: 100 },
    { quantity: 100, finished: null },
    { quantity: 100, finished: -20 },
  ])

  assert.equal(progress.finishedPieces, 0)
  assert.equal(progress.components.notStarted, 3)
})

test("percent rounds down so nearly-finished never reads as complete", () => {
  const progress = computeProductionProgress([{ quantity: 1000, finished: 996 }])

  assert.equal(progress.percent, 99)
})

test("a component with no quantity is not 'done' and adds no pieces", () => {
  const progress = computeProductionProgress([{ quantity: 0, finished: 0 }, { quantity: 100, finished: 100 }])

  assert.equal(progress.totalPieces, 100)
  assert.equal(progress.components.done, 1)
  assert.equal(progress.components.notStarted, 1)
})

test("an empty plan is 0%, not a divide-by-zero", () => {
  const progress = computeProductionProgress([])

  assert.equal(progress.percent, 0)
  assert.deepEqual(progress.components, { total: 0, done: 0, inProgress: 0, notStarted: 0 })
})

test("getComponentStatus: done, in progress and not started", () => {
  assert.equal(getComponentStatus({ quantity: 100, finished: 100 }), "done")
  assert.equal(getComponentStatus({ quantity: 100, finished: 40 }), "in_progress")
  assert.equal(getComponentStatus({ quantity: 100, finished: 1 }), "in_progress")
  assert.equal(getComponentStatus({ quantity: 100, finished: 0 }), "not_started")
})

test("getComponentStatus treats missing, negative and over-reported values sensibly", () => {
  assert.equal(getComponentStatus({ quantity: 100 }), "not_started")
  assert.equal(getComponentStatus({ quantity: 100, finished: null }), "not_started")
  assert.equal(getComponentStatus({ quantity: 100, finished: -5 }), "not_started")
  assert.equal(getComponentStatus({ quantity: 100, finished: 250 }), "done")
})

test("a component with no quantity is never 'done' or 'in progress'", () => {
  assert.equal(getComponentStatus({ quantity: 0, finished: 0 }), "not_started")
  assert.equal(getComponentStatus({ quantity: 0, finished: 30 }), "not_started")
})

test("the status filter and the dashboard tile always agree on the counts", () => {
  const components = [
    { quantity: 100, finished: 100 },
    { quantity: 100, finished: 250 },
    { quantity: 100, finished: 40 },
    { quantity: 50, finished: 1 },
    { quantity: 100, finished: 0 },
    { quantity: 0, finished: 30 },
    { quantity: 100 },
  ]
  const byStatus = (s: string) => components.filter((c) => getComponentStatus(c) === s).length
  const { done, inProgress, notStarted } = computeProductionProgress(components).components

  assert.deepEqual([byStatus("done"), byStatus("in_progress"), byStatus("not_started")], [done, inProgress, notStarted])
})
