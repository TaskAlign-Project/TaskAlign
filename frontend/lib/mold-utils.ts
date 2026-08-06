import type { Mold } from "./types"


function normalize(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase()
}

/** Resolve legacy mold codes/UUIDs to the public human-readable mold name. */
export function resolveMoldName(moldId: string, molds: Mold[]): string {
  const requested = normalize(moldId)
  if (!requested) return ""

  const match = molds.find((mold) =>
    [mold.name, mold.code, mold.id].some(
      (identifier) => normalize(identifier) === requested
    )
  )

  return match?.name.trim() || moldId.trim()
}
