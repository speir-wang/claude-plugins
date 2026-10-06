import { expect, test } from 'claude-code/testing'

import { parseHunks } from '../hooks/diff-lines'

test('parseHunks reads the new-side ranges of each hunk', () => {
  const patch = '@@ -1,3 +1,4 @@\n a\n+b\n c\n d\n@@ -20 +21 @@ fn()\n-x\n+y\n@@ -40,2 +41,0 @@\n-gone\n-gone'

  expect(parseHunks(patch)).toEqual([
    { start: 1, end: 4 },
    { start: 21, end: 21 },
  ])
})

test('parseHunks ignores lines that only look like hunk headers', () => {
  expect(parseHunks('@@ -1,1 +1,1 @@\n+ @@ -5,1 +9,1 @@')).toEqual([{ start: 1, end: 1 }])
})
