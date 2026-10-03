# code-review-mod

A review panel for the `mattpocock-skills:code-review` skill. The findings land in the panel, not in one long chat message. Each one has a score, the code as it is now, the suggested code, and why it matters.

```
feature  your PR ⇄
2 open · 1 pending · 1 done                       [ Re-check ]

Standards
#1  9/10 must fix api.ts:40   Retry loop never stops  fixing
#2  4/10          app.ts:12   Name the magic number
#3  2/10          app.ts:30   Trailing comma  won't fix
Spec
#4  8/10 must fix cart.ts:7   Discount ignores the cap

Tip: "fix 3" or press a row · "re-check" after fixing · one review per session
```

## Install

```
/plugin marketplace add speir-wang/claude-plugins
/plugin install code-review-mod@he-wang
```

Restart Claude Code after installing. It works on top of the `mattpocock-skills` plugin's code-review skill.

## Use it

1. Run the code-review skill. The panel opens by itself. The chat gets only the skill's one-line summary.
2. Findings sit in two groups, **Standards** and **Spec**, sorted by score out of 10. Scores 1–2 are greyed out. **must fix** marks a finding that breaks a written rule or the spec; the rest are judgement calls.
3. Rows are numbered #1, #2, … from top to bottom once the review ends. Say *"fix 3"* for row #3. Press a row to open it: the code now, the suggested code, then why it matters. ← Back or Esc returns.

### Your own branch

Run the review with no PR link. On each finding:

| Button | Key | What it does |
|---|---|---|
| Fix it | `f` | Adds a todo in [todo-commits](../todo-commits), so the fix gets its own commit. Without todo-commits, Claude fixes it right away |
| Won't fix | `w` | Closes it without changing code |
| Ask Claude | `a` | Puts the finding in the prompt box, so you can ask about it |

You can also just say *"fix 3"*.

### Someone else's PR

Run the review with a PR link. Each finding comes with a comment draft for the author. The draft you see is exactly what gets posted.

| Button | Key | What it does |
|---|---|---|
| Add to review | `p` | Puts the draft in the pending pile. Nothing is posted yet |
| Drop | `d` | Skips the finding |
| Edit | `e` | Change the draft's words directly |
| Rewrite | `r` | Tell Claude how to change it: *"softer"*, *"drop the code"* |

**N pending · Submit review** posts every pending draft as one GitHub review, each comment on its line. You pick Comment (the default), Request changes or Approve, and confirm first.

### Re-check

Press **Re-check**, or say *"re-check"*. Each finding you acted on gets ✅ addressed, ⚠️ addressed wrongly, or ❌ not addressed. Every commit since the last review is reviewed again, and new problems show under **New in round 2**.

On someone else's PR, just ask *"are my comments on https://github.com/… addressed?"*, even in a new session. The panel rebuilds the list from your own comments on GitHub. It counts the comments that start a thread, resolved ones included, and reviews from the commit of your last review.

### When nothing is left

The panel suggests **Approve PR** on their PR, or **Create PR** on your branch if it isn't on GitHub yet. Both ask you to confirm.

## Good to know

- **One review per session.** Starting a review of another PR asks before it replaces the one shown. `/clear` starts empty.
- **Resume:** `claude --resume` brings the session's review back. It is saved under that session only and deleted after 7 days.
- **Score scale:** 9–10 a bug or a broken spec · 6–8 fix before merging · 3–5 nice to have · 1–2 nitpick.
- **Rewrite** uses a small Sonnet call. If it gives no answer, the draft stays as it was and the panel says so.
- The review tool's calls show as one line each in the conversation.

## Requirements

- Claude Code 2.1.288 or newer. The plugin uses function hooks, which Claude Code marks as early access.
- The `mattpocock-skills` plugin, for its code-review skill.
- `gh`, signed in, for posting reviews, approving and re-checking their PR.

## Develop

```
claude --plugin-dir ./plugins/code-review-mod   # load from this folder
claude plugin test ./plugins/code-review-mod    # run the tests
claude plugin validate ./plugins/code-review-mod
```
