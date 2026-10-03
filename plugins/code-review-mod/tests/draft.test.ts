import { expect, test } from 'claude-code/testing'

import { draftBody, readRewrite } from '../hooks/draft'

test('the posted body is the draft text, then the suggested code when it has code', () => {
  expect(draftBody({ text: 'Name it?', hasCode: true }, 'const A = 1')).toBe('Name it?\n\n```\nconst A = 1\n```')
  expect(draftBody({ text: 'Name it?', hasCode: false }, 'const A = 1')).toBe('Name it?')
  expect(draftBody({ text: 'Name it?', hasCode: true }, '  ')).toBe('Name it?')
})

test('a rewrite reply reads as JSON, else as plain text that keeps the code choice', () => {
  const before = { text: 'Old', hasCode: true }
  expect(readRewrite('{"text": "New?", "hasCode": false}', before)).toEqual({ text: 'New?', hasCode: false })
  expect(readRewrite('Sure: {"text": "New?"}', before)).toEqual({ text: 'New?', hasCode: true })
  expect(readRewrite('Just new words?', before)).toEqual({ text: 'Just new words?', hasCode: true })
  expect(readRewrite('   ', before)).toBeUndefined()
})
