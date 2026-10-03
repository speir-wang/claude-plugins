import type { Mode } from '../types'

/** `owner/repo#12` from that form or a GitHub PR link; nothing for anything else. */
export function readPr(text: string): string | undefined {
  const short = text.trim().match(/^([\w.-]+\/[\w.-]+)#(\d+)$/)
  if (short !== null) {
    return `${short[1]}#${short[2]}`
  }
  const link = text.match(/github\.com\/([\w.-]+\/[\w.-]+)\/pull\/(\d+)/)

  return link === null ? undefined : `${link[1]}#${link[2]}`
}

/** Every GitHub PR link in a message, as `owner/repo#12`, each once. */
export function prLinks(text: string): string[] {
  const found = [...text.matchAll(/https?:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/\d+/g)].map(m => readPr(m[0]) ?? '')

  return [...new Set(found)]
}

/** The mode a review starts in: the one Claude gave, else "theirs" for a PR and "mine" for a branch. */
export function pickMode(pr: string, given: unknown): Mode {
  if (given === 'mine' || given === 'theirs') {
    return given
  }

  return readPr(pr) === undefined ? 'mine' : 'theirs'
}

/** The other mode: the switch in the panel. */
export function flipMode(mode: Mode): Mode {
  return mode === 'mine' ? 'theirs' : 'mine'
}
