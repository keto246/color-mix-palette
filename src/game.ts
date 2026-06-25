// ゲームの状態管理とコアロジック
//
// 【混色ルールの確定仕様】
// 仕様書では「隣接する同じ色で混色」と「A+B→C の連鎖」が併記され曖昧だったため、
// パズルとして破綻なく成立する以下のルールに確定して実装する：
//
//   - タイルを「置く / スライドした」瞬間に mix ステップが走る。
//   - mix ステップ：対象タイルとその直交隣接タイル（混色可能なもの）を見て、
//     2つの pigment を合成した色に【両方とも】変化させる（対称・決定論的）。
//   - 色が変化したタイルはキューに積まれ、連鎖的に mix ステップを繰り返す。
//   - これにより「赤の隣に黄を置く → 両方が橙」「橙の隣に青 → 茶（失敗）」が表現できる。
//
// この対称ルールにより、盤面は「前から順に置いていく」ことで必ず再現できる。
// ステージ生成（stages.ts）はこの place() を実際に呼んで盤面を構築するため、
// 生成された目標は構成的に必ず解ける。

import { ColorName, isMixable, mixColors, shiftColor } from './colors'

export interface Cell {
  color: ColorName
  fixed: boolean // 🔒 動かす/取るができない（混色には参加する）
  timer: number | null // ⏱ 残り手数。null は時限なし。0 になると空に戻る
}

export type GameStatus = 'playing' | 'cleared' | 'failed'

export interface StageGimmicks {
  warpPairs?: [number, number][] // 🔀 互いを隣接扱いにするセル対
  bleed?: number[] // 💧 置くと隣の空マス1つに色が滲む
  mirror?: boolean // 🪞 置くと左右対称位置に複製
  catalyst?: number[] // 🧪 そのセルが絡む混色結果を1段ずらす
}

export interface GameState {
  rows: number
  cols: number
  cells: Cell[]
  target: ColorName[]
  hand: ColorName[]
  moves: number
  maxMoves: number
  starThresholds: [number, number] // [★3以内, ★2以内]
  status: GameStatus
  warp: Map<number, number>
  bleed: Set<number>
  mirror: boolean
  catalyst: Set<number>
  timedCells: Set<number> // 置かれた時に timer が始まるセル
  timedTurns: number
}

export interface StageConfig {
  id: number
  rows: number
  cols: number
  target: ColorName[]
  initial: Cell[] // 開始時の盤面（固定タイル・白マスを含む）
  hand: ColorName[]
  maxMoves: number
  starThresholds: [number, number]
  gimmicks?: StageGimmicks
  timedCells?: number[]
  timedTurns?: number
}

export function createGame(cfg: StageConfig): GameState {
  const warp = new Map<number, number>()
  for (const [a, b] of cfg.gimmicks?.warpPairs ?? []) {
    warp.set(a, b)
    warp.set(b, a)
  }
  return {
    rows: cfg.rows,
    cols: cfg.cols,
    cells: cfg.initial.map((c) => ({ ...c })),
    target: [...cfg.target],
    hand: [...cfg.hand],
    moves: 0,
    maxMoves: cfg.maxMoves,
    starThresholds: cfg.starThresholds,
    status: 'playing',
    warp,
    bleed: new Set(cfg.gimmicks?.bleed ?? []),
    mirror: cfg.gimmicks?.mirror ?? false,
    catalyst: new Set(cfg.gimmicks?.catalyst ?? []),
    timedCells: new Set(cfg.timedCells ?? []),
    timedTurns: cfg.timedTurns ?? 0,
  }
}

export function cloneGame(s: GameState): GameState {
  return {
    ...s,
    cells: s.cells.map((c) => ({ ...c })),
    target: [...s.target],
    hand: [...s.hand],
    warp: new Map(s.warp),
    bleed: new Set(s.bleed),
    catalyst: new Set(s.catalyst),
    timedCells: new Set(s.timedCells),
  }
}

/** 直交隣接（＋ワープでつながったセル）のインデックス一覧。 */
export function neighbors(s: GameState, i: number): number[] {
  const r = Math.floor(i / s.cols)
  const c = i % s.cols
  const out: number[] = []
  if (r > 0) out.push(i - s.cols)
  if (r < s.rows - 1) out.push(i + s.cols)
  if (c > 0) out.push(i - 1)
  if (c < s.cols - 1) out.push(i + 1)
  const w = s.warp.get(i)
  if (w !== undefined) out.push(w)
  return out
}

function mirrorIndex(s: GameState, i: number): number {
  const r = Math.floor(i / s.cols)
  const c = i % s.cols
  return r * s.cols + (s.cols - 1 - c)
}

