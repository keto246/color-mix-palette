// 色の定義と混色ロジック（RYBモデル）
//
// 各色を「含む原色(pigment)の集合」で表現する。
//   赤   = {R}
//   黄   = {Y}
//   青   = {B}
//   橙   = {R,Y}
//   緑   = {Y,B}
//   紫   = {R,B}
//   茶   = {R,Y,B}   ← 失敗色
// 混色は単純に pigment 集合の和集合で求まる。

export type Pigment = 'R' | 'Y' | 'B'

export type ColorName =
  | 'empty'
  | 'white'
  | 'red'
  | 'yellow'
  | 'blue'
  | 'orange'
  | 'green'
  | 'purple'
  | 'brown'

export const PRIMARY_COLORS: ColorName[] = ['red', 'yellow', 'blue']

const PIGMENTS: Record<ColorName, Pigment[]> = {
  empty: [],
  white: [],
  red: ['R'],
  yellow: ['Y'],
  blue: ['B'],
  orange: ['R', 'Y'],
  green: ['Y', 'B'],
  purple: ['R', 'B'],
  brown: ['R', 'Y', 'B'],
}

function pigmentsToColor(set: Set<Pigment>): ColorName {
  const has = (p: Pigment) => set.has(p)
  const r = has('R')
  const y = has('Y')
  const b = has('B')
  if (r && y && b) return 'brown'
  if (r && y) return 'orange'
  if (y && b) return 'green'
  if (r && b) return 'purple'
  if (r) return 'red'
  if (y) return 'yellow'
  if (b) return 'blue'
  return 'empty'
}

/** 混色できる色か（空マス・白マスは混色に参加しない）。 */
export function isMixable(color: ColorName): boolean {
  return color !== 'empty' && color !== 'white'
}

/** 2色を混ぜた結果の色を返す。 */
export function mixColors(a: ColorName, b: ColorName): ColorName {
  const set = new Set<Pigment>()
  for (const p of PIGMENTS[a]) set.add(p)
  for (const p of PIGMENTS[b]) set.add(p)
  return pigmentsToColor(set)
}

// 色相環の順序（触媒タイルが結果を1段ずらすのに使う）
const COLOR_WHEEL: ColorName[] = ['red', 'orange', 'yellow', 'green', 'blue', 'purple']

/** 触媒タイル用：色相環で1段先の色にずらす。環に無い色はそのまま返す。 */
export function shiftColor(color: ColorName): ColorName {
  const idx = COLOR_WHEEL.indexOf(color)
  if (idx === -1) return color
  return COLOR_WHEEL[(idx + 1) % COLOR_WHEEL.length]
}

/** UI 表示用の HEX。 */
export const COLOR_HEX: Record<ColorName, string> = {
  empty: 'transparent',
  white: '#e2e8f0',
  red: '#e53e3e',
  yellow: '#d69e2e',
  blue: '#3182ce',
  orange: '#ed8936',
  green: '#38a169',
  purple: '#805ad5',
  brown: '#7b4b2a',
}

export const COLOR_LABEL: Record<ColorName, string> = {
  empty: '',
  white: '白',
  red: '赤',
  yellow: '黄',
  blue: '青',
  orange: '橙',
  green: '緑',
  purple: '紫',
  brown: '茶',
}
