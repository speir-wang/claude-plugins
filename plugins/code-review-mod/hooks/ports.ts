import type { ModelCompleteRequest, ModelCompleteResult } from 'claude-code'

import type { Finding, Incoming, Review, View } from '../types'

/** One value the plugin keeps in `$.state`, read and changed through two small calls. */
export type Cell<T> = {
  get: () => Promise<T>
  /** Changes the value and answers the new one. */
  update: (change: (value: T) => T) => Promise<T>
}

/**
 * The engine's calls the other modules may use, as plain calls.
 * The engine only follows `$` inside the entry file, so the entry file builds
 * this and hands it on. Each module asks only for the members it uses.
 */
export type Ports = {
  run: (argv: string[], stdin?: string) => Promise<{ exitCode: number; stdout: string; stderr: string }>
  openPane: (options?: { focus?: true; closeOnEscape?: true }) => Promise<void>
  complete: (request: ModelCompleteRequest) => Promise<ModelCompleteResult>
  /** Sends a prompt that Claude answers in a turn of its own. */
  submit: (text: string) => Promise<void>
  /** Puts text in the prompt box for the user to finish. */
  fill: (text: string) => Promise<void>
  review: Cell<Review | null>
  incoming: Cell<Incoming | null>
  view: Cell<View>
  shouldFocus: Cell<boolean>
  isReviewing: Cell<boolean>
  notice: Cell<string>
}

/** Changes the review shown; nothing happens while there is none. Answers the new review. */
export async function changeReview(p: Pick<Ports, 'review'>, change: (review: Review) => Review): Promise<Review | null> {
  return p.review.update(review => (review === null ? review : change(review)))
}

/** One finding of the review shown, by its number. */
export async function findingOf(p: Pick<Ports, 'review'>, n: unknown): Promise<Finding | undefined> {
  return (await p.review.get())?.findings.find(f => f.n === n)
}
