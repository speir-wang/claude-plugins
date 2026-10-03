import type { Parts } from './parts'
import type { toolRowLine } from './rows'

/** Draws the todo tool's call as one line. */
export function drawToolRow({ Box, Text }: Parts, line: ReturnType<typeof toolRowLine>) {
  return (
    <Box flexDirection="row">
      <Text color={line.color}>{line.icon} </Text>
      <Text dimColor wrap="truncate-end">
        {line.text}
      </Text>
    </Box>
  )
}

/** Draws nothing for the tool's result: the pane shows the list itself. */
export function drawEmptyResult({ Box }: Parts) {
  return <Box />
}
