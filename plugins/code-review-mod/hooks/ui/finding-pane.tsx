import type { Finding, Mode, View } from '../../types'

import { KEYS } from '../config'
import { draftBody } from '../draft'

import type { Parts } from './parts'
import { findingLabel } from './rows'

/** What the buttons in the finding pane do. */
export type FindingActions = {
  back: () => void | Promise<void>
  fix: () => void | Promise<void>
  wontFix: () => void | Promise<void>
  ask: () => void | Promise<void>
  drop: () => void | Promise<void>
  togglePending: () => void | Promise<void>
  edit: () => void | Promise<void>
  saveEdit: (text: string) => void | Promise<void>
  rewrite: () => void | Promise<void>
  sendRewrite: (note: string) => void | Promise<void>
}

/** What the finding pane shows besides the finding. */
export type FindingData = {
  finding: Finding
  mode: Mode
  view: Extract<View, { kind: 'finding' }>
  notice: string
  columns: number
}

/** The suggested change as a diff: the code now as removed lines, the suggestion as added ones. */
export function suggestionDiff(finding: Finding): string {
  const now = finding.now.split('\n')
  const suggested = finding.suggested.split('\n')
  const header = `@@ -${finding.line},${now.length} +${finding.line},${suggested.length} @@`

  return [header, ...now.map(l => `-${l}`), ...suggested.map(l => `+${l}`)].join('\n')
}

/** Draws one finding: the code now, the suggested code, then why it matters. */
export function drawFindingPane(parts: Parts, data: FindingData, actions: FindingActions) {
  const { Box, Text, Button, Code } = parts
  // Mobile has no text field: Edit and Rewrite show nothing there.
  const Input = 'Input' in parts ? parts.Input : undefined
  const { finding, mode, view, notice, columns } = data
  const draft = finding.draft ?? { text: '', hasCode: finding.suggested.trim() !== '' }
  const hasCode = draft.hasCode && finding.suggested.trim() !== ''

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

      {mode === 'theirs' && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold>Comment for the author</Text>
          <Box flexDirection="column" borderStyle="round" borderDimColor paddingX={1}>
            {draft.text === '' ? <Text dimColor>No draft yet. Press Rewrite and say what to write.</Text> : <Text>{draft.text}</Text>}
            {hasCode && <Code source={finding.suggested} path={finding.file} />}
          </Box>
          {view.input === 'edit' && Input !== undefined && (
            <Input key="edit-input" label="Edit: " value={draft.text} submitLabel="save" autoFocus onSubmit={actions.saveEdit} />
          )}
          {view.input === 'rewrite' && Input !== undefined && (
            <Input key="rewrite-input" label="Rewrite: " placeholder="softer, drop the code, …" submitLabel="rewrite" autoFocus onSubmit={actions.sendRewrite} />
          )}
          {view.isRewriting === true && <Text dimColor>Rewriting…</Text>}
          <Box flexDirection="row" columnGap={1} marginTop={1}>
            <Button
              key="pending"
              label={finding.status === 'pending' ? 'Remove from review' : 'Add to review'}
              variant="primary"
              hotkey="p"
              onPress={actions.togglePending}
            />
            <Button key="drop" label="Drop" hotkey="d" onPress={actions.drop} />
            <Button key="edit" label="Edit" hotkey="e" onPress={actions.edit} />
            <Button key="rewrite" label="Rewrite" hotkey="r" onPress={actions.rewrite} />
          </Box>
        </Box>
      )}

      {notice !== '' && <Text color="yellow">{notice}</Text>}

      {mode === 'mine' && (
        <Box flexDirection="row" columnGap={1} marginTop={1}>
          <Button key="fix" label="Fix it" variant="primary" hotkey="f" onPress={actions.fix} />
          <Button key="wontfix" label="Won't fix" hotkey="w" onPress={actions.wontFix} />
          <Button key="ask" label="Ask Claude" hotkey="a" onPress={actions.ask} />
        </Box>
      )}

      <Box marginTop={1}>
        <Text dimColor>{mode === 'mine' ? KEYS.mine : KEYS.theirs}</Text>
      </Box>
    </Box>
  )
}
