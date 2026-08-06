import assert from "node:assert/strict"
import test from "node:test"

import { resolveMoldName } from "./mold-utils.ts"
import type { Mold } from "./types.ts"


const molds: Mold[] = [
  {
    id: "database-uuid-1",
    code: "MO1",
    name: "Mold Small A",
    group: "small",
    tonnage: 100,
  },
]

test("displays the mold name for a legacy mold code", () => {
  assert.equal(resolveMoldName("MO1", molds), "Mold Small A")
})

test("keeps an existing mold name unchanged", () => {
  assert.equal(resolveMoldName("Mold Small A", molds), "Mold Small A")
})

test("resolves an internal mold UUID to the mold name", () => {
  assert.equal(resolveMoldName("database-uuid-1", molds), "Mold Small A")
})

test("preserves an unknown mold identifier", () => {
  assert.equal(resolveMoldName("Unknown Mold", molds), "Unknown Mold")
})
