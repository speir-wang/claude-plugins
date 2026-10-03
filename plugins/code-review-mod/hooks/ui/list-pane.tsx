import type { Review } from '../../types'

import { TIPS } from '../config'
import { groupFindings } from '../order'
import type { Section } from '../order'
import { roundSummaries } from '../recheck'
import { counts, nextStep } from '../review'
import type { Parts } from './parts'
import { findingLabel, outcomeTag, statusTag } from './rows'

/** What the list pane shows. */
export type ListData = {
  review: Review | null
  /** The PR of a review waiting for "replace or keep", when there is one. */
  asking: string | null
  /** The last thing that went wrong or happened, shown once; '' for none. */
  notice: string
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
  next: (step: 'approve' | 'create') => void | Promise<void>
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
  const { review, asking, notice, columns } = data
  if (review === null) {
    return <Text dimColor>No review yet. Run the code-review skill.</Text>
  }
  const { open, pending, done } = counts(review)
  const shown = blocks(review)
  // The first nine rows, in the order shown, open with their digit.
  const order = shown.flatMap(block => block.sections.flatMap(section => section.rows.map(row => row.finding.n)))
  const rounds = roundSummaries(review)
  const step = nextStep(review)

  return (
    <Box flexDirection="column">
      <Box flexDirection="row" justifyContent="space-between">
        <Box flexDirection="row">
          <Text color="cyan">{review.pr}  </Text>
          <Box key="mode-box">
            <Button key="mode" label={`${review.mode === 'mine' ? 'your PR' : 'their PR'} ⇄`} plain hover={{ color: 'cyan' }} onPress={actions.flipMode} />
          </Box>
          <Text>  </Text>
          <Text dimColor>
            {open} open · {pending} pending · {done} done
          </Text>
        </Box>
        <Button key="recheck" label="Re-check" onPress={actions.recheck} />
      </Box>
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
                {section.note !== null && <Text dimColor>  {section.note}</Text>}
              </Box>
              {section.rows.map(({ finding, isGrey }) => {
                const tags = [statusTag(finding.status), outcomeTag(finding)].filter(tag => tag !== null)
                // The tags sit after the title, so the title gives up their width.
                const width = columns - 3 - tags.reduce((sum, tag) => sum + tag.text.length + 2, 0)
                const place = order.indexOf(finding.n)

                return (
                  <Box key={`row-${finding.n}`} flexDirection="row">
                    <Button
                      key={`f-${finding.n}`}
                      label={findingLabel(finding, width)}
                      plain
                      dimColor={isGrey}
                      hotkey={place < 9 ? String(place + 1) : undefined}
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
