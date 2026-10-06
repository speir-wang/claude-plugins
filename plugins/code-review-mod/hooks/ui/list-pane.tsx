import type { Review } from '../../types'

import { TIPS } from '../config'
import { groupFindings } from '../order'
import type { Section } from '../order'
import { roundSummaries } from '../recheck'
import { counts, nextStep } from '../review'
import type { Parts } from './parts'
import { findingLabel, outcomeTag, replyTag, statusTag } from './rows'

/** What the list pane shows. */
export type ListData = {
  review: Review | null
  /** The PR of a review waiting for "replace or keep", when there is one. */
  asking: string | null
  /** The last thing that went wrong or happened, shown once; '' for none. */
  notice: string
  /** The review is still running: empty groups wait, and no next step is offered. */
  isReviewing: boolean
  columns: number
}

/** What the buttons in the list pane do. */
export type ListActions = {
  open: (n: number) => void | Promise<void>
  flipMode: () => void | Promise<void>
  submit: () => void | Promise<void>
  replace: () => void | Promise<void>
  keep: () => void | Promise<void>
  recheck: () => void | Promise<void>
  next: (step: 'approve' | 'create' | 'fix') => void | Promise<void>
}

/** One block of sections: the first round, then one per re-check that found new problems. */
type Block = { title: string | null; round: number; sections: Section[] }

/** The first round's sections, then "New in round N" for each later round. */
function blocks(review: Review): Block[] {
  return review.rounds.map(({ n }) => ({
    title: n === 1 ? null : `New in round ${n}`,
    round: n,
    sections: groupFindings(
      review.findings.filter(f => f.round === n),
      review.skipped.filter(s => s.round === n),
    ),
  }))
}

/** Draws the review: rounds, then the Standards and Spec sections, each sorted by score. */
export function drawListPane({ Box, Text, Button }: Parts, data: ListData, actions: ListActions) {
  const { review, asking, notice, isReviewing, columns } = data
  if (review === null) {
    return <Text dimColor>No review yet. Run the code-review skill.</Text>
  }
  const { open, pending, done } = counts(review)
  const queued = review.findings.filter(f => f.status === 'queued').length
  const shown = blocks(review)
  // Every number gets the same width, so the rows line up.
  const numberWidth = `#${review.findings.reduce((max, f) => Math.max(max, f.n), 0)}`.length + 1
  const rounds = roundSummaries(review)
  const step = isReviewing ? null : nextStep(review)

  return (
    <Box flexDirection="column">
      <Box flexDirection="row">
        <Text color="cyan" wrap="truncate-end">
          {review.pr}{'  '}
        </Text>
        <Box key="mode-box">
          <Button key="mode" label={`${review.mode === 'mine' ? 'your PR' : 'their PR'} ⇄`} plain hover={{ color: 'cyan' }} onPress={actions.flipMode} />
        </Box>
      </Box>
      <Box flexDirection="row" justifyContent="space-between">
        <Text dimColor>
          {open} open · {pending} pending · {done} done
        </Text>
        <Button key="recheck" label="Re-check" onPress={actions.recheck} />
      </Box>
      {isReviewing && <Text color="yellow">Reviewing… findings show here as Claude records them.</Text>}
      {rounds.length > 1 && (
        <Box flexDirection="row" columnGap={3}>
          {rounds.map(r => (
            <Text key={`round-${r.n}`} dimColor>
              {r.n === 1 ? `Round 1 · ${r.found} found` : `Round ${r.n} · ✅ ${r.addressed}  ⚠️ ${r.wrong}  ❌ ${r.missed} · ${r.found} new`}
            </Text>
          ))}
        </Box>
      )}
      <Box marginBottom={1} />
      {asking !== null && (
        <Box key="ask-box" flexDirection="column" marginBottom={1} borderStyle="round" borderColor="yellow" paddingX={1}>
          <Text color="yellow">
            Replace the review of {review.pr} with {asking}?
          </Text>
          <Box flexDirection="row" columnGap={1}>
            <Button key="replace" label="Replace" variant="primary" onPress={actions.replace} />
            <Button key="keep" label={`Keep ${review.pr}`} onPress={actions.keep} />
          </Box>
        </Box>
      )}
      {review.mode === 'mine' && queued > 0 && (
        <Box key="fixall-box" marginBottom={1}>
          <Button key="fixall" label={`${queued} queued · Fix all`} variant="primary" onPress={() => actions.next('fix')} />
        </Box>
      )}
      {review.mode === 'theirs' && pending > 0 && (
        <Box key="submit-box" marginBottom={1}>
          <Button key="submit" label={`${pending} pending · Submit review`} variant="primary" onPress={actions.submit} />
        </Box>
      )}
      {shown.map(block => (
        <Box key={`b-${block.round}`} flexDirection="column">
          {block.title !== null && (
            <Text bold color="yellow">
              {block.title}
            </Text>
          )}
          {block.sections.map(section => (
            <Box key={`s-${block.round}-${section.group}`} flexDirection="column" marginBottom={1}>
              <Box flexDirection="row">
                <Text bold>{section.label}</Text>
                {section.note !== null && <Text dimColor>  {isReviewing && section.rows.length === 0 && !section.isSkipped ? 'reviewing…' : section.note}</Text>}
              </Box>
              {section.rows.map(({ finding, isGrey }) => {
                const tags = [statusTag(finding.status), replyTag(finding), outcomeTag(finding)].filter(tag => tag !== null)
                // The tags sit after the title, so the title gives up their width.
                const width = columns - numberWidth - tags.reduce((sum, tag) => sum + tag.text.length + 2, 0)

                return (
                  <Box key={`row-${finding.n}`} flexDirection="row">
                    <Button
                      key={`f-${finding.n}`}
                      label={`${`#${finding.n}`.padEnd(numberWidth)}${findingLabel(finding, width)}`}
                      plain
                      dimColor={isGrey}
                      hover={{ color: 'cyan' }}
                      onPress={() => actions.open(finding.n)}
                    />
                    {tags.map(tag => (
                      <Text key={`t-${finding.n}-${tag.text}`} color={tag.color} dimColor={tag.color === undefined}>
                        {'  '}
                        {tag.text}
                      </Text>
                    ))}
                  </Box>
                )
              })}
            </Box>
          ))}
        </Box>
      ))}
      {step !== null && (
        <Box key="next-box" flexDirection="row" marginBottom={1}>
          <Text color="green">Nothing left to do.  </Text>
          <Button key="next" label={step === 'approve' ? 'Approve PR' : 'Create PR'} variant="primary" onPress={() => actions.next(step)} />
        </Box>
      )}
      {notice !== '' && (
        <Box marginBottom={1}>
          <Text color="yellow">{notice}</Text>
        </Box>
      )}
      <Text dimColor>{TIPS[review.mode]}</Text>
    </Box>
  )
}
