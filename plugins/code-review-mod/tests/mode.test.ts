import { expect, test } from 'claude-code/testing'

import { flipMode, pickMode, prLinks, readPr } from '../hooks/mode'

test('a PR reads from the short form or a GitHub link, from any repo', () => {
  expect(readPr('acme/shop#7')).toBe('acme/shop#7')
  expect(readPr('https://github.com/other-org/api.v2/pull/123/files')).toBe('other-org/api.v2#123')
  expect(readPr('feature/login')).toBeUndefined()
  expect(readPr('acme/shop#x')).toBeUndefined()
})

test('a PR means their PR; a branch means mine', () => {
  expect(pickMode('acme/shop#7', undefined)).toBe('theirs')
  expect(pickMode('feature/login', undefined)).toBe('mine')
})

test('the mode Claude gives wins; anything else falls back to the PR form', () => {
  expect(pickMode('acme/shop#7', 'mine')).toBe('mine')
  expect(pickMode('feature', 'theirs')).toBe('theirs')
  expect(pickMode('feature', 'yours')).toBe('mine')
})

test('the switch flips the mode both ways', () => {
  expect(flipMode('mine')).toBe('theirs')
  expect(flipMode('theirs')).toBe('mine')
})

test('every PR link in a message is found once', () => {
  const text = 'are my comments on https://github.com/acme/shop/pull/7 addressed? see https://github.com/acme/shop/pull/7 and https://github.com/x/y/pull/2'
  expect(prLinks(text)).toEqual(['acme/shop#7', 'x/y#2'])
  expect(prLinks('no links here')).toEqual([])
})
