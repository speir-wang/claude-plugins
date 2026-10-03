import type { DiffVerdict } from '../types'

/** Reads the model's answer about large files: path to verdict. Bad replies give an empty map. */
export function readVerdicts(reply: string): Map<string, DiffVerdict> {
  const verdicts = new Map<string, DiffVerdict>()
  try {
    const json: unknown = JSON.parse(reply.slice(reply.indexOf('['), reply.lastIndexOf(']') + 1))
    for (const item of Array.isArray(json) ? json : []) {
      if (typeof item?.path === 'string' && typeof item?.reason === 'string') {
        verdicts.set(item.path, { isWorth: item.isWorth !== false, reason: item.reason })
      }
    }
  } catch {
    // A reply that is not JSON leaves the files without a verdict.
  }

  return verdicts
}

/** Tidies the model's title: first line, no quotes or trailing period; nothing when empty or too long. */
export function cleanTitle(reply: string): string | undefined {
  const title = reply.trim().split('\n')[0]?.replace(/^["'`]+|["'`.]+$/g, '').trim() ?? ''

  return title === '' || title.length > 80 ? undefined : title
}
