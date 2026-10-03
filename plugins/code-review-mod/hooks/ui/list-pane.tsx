import type { Review } from '../../types'

import { groupFindings } from '../order'
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
}

/** Draws the review: the Standards and Spec sections, each sorted by score. */
export function drawListPane({ Box, Text, Button }: Parts, data: ListData, actions: ListActions) {
  const { review, columns } = data
  if (review === null) {
    return <Text dimColor>No review yet. Run the code-review skill.</Text>
  }
  const sections = groupFindings(review.findings, review.skipped)
  // The first nine rows, in the order shown, open with their digit.
  const order = sections.flatMap(section => section.rows.map(row => row.finding.n))

  return (
    <Box flexDirection="column">
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
    </Box>
  )
}
