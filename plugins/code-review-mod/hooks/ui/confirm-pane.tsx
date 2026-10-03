import type { Parts } from './parts'

/** What the buttons in the confirm step do. */
export type ConfirmActions = {
  confirm: () => void | Promise<void>
  cancel: () => void | Promise<void>
}

const QUESTIONS = {
  approve: (pr: string, _count: number) => `Approve ${pr} on GitHub?`,
  create: (pr: string, _count: number) => `Create a PR for ${pr}? Claude pushes the branch and writes the title and description.`,
  fix: (_pr: string, count: number) => `Fix the ${count} ${count === 1 ? 'finding' : 'findings'} on the fix list now, in one commit?`,
}

const LABELS = { approve: 'Approve', create: 'Create PR', fix: 'Fix all' }

/** Asks before a step that changes code or GitHub: fixing the list, approving their PR, or creating yours. */
export function drawConfirmPane({ Box, Text, Button }: Parts, step: 'approve' | 'create' | 'fix', pr: string, count: number, actions: ConfirmActions) {
  const question = QUESTIONS[step](pr, count)

  return (
    <Box flexDirection="column">
      <Text bold>{question}</Text>
      <Box flexDirection="row" columnGap={1} marginTop={1}>
        <Button key="confirm" label={LABELS[step]} variant="primary" onPress={actions.confirm} />
        <Button key="cancel" label="Cancel" onPress={actions.cancel} />
      </Box>
    </Box>
  )
}
