import type { Review, ReviewEvent } from '../../types'

import { draftBody } from '../draft'
import { REQUEST_CHANGES_BODY } from '../github'
import type { Parts } from './parts'

/** What the buttons in the confirm step do. */
export type SubmitActions = {
  pick: (event: ReviewEvent) => void | Promise<void>
  post: () => void | Promise<void>
  cancel: () => void | Promise<void>
}

const EVENTS: [ReviewEvent, string][] = [
  ['COMMENT', 'Comment'],
  ['REQUEST_CHANGES', 'Request changes'],
  ['APPROVE', 'Approve'],
]

/** The confirm step before posting: how to post, and exactly what goes up. */
export function drawSubmitPane({ Box, Text, Button }: Parts, review: Review, event: ReviewEvent, notice: string, actions: SubmitActions) {
  const pending = review.findings.filter(f => f.status === 'pending')

  return (
    <Box flexDirection="column">
      <Text bold>
        Post {pending.length} {pending.length === 1 ? 'comment' : 'comments'} to {review.pr} as one review?
      </Text>
      <Box flexDirection="row" columnGap={2} marginY={1}>
        {EVENTS.map(([value, label]) => (
          <Box key={`event-box-${value}`}>
            <Button key={`event-${value}`} label={`${value === event ? '●' : '○'} ${label}`} plain hover={{ color: 'cyan' }} onPress={() => actions.pick(value)} />
          </Box>
        ))}
      </Box>
      {event === 'REQUEST_CHANGES' && <Text dimColor>Review text: {REQUEST_CHANGES_BODY}</Text>}
      {pending.map(f => (
        <Box key={`c-${f.n}`} flexDirection="column" marginTop={1}>
          <Text color="cyan">
            {f.file}:{f.line}
          </Text>
          <Text>{draftBody(f.draft ?? { text: '', hasCode: true }, f.suggested)}</Text>
        </Box>
      ))}
      {notice !== '' && (
        <Box marginTop={1}>
          <Text color="red">{notice}</Text>
        </Box>
      )}
      <Box flexDirection="row" columnGap={1} marginTop={1}>
        <Button key="post" label="Post review" variant="primary" onPress={actions.post} />
        <Button key="cancel" label="Cancel" onPress={actions.cancel} />
      </Box>
    </Box>
  )
}
