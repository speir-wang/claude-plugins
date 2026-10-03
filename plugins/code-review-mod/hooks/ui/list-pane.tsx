import type { Review } from '../../types'

import { TIPS } from '../config'
import { groupFindings } from '../order'
import { counts } from '../review'
import type { Parts } from './parts'
import { findingLabel } from './rows'

/** What the list pane shows. */
export type ListData = {
  review: Review | null
  columns: number
}

/** What the buttons in the list pane do. */
export type ListActions = {
  open: (n: number) => void | Promise<void>
  flipMode: () => void | Promise<void>
}

/** Draws the review: the Standards and Spec sections, each sorted by score. */
export function drawListPane({ Box, Text, Button }: Parts, data: ListData, actions: ListActions) {
  const { review, columns } = data
  if (review === null) {
    return <Text dimColor>No review yet. Run the code-review skill.</Text>
  }
  const sections = groupFindings(review.findings, review.skipped)
  const { open, pending, done } = counts(review)
  // The first nine rows, in the order shown, open with their digit.
  const order = sections.flatMap(section => section.rows.map(row => row.finding.n))

  return (
    <Box flexDirection="column">
      <Box flexDirection="row" marginBottom={1}>
        <Text color="cyan">{review.pr}  </Text>
        <Box key="mode-box">
          <Button key="mode" label={`${review.mode === 'mine' ? 'your PR' : 'their PR'} ⇄`} plain hover={{ color: 'cyan' }} onPress={actions.flipMode} />
        </Box>
        <Text>  </Text>
        <Text dimColor>
          {open} open · {pending} pending · {done} done
        </Text>
      </Box>
      {sections.map(section => (
        <Box key={`s-${section.group}`} flexDirection="column" marginBottom={1}>
          <Box flexDirection="row">
            <Text bold>{section.label}</Text>
            {section.note !== null && <Text dimColor>  {section.note}</Text>}
          </Box>
          {section.rows.map(({ finding, isGrey }) => (
            <Box key={`row-${finding.n}`}>
              <Button
                key={`f-${finding.n}`}
                label={findingLabel(finding, columns)}
                plain
                dimColor={isGrey}
                hotkey={order.indexOf(finding.n) < 9 ? String(order.indexOf(finding.n) + 1) : undefined}
                hover={{ color: 'cyan' }}
                onPress={() => actions.open(finding.n)}
              />
            </Box>
          ))}
        </Box>
      ))}
      <Text dimColor>{TIPS[review.mode]}</Text>
    </Box>
  )
}