/** 連鎖混色。seeds から始めて、色が変化したセルを辿って安定するまで混ぜる。 */
function applyMix(s: GameState, seeds: number[]): void {
  const queue = [...seeds]
  let guard = 0
  const limit = s.cells.length * s.cells.length + 16
  while (queue.length > 0) {
    if (guard++ > limit) break // 念のための無限ループ防止
    const i = queue.shift()!
    if (!isMixable(s.cells[i].color)) continue
    for (const n of neighbors(s, i)) {
      const a = s.cells[i].color
      const b = s.cells[n].color
      if (!isMixable(b)) continue
      let mixed = mixColors(a, b)
      // 触媒は「異なる2色の混色」のときだけ結果を1段ずらす。
      // （同色どうしに適用すると延々とずれ続けてしまうため）
      if (a !== b && (s.catalyst.has(i) || s.catalyst.has(n))) mixed = shiftColor(mixed)
      if (mixed === a && mixed === b) continue
      if (s.cells[i].color !== mixed) {
        s.cells[i].color = mixed
        queue.push(i)
      }
      if (s.cells[n].color !== mixed) {
        s.cells[n].color = mixed
        queue.push(n)
      }
    }
  }
}

/** 時限マスの手数を減らし、0 になったものを空に戻す。 */
function tickTimers(s: GameState): void {
  for (const cell of s.cells) {
    if (cell.timer !== null) {
      cell.timer -= 1
      if (cell.timer <= 0) {
        cell.color = 'empty'
        cell.timer = null
        cell.fixed = false
      }
    }
  }
}

function updateStatus(s: GameState): void {
  if (boardMatchesTarget(s)) {
    s.status = 'cleared'
    return
  }
  // 失敗：手数を使い切ってクリアできていない、または手持ちが尽きて未達
  if (s.moves >= s.maxMoves) {
    s.status = 'failed'
    return
  }
  if (s.hand.length === 0 && !canStillWin(s)) {
    s.status = 'failed'
  }
}

/** 盤面が目標と完全一致しているか。 */
export function boardMatchesTarget(s: GameState): boolean {
  for (let i = 0; i < s.cells.length; i++) {
    if (s.cells[i].color !== s.target[i]) return false
  }
  return true
}

/** ざっくりした「まだ勝てる可能性」判定（厳密な探索はしない）。 */
function canStillWin(s: GameState): boolean {
  // 手持ちが残っていればまだ操作できる
  if (s.hand.length > 0) return true
  // 盤上に一次色タイルが残っていれば回収して置き直せる
  return s.cells.some((c) => !c.fixed && (c.color === 'red' || c.color === 'yellow' || c.color === 'blue'))
}

/** 置く・スライド・取るの後処理（滲み・複製・混色・時限・判定）をまとめて行う。 */
function finalize(s: GameState, seeds: number[]): void {
  applyMix(s, seeds)
  tickTimers(s)
  updateStatus(s)
}

/**
 * 手持ちの色を空マスに置く。成功なら true。
 * （滲み・鏡などの後処理込み）
 */
export function place(s: GameState, handIndex: number, cellIndex: number): boolean {
  if (s.status !== 'playing') return false
  const color = s.hand[handIndex]
  if (color === undefined) return false
  const cell = s.cells[cellIndex]
  if (cell.color !== 'empty') return false

  const seeds = [cellIndex]
  cell.color = color
  if (s.timedCells.has(cellIndex)) cell.timer = s.timedTurns

  // 💧 滲み：隣の空マス1つに同じ色を広げる
  if (s.bleed.has(cellIndex)) {
    const e = neighbors(s, cellIndex).find((n) => s.cells[n].color === 'empty')
    if (e !== undefined) {
      s.cells[e].color = color
      seeds.push(e)
    }
  }
  // 🪞 鏡：左右対称位置の空マスに複製
  if (s.mirror) {
    const m = mirrorIndex(s, cellIndex)
    if (m !== cellIndex && s.cells[m].color === 'empty') {
      s.cells[m].color = color
      seeds.push(m)
    }
  }

  s.hand.splice(handIndex, 1)
  s.moves += 1
  finalize(s, seeds)
  return true
}

/** 置いたタイルを隣の空マスへ動かす。成功なら true。 */
export function slide(s: GameState, fromIndex: number, toIndex: number): boolean {
  if (s.status !== 'playing') return false
  const from = s.cells[fromIndex]
  const to = s.cells[toIndex]
  if (from.fixed || !isMixable(from.color)) return false
  if (to.color !== 'empty') return false
  if (!neighbors(s, fromIndex).includes(toIndex)) return false

  to.color = from.color
  to.timer = s.timedCells.has(toIndex) ? s.timedTurns : null
  from.color = 'empty'
  from.timer = null
  s.moves += 1
  finalize(s, [toIndex])
  return true
}

/** 一次色タイルを手持ちに戻す。成功なら true。 */
export function collect(s: GameState, cellIndex: number): boolean {
  if (s.status !== 'playing') return false
  const cell = s.cells[cellIndex]
  if (cell.fixed) return false
  if (cell.color !== 'red' && cell.color !== 'yellow' && cell.color !== 'blue') return false

  s.hand.push(cell.color)
  cell.color = 'empty'
  cell.timer = null
  s.moves += 1
  finalize(s, [])
  return true
}

/** 現在の手数からスター数（0〜3）を計算する。 */
export function calcStars(s: GameState): number {
  if (s.status !== 'cleared') return 0
  const [three, two] = s.starThresholds
  if (s.moves <= three) return 3
  if (s.moves <= two) return 2
  return 1
}
