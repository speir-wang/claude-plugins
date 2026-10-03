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
