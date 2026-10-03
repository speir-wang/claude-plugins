import type { CommitFile, CommitView, DiffPiece } from '../../types'

import type { Parts } from './parts'

/** What the buttons in the commit pane do. */
export type CommitActions = {
  back: () => void | Promise<void>
  toggle: (hash: string, path: string) => void | Promise<void>
}

/** Draws a commit, or the uncommitted changes. */
export function drawCommitPane({ Box, Text, Button, Code }: Parts, view: CommitView, actions: CommitActions) {
  const added = view.files.reduce((sum, file) => sum + file.added, 0)
  const removed = view.files.reduce((sum, file) => sum + file.removed, 0)

  const drawPiece = (file: CommitFile, piece: DiffPiece, i: number) =>
    piece.kind === 'diff' ? (
      <Code key={`d-${file.path}-${i}`} source={piece.text} path={file.path} format="diff" />
    ) : (
      <Box key={`p-${file.path}-${i}`} flexDirection="column">
        {piece.text.split('\n').map((line, j) => (
          <Text
            key={`l-${file.path}-${i}-${j}`}
            wrap="truncate-end"
            color={line.startsWith('+') ? 'green' : line.startsWith('-') ? 'red' : undefined}
            dimColor={line.startsWith('@@')}
          >
            {line === '' ? ' ' : line}
          </Text>
        ))}
      </Box>
    )

  return (
    <Box flexDirection="column">
      <Box flexDirection="row" justifyContent="space-between">
        <Box key="summary">
          <Text bold color="yellow">
            {view.kind === 'working' ? 'Uncommitted' : view.hash.slice(0, 7)}
          </Text>
          <Text dimColor>
            {' '}· {view.files.length} {view.files.length === 1 ? 'file' : 'files'} ·{' '}
          </Text>
          <Text color="green">+{added}</Text>
          <Text> </Text>
          <Text color="red">−{removed}</Text>
        </Box>
        <Button key="back" label="← Back to todos" onPress={actions.back} />
      </Box>
      <Box marginY={1}>
        <Text>{view.message}</Text>
      </Box>
      {view.files.map(file => (
        <Box key={`f-${file.path}`} flexDirection="column" marginBottom={1}>
          <Box flexDirection="row">
            <Text bold>{file.path}</Text>
            <Text color="green"> +{file.added}</Text>
            <Text color="red"> −{file.removed}</Text>
          </Box>
          {file.isLarge && (
            <Box flexDirection="column">
              {file.verdict !== undefined ? (
                <Text color={file.verdict.isWorth ? 'cyan' : 'yellow'}>
                  {file.verdict.isWorth ? 'Worth a look: ' : 'Probably skip: '}
                  {file.verdict.reason}
                </Text>
              ) : (
                <Text dimColor>
                  Large diff ({file.added + file.removed} lines changed).
                  {view.isChecking ? ' Checking whether it is worth reading…' : ''}
                </Text>
              )}
              <Button
                key={`t-${file.path}`}
                label={file.isOpen ? 'Hide diff' : 'Show diff'}
                onPress={() => actions.toggle(view.hash, file.path)}
              />
            </Box>
          )}
          {file.isOpen && file.pieces.length === 0 && (
            <Text dimColor>(no text changes: binary, renamed or mode change)</Text>
          )}
          {file.isOpen && file.pieces.map((piece, i) => drawPiece(file, piece, i))}
          {file.isOpen && file.cutLines > 0 && (
            <Text dimColor>
              {file.cutLines} more lines not shown. Run:{' '}
              {view.kind === 'working' ? 'git diff HEAD' : `git show ${view.hash.slice(0, 7)}`} -- {file.path}
            </Text>
          )}
        </Box>
      ))}
    </Box>
  )
}
