import type { Review } from '../../types'

import type { Parts } from './parts'

/** Draws the review: one row per finding. */
export function drawListPane({ Box, Text }: Parts, review: Review | null) {
  if (review === null) {
    return <Text dimColor>No review yet. Run the code-review skill.</Text>
  }

  return (
    <Box flexDirection="column">
      {review.findings.map(f => (
        <Text key={`f-${f.n}`}>{f.title}</Text>
      ))}
    </Box>
  )
}
