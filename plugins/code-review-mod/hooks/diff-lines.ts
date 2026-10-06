import type { DiffCache, LineRange } from '../types'

import { jsonLines, splitPr } from './github'
import type { Ports } from './ports'

type DiffPorts = Pick<Ports, 'run' | 'diff'>

/** The new-side line ranges of a unified diff patch: `@@ -a,b +c,d @@` covers c..c+d-1. */
export function parseHunks(patch: string): LineRange[] {
  return [...patch.matchAll(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/gm)].flatMap(found => {
    const start = Number(found[1])
    const count = found[2] === undefined ? 1 : Number(found[2])
    return count === 0 ? [] : [{ start, end: start + count - 1 }]
  })
}

/** Where a line stands against the PR's diff. */
export type InDiff = { is: 'in' } | { is: 'out'; near: LineRange[] } | { is: 'no-file' } | { is: 'unknown' }

/** The changed ranges closest to the line: the last one before it and the first one after it. */
function nearby(ranges: LineRange[], line: number): LineRange[] {
  const before = ranges.filter(r => r.end < line).at(-1)
  const after = ranges.find(r => r.start > line)

  return [before, after].filter(r => r !== undefined)
}

/** The PR's files and their ranges at `head`, fetched once per PR and head; null when gh can't tell. */
async function readDiff(p: DiffPorts, pr: string, head: string): Promise<DiffCache['files'] | null> {
  const key = `${pr}@${head}`
  const cached = await p.diff.get()
  if (cached?.key === key) {
    return cached.files
  }
  const place = splitPr(pr)
  if (place === undefined) {
    return null
  }
  const ran = await p.run(['gh', 'api', `repos/${place.repo}/pulls/${place.number}/files`, '--paginate', '--jq', '.[] | {filename, patch} | @json'])
  if (ran.exitCode !== 0) {
    return null
  }
  // GitHub leaves out the patch of binary and very large files: those can't be checked.
  const files = Object.fromEntries(
    jsonLines<{ filename: string; patch?: string | null }>(ran.stdout).map(f => [f.filename, typeof f.patch === 'string' ? parseHunks(f.patch) : null]),
  )
  await p.diff.update(() => ({ key, files }))

  return files
}

/** Whether GitHub would take an inline comment on this line of the PR at `head`. */
export async function isInDiff(p: DiffPorts, pr: string, head: string, file: string, line: number): Promise<InDiff> {
  const files = await readDiff(p, pr, head)
  if (files === null) {
    return { is: 'unknown' }
  }
  if (!Object.hasOwn(files, file)) {
    return { is: 'no-file' }
  }
  const ranges = files[file]
  if (ranges === null || ranges === undefined) {
    return { is: 'unknown' }
  }

  return ranges.some(r => r.start <= line && line <= r.end) ? { is: 'in' } : { is: 'out', near: nearby(ranges, line) }
}
