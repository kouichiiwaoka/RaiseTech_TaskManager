import { expect, it } from 'vitest'
import { normalizeTitle } from './normalizeTitle'
it.each(['\u00a0', '\u202f', '\ufeff', '\u0085', '\u001c', '\u001d', '\u001e', '\u001f', '\u3000', '\t', '\n'])('タイトルの前後空白%sを除去し内部を保持する', (space) => {
  expect(normalizeTitle(space.repeat(2))).toBe('')
  expect(normalizeTitle(`${space}日${space}😀${space}`)).toBe(`日${space}😀`)
})
