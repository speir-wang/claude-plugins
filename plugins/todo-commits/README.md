# todo-commits

A todo panel for Claude Code. Claude adds its plan as todos, works through them one by one, and makes one git commit per todo. Each todo links to its commit: click it to see the commit message and diff.

```
🌿 feature/menu  ▰▰▰▱▱ 3/5
✔ 1: Remove dead JS code              0fb2315
✔ 2: Simplify headerScroll…           5f41d94
⚠ 3: Tidy cf7-crm                     no commit
⠹ 4: Share one accordion helper       —
☐ 5: Simplify menu.js                 —

▸ Earlier on this branch · 12 commits
Tip: "add a todo: …" · "go" to start · /todos add … · /todos clear
```

## Install

```
/plugin marketplace add speir-wang/claude-plugins
/plugin install todo-commits@he-wang
```

Restart Claude Code after installing.

## Use it

1. Open a repo and type `/todos`. The panel opens beside the conversation.
2. Ask for a plan: *"plan the changes for …"*. Claude adds each step as a todo, marked not started.
3. Say *"go"*. Claude works through the todos in order and commits after each one.
4. Click a todo (or press its number, 1–9) to see its commit. Click the todo in progress to see the changes not committed yet. *← Back to todos* or Esc returns to the list.

While the panel is open, Claude is told to commit after each todo. Close the panel and it goes back to committing only when you ask.

## Commands

| Command | What it does |
|---|---|
| `/todos` | Opens the panel, or closes it if it is open |
| `/todos add <text>` | Adds a todo yourself, without Claude. The title is tidied into a short task |
| `/todos clear` | Empties this branch's list |

## What the icons mean

| Icon | Meaning |
|---|---|
| `☐` | Not started |
| spinner | In progress |
| `✔` | Done, with its commit |
| `⚠ no commit` | Marked done, but no commit was made |
| `dropped` | The commit is no longer on the branch (reset or rebase) |

## Good to know

- **One list per repo and branch.** It is saved, so it survives restarts. Switching branch switches the list.
- **Earlier on this branch** lists the branch's commits since it split from `main`, so older work is one click away.
- **Large diffs** (over 300 changed lines in a file) start folded. A small model (Haiku) says in one line whether the diff is worth reading, for example *"Probably skip: generated snapshot output"*. Click *Show diff* to open it anyway.
- **Haiku** is also used to tidy `/todos add` titles. If your account can't use Haiku, both fall back quietly: your words stay as the title, and large files show no verdict.
- **Panel width:** a panel that opens by itself (when Claude adds a todo) only shows when the terminal is at least 144 columns wide. `/todos` opens it at any width.
- Claude's todo calls show as one line each in the conversation, like `▸ Started 3: …`.

## Requirements

- Claude Code 2.1.287 or newer. The plugin uses function hooks, which Claude Code marks as early access.
- `git` on your PATH.

## Develop

```
claude --plugin-dir ./plugins/todo-commits   # load from this folder
claude plugin test ./plugins/todo-commits    # run the tests
claude plugin validate ./plugins/todo-commits
```
