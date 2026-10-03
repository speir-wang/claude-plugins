import type { CommitView } from '../types'

import { splitDiff } from './diff'
import { readCommit, readWorking } from './git'
import { judgeLargeFiles } from './model'
import type { Ports } from './state'

/** Shows a diff in the pane, folding large files and asking the model about them. */
async function presentView(p: Ports, view: CommitView, title: string) {
  await p.commit.update(() => view)
  // Same pane as the list: Esc (or the pane's close mark) goes back, see the ui.close hook.
  await p.openPane({ title, closeOnEscape: true })

  if (view.isChecking) {
    const verdicts = await judgeLargeFiles(p, view.message, view.files)
    await p.commit.update(current =>
      current?.hash !== view.hash
        ? current
        : {
            ...current,
            isChecking: false,
            files: current.files.map(file => {
              const verdict = verdicts.get(file.path)
              return verdict === undefined ? file : { ...file, verdict }
            }),
          },
    )
  }
}

/** Shows one commit's message and diff. */
export async function showCommit(p: Ports, hash: string) {
  const { message, diff } = await readCommit(p, hash)
  const files = message === undefined || diff === undefined ? [] : splitDiff(diff)
  const view: CommitView = {
    hash,
    kind: 'commit',
    message: message ?? 'This commit could not be read here. It may have been dropped and cleaned up by git.',
    files,
    isChecking: files.some(file => file.isLarge),
  }
  await presentView(p, view, `Commit ${hash.slice(0, 7)}`)
}

/** Shows what is changed but not committed: tracked changes, then new files. */
export async function showWorking(p: Ports) {
  const { diff, extra } = await readWorking(p)
  const files = splitDiff(diff)
  const view: CommitView = {
    hash: 'working',
    kind: 'working',
    message:
      'Not committed yet: the changes for the todo in progress.' +
      (extra > 0 ? ` ${extra} more new files not shown.` : ''),
    files,
    isChecking: files.some(file => file.isLarge),
  }
  await presentView(p, view, 'Uncommitted')
}

/** Folds or unfolds one file of the view that is showing. */
export async function toggleFile(p: Ports, hash: string, path: string) {
  await p.commit.update(current =>
    current?.hash !== hash
      ? current
      : {
          ...current,
          files: current.files.map(file => (file.path === path ? { ...file, isOpen: !file.isOpen } : file)),
        },
  )
}

/** Leaves the commit view and shows the list again. */
export async function backToList(p: Ports) {
  await p.commit.update(() => null)
  await p.openPane({ title: 'Todos' })
}
