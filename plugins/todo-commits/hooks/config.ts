export const TODO_PANE = 'todo-commits'
export const MAX_NEW_COMMITS = 50
/** How many of the branch's earlier commits the panel lists. */
export const MAX_EARLIER = 20
export const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
export const SPIN_MS = 125
/** New files shown in the uncommitted view, at most. */
export const MAX_UNTRACKED = 20
export const TIPS: [string, string][] = [
  ['"plan the changes for …"', 'Claude adds the steps here'],
  ['"add a todo: …"', 'Claude adds one item'],
  ['"go"', 'starts from the first one'],
  ['/todos add …', 'adds one yourself, no Claude'],
  ['/todos clear', 'empties this branch\'s list'],
]

export const TOOL_NAME = 'todos'
export const TOOL = `mcp__todo-commits__${TOOL_NAME}`

export const COMMIT_RULE = [
  `The user has a todo panel open. It only shows todos made with the ${TOOL} tool, so follow these rules:`,
  `- When you propose a plan with two or more steps, add every step right away with ${TOOL} (action "add"), before you ask the user to go ahead. If an old list from an earlier plan is there, "clear" it first.`,
  `- When the user asks to add a todo, add it with ${TOOL} (action "add") at the end of the list.`,
  "- Don't start the work until the user says to go ahead.",
  `- Then work through the todos in order. For each one: ${TOOL} "start" with its number, do the work, make one git commit with only that todo's changes, then ${TOOL} "done" with its number.`,
  '- Write a short commit message that says what the todo did.',
  "- Split the work into todos the way you normally would. Don't make extra todos just to get more commits.",
].join('\n')
