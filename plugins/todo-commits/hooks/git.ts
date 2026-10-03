import type { Earlier, Place } from '../types'

import { MAX_EARLIER, MAX_NEW_COMMITS, MAX_UNTRACKED } from './config'
import type { Ports } from './state'

type Run = Pick<Ports, 'run'>

/** Runs one git command; its output when it succeeds, else nothing. */
async function git(p: Run, args: string[]): Promise<string | undefined> {
  const ran = await p.run(['git', ...args])

  return ran.exitCode === 0 ? ran.stdout : undefined
}

/** The HEAD hash, or '' when there is none. */
export async function readHead(p: Run): Promise<string> {
  return (await git(p, ['rev-parse', 'HEAD']))?.trim() ?? ''
}

/** The repo and branch, or nothing outside a repo. */
export async function readPlace(p: Run): Promise<Place | null> {
  const top = (await git(p, ['rev-parse', '--show-toplevel']))?.trim()
  const branch = (await git(p, ['rev-parse', '--abbrev-ref', 'HEAD']))?.trim()
  if (top === undefined || branch === undefined) {
    return null
  }

  return { key: `${top}#${branch}`, branch }
}

/** The main branch to compare against: origin's default, else main or master. */
async function findBase(p: Run): Promise<string | undefined> {
  const remote = (await git(p, ['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD']))?.trim()
  if (remote) {
    return remote
  }
  for (const name of ['main', 'master']) {
    if ((await git(p, ['rev-parse', '--verify', '--quiet', name])) !== undefined) {
      return name
    }
  }

  return undefined
}

/** The branch's own commits since the main branch; nothing on the main branch itself or with none. */
export async function readEarlier(p: Run, branch: string | undefined): Promise<Earlier | null> {
  const base = await findBase(p)
  if (branch === undefined || base === undefined || base.replace(/^origin\//, '') === branch) {
    return null
  }
  const total = Number((await git(p, ['rev-list', '--count', `${base}..HEAD`]))?.trim() ?? 0)
  const log = (await git(p, ['log', '--format=%H%x1f%s', `--max-count=${MAX_EARLIER}`, `${base}..HEAD`])) ?? ''
  const commits = log
    .split('\n')
    .filter(Boolean)
    .map(line => {
      const [hash = '', subject = ''] = line.split('\x1f')
      return { hash, subject }
    })

  return total > 0 ? { base, total, commits } : null
}

/** The hashes between two HEADs, oldest first, at most 50. An empty `before` means just `after`. */
export async function newCommits(p: Run, before: string, after: string): Promise<string[]> {
  const range = before === '' ? [after] : [`${before}..${after}`]
  const listed = await git(p, ['rev-list', '--reverse', `--max-count=${MAX_NEW_COMMITS}`, ...range])

  return (listed ?? after).split('\n').filter(Boolean)
}

/** The hashes that are no longer on the branch. */
export async function missingCommits(p: Run, hashes: string[]): Promise<string[]> {
  const gone: string[] = []
  for (const hash of hashes) {
    const ran = await p.run(['git', 'merge-base', '--is-ancestor', hash, 'HEAD'])
    if (ran.exitCode !== 0) {
      gone.push(hash)
    }
  }

  return gone
}

/** A commit's message and diff text; each is missing when git can't read it. */
export async function readCommit(p: Run, hash: string): Promise<{ message?: string; diff?: string }> {
  const message = (await git(p, ['log', '-1', '--format=%B', hash]))?.trim()
  const diff = await git(p, ['show', '--format=', '--no-color', '--no-ext-diff', hash])

  return { message, diff }
}

/** The diff of what is changed but not committed: tracked changes, then up to 20 new files. */
export async function readWorking(p: Run): Promise<{ diff: string; extra: number }> {
  let diff = (await git(p, ['diff', 'HEAD', '--no-color', '--no-ext-diff'])) ?? ''
  const untracked = ((await git(p, ['ls-files', '--others', '--exclude-standard'])) ?? '').split('\n').filter(Boolean)
  for (const path of untracked.slice(0, MAX_UNTRACKED)) {
    // Exits 1 whenever the file differs from nothing, so read stdout whatever the code.
    diff += (await p.run(['git', 'diff', '--no-color', '--no-index', '--', '/dev/null', path])).stdout
  }

  return { diff, extra: untracked.length - MAX_UNTRACKED }
}
