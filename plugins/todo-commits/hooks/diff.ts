import type { CommitFile, DiffPiece } from '../types'

/** The Code element holds at most 10,000 characters; stay a little under. */
const MAX_CODE_CHARS = 9000
/** A file with more changed lines than this starts folded and gets a verdict. */
const LARGE_FILE_LINES = 300
/** Once this many lines are shown unasked, the rest of the files start folded. */
const MAX_SHOWN_LINES = 1500
/** An opened file draws at most this many lines; the rest is left to `git show`. */
const MAX_FILE_LINES = 3000

/** Splits a file's hunks into diff blocks under the Code size limit, never cutting a hunk. */
function toPieces(hunks: string[]): DiffPiece[] {
  const pieces: DiffPiece[] = []
  let block = ''
  const flush = () => {
    if (block !== '') {
      pieces.push({ kind: 'diff', text: block.replace(/\n$/, '') })
      block = ''
    }
  }

  for (const hunk of hunks) {
    if (hunk.length > MAX_CODE_CHARS) {
      flush()
      pieces.push({ kind: 'plain', text: hunk.replace(/\n$/, '') })
    } else if (block.length + hunk.length > MAX_CODE_CHARS) {
      flush()
      block = hunk
    } else {
      block += hunk
    }
  }
  flush()

  return pieces
}

/** Reads one file's part of `git show`: its path, counts and drawable pieces. */
function parseFile(chunk: string, shownSoFar: number): CommitFile {
  const header = chunk.slice(0, chunk.indexOf('\n'))
  const path = header.match(/ b\/(.+)$/)?.[1] ?? header.slice('diff --git '.length)
  const hunkAt = chunk.search(/^@@/m)
  const body = hunkAt === -1 ? '' : chunk.slice(hunkAt)
  const lines = body === '' ? [] : body.replace(/\n$/, '').split('\n')
  const added = lines.filter(line => line.startsWith('+')).length
  const removed = lines.filter(line => line.startsWith('-')).length
  const isLarge = added + removed > LARGE_FILE_LINES || shownSoFar + lines.length > MAX_SHOWN_LINES

  const hunks = body === '' ? [] : body.split(/^(?=@@)/m)
  const kept: string[] = []
  let keptLines = 0
  for (const hunk of hunks) {
    const count = hunk.split('\n').length - 1
    if (keptLines + count > MAX_FILE_LINES && kept.length > 0) {
      break
    }
    kept.push(hunk)
    keptLines += count
  }

  return {
    path,
    added,
    removed,
    pieces: toPieces(kept),
    cutLines: lines.length - keptLines,
    isLarge,
    isOpen: !isLarge,
  }
}

/** Splits `git show` output into files; big ones start folded. */
export function splitDiff(diff: string): CommitFile[] {
  const chunks = diff.split(/^(?=diff --git )/m).filter(chunk => chunk.startsWith('diff --git '))
  const files: CommitFile[] = []
  let shown = 0
  for (const chunk of chunks) {
    const file = parseFile(chunk, shown)
    if (!file.isLarge) {
      shown += file.added + file.removed
    }
    files.push(file)
  }

  return files
}
