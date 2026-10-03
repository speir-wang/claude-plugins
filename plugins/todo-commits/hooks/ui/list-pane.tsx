import type { Earlier, Place, Todo } from '../../types'

import { TIPS } from '../config'
import type { Parts } from './parts'
import { earlierSummary, fit, progressBar, rowLook } from './rows'

/** What the list pane shows. */
export type ListData = {
  list: Todo[]
  here: Place | null
  before: Earlier | null
  /** The spinner frame for a todo in progress. */
  spin: string
  columns: number
  isEarlierOpen: boolean
  /** Linked commits that are no longer on the branch. */
  gone: Set<string>
}

/** What the buttons in the list pane do. */
export type ListActions = {
  showCommit: (hash: string) => void | Promise<void>
  showWorking: () => void | Promise<void>
  toggleEarlier: () => void | Promise<void>
}

/** Draws the todo list: branch, progress, rows, the earlier section and the tip. */
export function drawListPane({ Box, Text, Button }: Parts, data: ListData, actions: ListActions) {
  const { list, here, before, spin, columns, isEarlierOpen: isOpen, gone } = data
  // icon + space, "12: ", title, space, a 9-wide hash or tag slot
  const titleWidth = Math.max(8, columns - 2 - 4 - 1 - 9 - 1)
  const { filled, empty, done, total } = progressBar(list)
  const { commits: earlierCommits, total: earlierTotal, more } = earlierSummary(before, list)

  return (
    <Box flexDirection="column">
      <Box flexDirection="row" marginBottom={1}>
        {here !== null && <Text color="cyan">🌿 {here.branch}  </Text>}
        {list.length > 0 && (
          <Box flexDirection="row">
            <Text color="green">{'▰'.repeat(filled)}</Text>
            <Text dimColor>{'▱'.repeat(empty)}</Text>
            <Text bold> {done}/{total}</Text>
          </Box>
        )}
      </Box>

      {list.length === 0 && (
        <Box flexDirection="column">
          <Text dimColor>No todos yet. Try:</Text>
          {TIPS.map(([say, does]) => (
            <Box key={`tip-${say}`} flexDirection="row" paddingLeft={2}>
              <Text color="cyan">{fit(say, 26)}</Text>
              <Text dimColor>{does}</Text>
            </Box>
          ))}
        </Box>
      )}

      {list.map((todo, i) => {
        const look = rowLook(todo, i + 1, spin, gone.has(todo.commits.at(-1) ?? ''), titleWidth)
        const older = todo.commits.slice(0, -1)
        const opens = look.opens
        const button =
          opens === null ? null : (
            <Button
              key={look.key}
              label={look.label}
              plain
              hotkey={look.hotkey}
              hover={{ color: 'cyan' }}
              onPress={() => (opens.kind === 'working' ? actions.showWorking() : actions.showCommit(opens.hash))}
            />
          )

        return (
          <Box key={`todo-${todo.id}`} flexDirection="column">
            <Box key={`row-${todo.id}`} flexDirection="row">
              <Text color={look.iconColor} dimColor={todo.status === 'pending'} bold={todo.status === 'in_progress'}>
                {look.icon}{' '}
              </Text>
              {button === null ? (
                <Box flexDirection="row">
                  <Text dimColor>{look.label}</Text>
                  {look.tag?.color === undefined ? <Text dimColor>{look.tag?.text}</Text> : <Text color={look.tag.color}>{look.tag.text}</Text>}
                </Box>
              ) : look.tag === null ? (
                button
              ) : (
                <Box flexDirection="row">
                  {button}
                  <Text color={look.tag.color}>{look.tag.text}</Text>
                </Box>
              )}
            </Box>
            {older.length > 0 && (
              <Box flexDirection="row" columnGap={1} paddingLeft={6}>
                <Text dimColor>also</Text>
                {older.map(hash => (
                  <Box key={`c-row-${todo.id}-${hash}`}>
                    <Button
                      key={`c-${todo.id}-${hash}`}
                      label={hash.slice(0, 7)}
                      plain
                      hover={{ color: 'cyan' }}
                      onPress={() => actions.showCommit(hash)}
                    />
                  </Box>
                ))}
              </Box>
            )}
          </Box>
        )
      })}

      {earlierTotal > 0 && before !== null && (
        <Box flexDirection="column" marginTop={1}>
          <Box key="earlier-row">
            <Button
              key="earlier"
              label={`${isOpen ? '▾' : '▸'} Earlier on this branch · ${earlierTotal} ${earlierTotal === 1 ? 'commit' : 'commits'}`}
              plain
              dimColor
              hover={{ color: 'cyan' }}
              onPress={actions.toggleEarlier}
            />
          </Box>
          {isOpen &&
            earlierCommits.map(c => (
              <Box key={`e-row-${c.hash}`}>
                <Button
                  key={`e-${c.hash}`}
                  label={`  ${c.hash.slice(0, 7)}  ${fit(c.subject, Math.max(8, columns - 12))}`}
                  plain
                  hover={{ color: 'cyan' }}
                  onPress={() => actions.showCommit(c.hash)}
                />
              </Box>
            ))}
          {isOpen && more > 0 && (
            <Text dimColor>
              {'  '}and {more} more (since {before.base})
            </Text>
          )}
        </Box>
      )}
      {list.length > 0 && (
        <Box marginTop={1}>
          <Text dimColor>Tip: "add a todo: …" · "go" to start · /todos add … · /todos clear</Text>
        </Box>
      )}
    </Box>
  )
}
