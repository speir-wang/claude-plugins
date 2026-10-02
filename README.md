# He Wang's Claude Code plugins

A small plugin marketplace for Claude Code.

## Add the marketplace

In Claude Code:

```
/plugin marketplace add speir-wang/claude-plugins
```

Then install a plugin by name, for example:

```
/plugin install todo-commits@he-wang
```

To get updates later: `/plugin marketplace update he-wang`.

## Plugins

| Plugin | What it does |
|---|---|
| [todo-commits](plugins/todo-commits) | A todo panel where each todo links to its commit; click it to see the message and diff |
