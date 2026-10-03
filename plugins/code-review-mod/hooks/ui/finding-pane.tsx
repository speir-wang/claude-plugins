import type { Finding } from '../../types'

import type { Parts } from './parts'
import { findingLabel } from './rows'

/** What the buttons in the finding pane do. */
export type FindingActions = {
  back: () => void | Promise<void>
}

/** The suggested change as a diff: the code now as removed lines, the suggestion as added ones. */
export function suggestionDiff(finding: Finding): string {
  const now = finding.now.split('\n')
  const suggested = finding.suggested.split('\n')
  const header = `@@ -${finding.line},${now.length} +${finding.line},${suggested.length} @@`

  return [header, ...now.map(l => `-${l}`), ...suggested.map(l => `+${l}`)].join('\n')
}

/** Draws one finding: the code now, the suggested code, then why it matters. */
export function drawFindingPane({ Box, Text, Button, Code }: Parts, finding: Finding, columns: number, actions: FindingActions) {
  return (
    <Box flexDirection="column">
      <Box flexDirection="row" justifyContent="space-between">
        <Text bold>#{finding.n}</Text>
        <Button key="back" label="← Back" onPress={actions.back} />
      </Box>
      <Text bold>{findingLabel(finding, Math.max(20, columns))}</Text>

      <Box flexDirection="column" marginTop={1}>
        <Text bold>Now</Text>
        {finding.now.trim() === '' ? (
          <Text dimColor>No code given.</Text>
        ) : (
          <Code source={finding.now} path={finding.file} startLine={finding.line} />
        )}
      </Box>

      <Box flexDirection="column" marginTop={1}>
        <Text bold>Suggested</Text>
        {finding.suggested.trim() === '' ? (
          <Text dimColor>No code change suggested.</Text>
        ) : (
          <Code source={suggestionDiff(finding)} path={finding.file} format="diff" />
        )}
      </Box>

      <Box flexDirection="column" marginTop={1}>
        <Text bold>Why it matters</Text>
        <Text>{finding.why}</Text>
      </Box>
    </Box>
  )
}
