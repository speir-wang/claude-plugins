/** Whose PR the review is for: yours to fix, or someone else's to comment on. */
export type Mode = 'mine' | 'theirs'

declare module 'claude-code' {
  interface PluginState {
    'code-review-mod': {}
  }
}
