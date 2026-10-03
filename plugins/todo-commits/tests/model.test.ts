import { expect, test } from 'claude-code/testing'

import { cleanTitle, readVerdicts } from '../hooks/model'

test('readVerdicts reads a clean JSON list', () => {
  const reply = '[{"path": "a.snap", "isWorth": false, "reason": "Generated."}, {"path": "b.ts", "isWorth": true, "reason": "Logic."}]'
  expect([...readVerdicts(reply)]).toEqual([
    ['a.snap', { isWorth: false, reason: 'Generated.' }],
    ['b.ts', { isWorth: true, reason: 'Logic.' }],
  ])
})

test('readVerdicts finds the list between the first [ and the last ]', () => {
  const reply = 'Sure! Here you go:\n[{"path": "a.snap", "isWorth": false, "reason": "Generated."}]\nHope that helps.'
  expect([...readVerdicts(reply).keys()]).toEqual(['a.snap'])
})

test('readVerdicts gives an empty map for bad JSON or no list', () => {
  expect(readVerdicts('not json at all').size).toBe(0)
  expect(readVerdicts('[{"path": ').size).toBe(0)
  expect(readVerdicts('').size).toBe(0)
  expect(readVerdicts('{"path": "a"}').size).toBe(0)
})

test('readVerdicts skips items without a string path or reason', () => {
  const reply = '[{"path": "a", "isWorth": true}, {"reason": "x"}, {"path": 3, "reason": "x"}, null, {"path": "ok", "reason": "fine"}]'
  expect([...readVerdicts(reply).keys()]).toEqual(['ok'])
})

test('readVerdicts counts a missing isWorth as worth reading', () => {
  expect(readVerdicts('[{"path": "a", "reason": "r"}]').get('a')).toEqual({ isWorth: true, reason: 'r' })
})

test('cleanTitle strips quotes and a trailing period', () => {
  expect(cleanTitle('"Bump the theme version."')).toBe('Bump the theme version')
  expect(cleanTitle("'Fix it'")).toBe('Fix it')
  expect(cleanTitle('`Fix it.`')).toBe('Fix it')
})

test('cleanTitle keeps only the first line', () => {
  expect(cleanTitle('Add a test\nbecause it was missing')).toBe('Add a test')
  expect(cleanTitle('\n  Padded title  \n')).toBe('Padded title')
})

test('cleanTitle gives nothing for an empty reply or one over 80 characters', () => {
  expect(cleanTitle('')).toBe(undefined)
  expect(cleanTitle('   ')).toBe(undefined)
  expect(cleanTitle('""')).toBe(undefined)
  expect(cleanTitle('x'.repeat(80))).toBe('x'.repeat(80))
  expect(cleanTitle('x'.repeat(81))).toBe(undefined)
})
