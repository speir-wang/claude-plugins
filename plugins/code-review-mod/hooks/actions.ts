import { flipMode } from './mode'
import type { Ports } from './ports'

type ViewPorts = Pick<Ports, 'view' | 'openPane'>

/** Shows one finding. Esc (or the panel's close mark) goes back, see the ui.close hook. */
export async function openFinding(p: ViewPorts, n: number) {
  await p.view.update(() => ({ kind: 'finding', n }))
  await p.openPane({ closeOnEscape: true })
}

/** Shows the list again. */
export async function backToList(p: ViewPorts) {
  await p.view.update(() => ({ kind: 'list' }))
  await p.openPane()
}

/** Flips the review between your PR and their PR. */
export async function switchMode(p: Pick<Ports, 'review'>) {
  await p.review.update(review => (review === null ? review : { ...review, mode: flipMode(review.mode) }))
}
