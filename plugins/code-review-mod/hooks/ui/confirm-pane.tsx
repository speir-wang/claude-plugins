import type { Parts } from './parts'

/** What the buttons in the confirm step do. */
export type ConfirmActions = {
  confirm: () => void | Promise<void>
  cancel: () => void | Promise<void>
}

/** Asks before a public step on GitHub: approving their PR, or creating yours. */
export function drawConfirmPane({ Box, Text, Button }: Parts, step: 'approve' | 'create', pr: string, actions: ConfirmActions) {
  const question = step === 'approve' ? `Approve ${pr} on GitHub?` : `Create a PR for ${pr}? Claude pushes the branch and writes the title and description.`

  return (
    <Box flexDirection="column">
      <Text bold>{question}</Text>
      <Box flexDirection="row" columnGap={1} marginTop={1}>
        <Button key="confirm" label={step === 'approve' ? 'Approve' : 'Create PR'} variant="primary" onPress={actions.confirm} />
        <Button key="cancel" label="Cancel" onPress={actions.cancel} />
      </Box>
    </Box>
  )
}
