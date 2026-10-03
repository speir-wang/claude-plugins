import type { Earlier, EarlierCommit, Todo } from '../../types'

/** What a press on a todo row opens. */
export type RowOpens = { kind: 'commit'; hash: string } | { kind: 'working' } | null

/** The note on the right of a row, when it has one. */
export type RowTag = { text: string; color: 'red' | 'yellow' | undefined }

/** Every display choice for one todo row. */
export type RowLook = {
  icon: string
  iconColor: 'green' | 'yellow' | undefined
  /** The button's key; undefined when the row is not a button. */
  key: string | undefined
  /** The button's label, or the row's text when it is not a button. */
  label: string
  hotkey: string | undefined
  tag: RowTag | null
  opens: RowOpens
}

/** The input of the todos tool, as the tool row reads it. */
export type ToolInput = { action?: unknown; titles?: unknown; number?: unknown }

/** Cuts or pads text to exactly `width` cells (one cell per character). */
export function fit(text: string, width: number): string {
  if (width <= 1) {
    return ''
  }
  return text.length > width ? `${text.slice(0, width - 1)}…` : text.padEnd(width)
}

/** How one todo row looks: icon, label, hotkey, tag and what a press opens. */
export function rowLook(todo: Todo, n: number, spin: string, isDropped: boolean, titleWidth: number): RowLook {
  const latest = todo.commits.at(-1)
  const isMissing = todo.status === 'completed' && latest === undefined
  const icon = todo.status === 'pending' ? '☐' : todo.status === 'in_progress' ? spin : isMissing ? '⚠' : '✔'
  const iconColor = todo.status === 'pending' ? undefined : todo.status === 'in_progress' || isMissing ? 'yellow' : 'green'
  const title = fit(todo.title, titleWidth)
  const number = n <= 9 ? `${n}: ` : `${n}:`
  const prefix = n <= 9 ? '' : number
  const hotkey = n <= 9 ? String(n) : undefined

  if (latest === undefined) {
    if (todo.status === 'in_progress') {
      return { icon, iconColor, key: `w-${todo.id}`, label: `${prefix}${title} —`, hotkey, tag: null, opens: { kind: 'working' } }
    }
    const tag: RowTag = isMissing ? { text: 'no commit', color: 'yellow' } : { text: '—', color: undefined }

    return { icon, iconColor, key: undefined, label: `${number}${title} `, hotkey: undefined, tag, opens: null }
  }
  const key = `c-${todo.id}-${latest}`
  const opens: RowOpens = { kind: 'commit', hash: latest }
  if (isDropped) {
    return { icon, iconColor, key, label: `${prefix}${title} `, hotkey, tag: { text: 'dropped', color: 'red' }, opens }
  }

  return { icon, iconColor, key, label: `${prefix}${title} ${latest.slice(0, 7)}`, hotkey, tag: null, opens }
}

/** The progress bar: filled and empty cells (at most 10 in all), and the done count out of the total. */
export function progressBar(list: Todo[]): { filled: number; empty: number; done: number; total: number } {
  const done = list.filter(todo => todo.status === 'completed').length
  const total = list.length
  const length = Math.min(10, Math.max(total, 1))
  const filled = total === 0 ? 0 : Math.round((done / total) * length)

  return { filled, empty: length - filled, done, total }
}

/** The earlier commits to list (linked ones hidden), the total to show, and how many are not listed. */
export function earlierSummary(
  before: Earlier | null,
  list: Todo[],
): { commits: EarlierCommit[]; total: number; more: number } {
  const linked = new Set(list.flatMap(todo => todo.commits))
  const commits = before?.commits.filter(c => !linked.has(c.hash)) ?? []
  const total = before === null ? 0 : before.total - (before.commits.length - commits.length)

  return { commits, total, more: total - commits.length }
}

/** The icon, color and text of the one-line tool row. */
export function toolRowLine(input: ToolInput, list: Todo[]): { icon: string; color: 'yellow' | 'green' | undefined; text: string } {
  const { action, titles, number } = input
  const todo = typeof number === 'number' ? list[number - 1] : undefined
  const names = Array.isArray(titles) ? titles.filter((t): t is string => typeof t === 'string') : []
  const hash = todo?.commits.at(-1)?.slice(0, 7)

  if (action === 'add') {
    return { icon: '☐', color: undefined, text: names.length === 1 ? `Added: ${names[0]}` : `Added ${names.length} todos: ${names[0] ?? ''}…` }
  }
  if (action === 'start') {
    return { icon: '▸', color: 'yellow', text: `Started ${String(number)}: ${todo?.title ?? ''}` }
  }
  if (action === 'done') {
    return { icon: '✔', color: 'green', text: `Done ${String(number)}: ${todo?.title ?? ''}${hash === undefined ? '' : ` · ${hash}`}` }
  }

  return { icon: '⊘', color: undefined, text: 'Cleared the todos' }
}
