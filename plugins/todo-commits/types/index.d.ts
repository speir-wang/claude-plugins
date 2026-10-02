export type TodoStatus = 'pending' | 'in_progress' | 'completed'

export type Todo = {
  id: string
  title: string
  status: TodoStatus
  /** Full commit hashes made while this todo was the active one, oldest first. */
  commits: string[]
}

/**
 * One drawable part of a file's diff: whole hunks as a diff block, or one
 * hunk too long for a diff block, drawn line by line.
 */
export type DiffPiece = { kind: 'diff' | 'plain'; text: string }

/** The model's view on whether a large file's diff is worth reading. */
export type DiffVerdict = { isWorth: boolean; reason: string }

export type CommitFile = {
  path: string
  added: number
  removed: number
  pieces: DiffPiece[]
  /** Lines left out of `pieces` once the per-file cap was reached. */
  cutLines: number
  /** Too big to show unasked: drawn folded until the person opens it. */
  isLarge: boolean
  isOpen: boolean
  verdict?: DiffVerdict
}

export type CommitView = {
  /** A commit hash, or 'working' for the changes not committed yet. */
  hash: string
  kind: 'commit' | 'working'
  message: string
  files: CommitFile[]
  /** The model is still judging the large files. */
  isChecking: boolean
}

/** Where the list belongs: one saved list per repo and branch. */
export type Place = { key: string; branch: string }

export type EarlierCommit = { hash: string; subject: string }

/** The branch's own commits since it split from the main branch. */
export type Earlier = { base: string; total: number; commits: EarlierCommit[] }

declare module 'claude-code' {
  interface PluginState {
    'todo-commits': {
      todos: Todo[]
      /** HEAD as last seen; '' when the folder has no commits or is no repo. */
      head: string
      /** The todo that was last in progress, for commits made after it closed. */
      lastActiveId: string
      commit: CommitView | null
      place: Place | null
      earlier: Earlier | null
      isEarlierOpen: boolean
      /** The spinner's frame while a todo is in progress. */
      frame: number
      /** Linked commits that are no longer on the branch (reset, rebase). */
      dropped: string[]
    }
  }
}
