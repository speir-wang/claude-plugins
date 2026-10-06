/** Whose PR the review is for: yours to fix, or someone else's to comment on. */
export type Mode = 'mine' | 'theirs'

/** The two kinds of finding the skill reports. They are never mixed. */
export type Group = 'standards' | 'spec'

/** "must": a written rule is broken. "maybe": a judgement call. */
export type Weight = 'must' | 'maybe'

/**
 * Where a finding stands.
 * Your PR: open, queued (on the fix list), fixing, fixed, wontfix.
 * Their PR: open, pending (in the review not yet posted), posted, dropped.
 */
export type FindingStatus = 'open' | 'queued' | 'fixing' | 'fixed' | 'wontfix' | 'pending' | 'posted' | 'dropped'

/** A re-check's answer for one finding you acted on. */
export type Outcome = 'addressed' | 'wrong' | 'missed'

/** A reply on the GitHub thread of a finding, by someone other than you. */
export type Reply = { author: string; body: string }

/** The comment to post on their PR: text, plus the suggested code when `hasCode`. */
export type Draft = { text: string; hasCode: boolean }

export type Finding = {
  /** The number shown and used in chat ("fix 3"). Unique across rounds. */
  n: number
  /** The round that found it. */
  round: number
  /** 'comment' for one rebuilt from your own comment on GitHub. */
  group: Group | 'comment'
  weight: Weight
  /** 1-10; 0 for one rebuilt from a comment, which has no score. */
  score: number
  file: string
  line: number
  title: string
  /** The code as it is now. */
  now: string
  /** The code suggested in its place; '' when there is none. */
  suggested: string
  why: string
  draft: Draft | null
  status: FindingStatus
  /** On their PR: replies on its thread since your last comment there, oldest first. */
  replies?: Reply[]
  outcome?: Outcome
  /** One line on why the outcome is what it is. */
  outcomeNote?: string
  /** The re-check round that gave the outcome. */
  outcomeRound?: number
}

/** One review pass: the first review, then one per re-check. */
export type Round = { n: number; head: string }

export type Review = {
  /** `owner/repo#12`, or the branch name when there is no PR. */
  pr: string
  mode: Mode
  /** Your branch already has a PR on GitHub, so Create PR is not offered. */
  hasPr?: boolean
  rounds: Round[]
  findings: Finding[]
  /** Groups that did not run, with why, by round. */
  skipped: { group: Group; reason: string; round: number }[]
}

/** Lines `start` to `end` of a file, both included. */
export type LineRange = { start: number; end: number }

/** The PR's diff as last fetched: each file's new-side ranges, null when GitHub gave no patch. */
export type DiffCache = { key: string; files: Record<string, LineRange[] | null> }

/** A review of another PR that came in while one was showing. */
export type Incoming = { review: Review; answer: 'ask' | 'keep' }

export type ReviewEvent = 'COMMENT' | 'REQUEST_CHANGES' | 'APPROVE'

/** What the panel shows. */
export type View =
  | { kind: 'list' }
  | { kind: 'finding'; n: number; input?: 'edit' | 'rewrite'; isRewriting?: boolean }
  | { kind: 'submit'; event: ReviewEvent }
  | { kind: 'confirm'; step: 'approve' | 'create' | 'fix' }

/** The review tool's input, unchecked: the model may send anything. */
export type ReviewInput = { action?: unknown } & Record<string, unknown>

declare module 'claude-code' {
  interface PluginState {
    'code-review-mod': {
      review: Review | null
      incoming: Incoming | null
      view: View
      /** A review or re-check recorded something this turn: bring the tab to the front when it ends. */
      shouldFocus: boolean
      /** A review or re-check is running: until the turn ends, empty groups are not "nothing found" yet. */
      isReviewing: boolean
      /** The last thing that went wrong, shown in the panel; '' for none. */
      notice: string
      /** The PR's diff for the review's current head, so "add" can check a line is in it. */
      diff: DiffCache | null
    }
  }
}
