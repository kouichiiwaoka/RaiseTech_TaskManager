// Unicode White_Space + BOM + U+001C〜U+001F。前後のみ除去し内部は保持する。
function titleSpace(character: string): boolean {
  const code = character.charCodeAt(0)
  return character.trim() === '' || code === 0x85 || (code >= 0x1c && code <= 0x1f)
}

export function normalizeTitle(value: string): string {
  let start = 0
  let end = value.length
  while (start < end && titleSpace(value[start])) start++
  while (end > start && titleSpace(value[end - 1])) end--
  return value.slice(start, end)
}
