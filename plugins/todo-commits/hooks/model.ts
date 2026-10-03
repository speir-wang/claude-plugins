import type { CommitFile, DiffVerdict } from '../types'

import type { Ports } from './state'

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

/** Asks a small model whether each large file's diff is worth reading. */
export async function judgeLargeFiles(p: Pick<Ports, 'complete'>, message: string, files: CommitFile[]): Promise<Map<string, DiffVerdict>> {
  const large = files.filter(file => file.isLarge)
  const samples = large.map(file => {
    const sample = file.pieces.map(piece => piece.text).join('\n').split('\n').slice(0, 40).join('\n')
    return `FILE ${file.path} (+${file.added} -${file.removed})\n${sample.slice(0, 3000)}`
  })
  const asked = await p.complete({
    model: 'haiku',
    effort: 'low',
    maxTokens: 800,
    timeoutMs: 30000,
    system:
      'You help a developer review a git commit. For each large file diff, say whether it is worth reading by eye. ' +
      'Generated or bulk changes (snapshot tests, lock files, minified or built files, fixtures, data dumps, ' +
      'mass renames or formatting) are usually not. Hand-written logic usually is.',
    prompt: [
      `Commit message: ${message}`,
      '',
      ...samples,
      '',
      'Answer with JSON only: [{"path": "...", "isWorth": true|false, "reason": "one short plain sentence"}]',
    ].join('\n'),
  })

  return asked.isAnswered ? readVerdicts(asked.text) : new Map<string, DiffVerdict>()
}

/** Turns what the person typed into a short todo title; undefined when the model gives nothing usable. */
export async function tidyTitle(p: Pick<Ports, 'complete'>, typed: string): Promise<string | undefined> {
  const asked = await p.complete({
    model: 'haiku',
    effort: 'low',
    maxTokens: 60,
    timeoutMs: 8000,
    system:
      'Rewrite what the user typed as one short todo title. Start with a verb. At most 50 characters. ' +
      'Keep any names, file names and numbers they wrote. Reply with the title only.',
    prompt: typed,
  })

  return asked.isAnswered ? cleanTitle(asked.text) : undefined
}
