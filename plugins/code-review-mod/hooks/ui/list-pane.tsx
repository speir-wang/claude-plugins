import type { Review } from '../../types'

import { groupFindings } from '../order'
import type { Parts } from './parts'
import { findingLabel } from './rows'

/** What the list pane shows. */
export type ListData = {
  review: Review | null
  columns: number
}

/** Draws the review: the Standards and Spec sections, each sorted by score. */
export function drawListPane({ Box, Text }: Parts, data: ListData) {
  const { review, columns } = data
  if (review === null) {
    return <Text dimColor>No review yet. Run the code-review skill.</Text>
  }
  const sections = groupFindings(review.findings, review.skipped)

  return (
    <Box flexDirection="column">
      {sections.map(section => (
        <Box key={`s-${section.group}`} flexDirection="column" marginBottom={1}>
          <Box flexDirection="row">
            <Text bold>{section.label}</Text>
            {section.note !== null && <Text dimColor>  {section.note}</Text>}
          </Box>
          {section.rows.map(({ finding, isGrey }) => (
            <Text key={`f-${finding.n}`} dimColor={isGrey} color={finding.weight === 'must' && !isGrey ? 'red' : undefined}>
              {findingLabel(finding, columns)}
            </Text>
          ))}
        </Box>
      ))}
    </Box>
  )
}
