import type { EngineInterface } from 'claude-code'

/** The drawing parts (Box, Text, Button, Code ...) the entry file resolves and hands to the draw functions. */
export type Parts = ReturnType<EngineInterface['ui']['resolve']>
