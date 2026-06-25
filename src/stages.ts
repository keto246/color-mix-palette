// ステージデータ
//
// 手作業で「解ける配色」を設計するのは難しく破綻しやすい。
// そこで「空の盤面に place() を実際に走らせて前進生成」する方式を採る。
// 生成に使った手順がそのまま解答になるため、出来上がる目標は構成的に必ず解ける。
// seed 固定なので毎回まったく同じ 36 ステージが得られる。

import { ColorName, PRIMARY_COLORS } from './colors'
import { Cell, createGame, place, StageConfig, StageGimmicks } from './game'

export interface StageMeta extends StageConfig {
  title: string
  hint: string
  // 生成器が見つけた解答手順（テスト・デバッグ用）。
  // 手持ち動作 i 回目で「hand[?] = color を cellIndex に置く」べきセル位置。
  solution: { cellIndex: number; color: ColorName }[]
}

interface GenParams {
  id: number
  rows: number
  cols: number
  actions: number
  fixed: number // 事前配置する固定タイル数（0 or 1）
  white: number[]
  gimmicks?: StageGimmicks
  timed?: number[]
  title: string
  hint: string
}

// 決定論的な擬似乱数（mulberry32）
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function blankCells(n: number, white: number[]): Cell[] {
  const whiteSet = new Set(white)
  const cells: Cell[] = []
  for (let i = 0; i < n; i++) {
    cells.push(
      whiteSet.has(i)
        ? { color: 'white', fixed: true, timer: null }
        : { color: 'empty', fixed: false, timer: null }
    )
  }
  return cells
}

function hasBrown(cells: Cell[]): boolean {
  return cells.some((c) => c.color === 'brown')
}

function generate(p: GenParams): StageMeta {
  const n = p.rows * p.cols
  const timedTurns = p.actions + 5 // 通常プレイ中は時間切れにならない長さ（v1 簡略化）

  for (let attempt = 0; attempt < 300; attempt++) {
    const seed = p.id * 1000 + attempt + 1
    const rng = mulberry32(seed)

    const builderCfg: StageConfig = {
      id: p.id,
      rows: p.rows,
      cols: p.cols,
      target: new Array<ColorName>(n).fill('empty'),
      initial: blankCells(n, p.white),
      hand: [],
      maxMoves: 9999,
      starThresholds: [0, 0],
      gimmicks: p.gimmicks,
      timedCells: p.timed,
      timedTurns,
    }
    const builder = createGame(builderCfg)

    const handPlaced: ColorName[] = []
    const fixedInit: { index: number; color: ColorName }[] = []
    const solution: { cellIndex: number; color: ColorName }[] = []
    let placements = 0
    let tries = 0

    while (placements < p.actions && tries < p.actions * 40) {
      tries++
      const empties: number[] = []
      for (let i = 0; i < builder.cells.length; i++) {
        if (builder.cells[i].color === 'empty') empties.push(i)
      }
      if (empties.length === 0) break

      const i = empties[Math.floor(rng() * empties.length)]
      const prim = PRIMARY_COLORS[Math.floor(rng() * PRIMARY_COLORS.length)]

      // 茶（失敗色）を目標に含めないよう、試し置きしてチェック
      const probe = createGame(builderCfg)
      probe.cells = builder.cells.map((c) => ({ ...c }))
      probe.hand = []
      probe.moves = 0
      probe.status = 'playing'
      probe.hand.push(prim)
      place(probe, 0, i)
      if (hasBrown(probe.cells)) continue

      // 本番に反映（差分を取れるよう before スナップショットも取る）
      const before = builder.cells.map((c) => c.color)
      builder.moves = 0
      builder.status = 'playing'
      builder.hand.push(prim)
      const ok = place(builder, builder.hand.length - 1, i)
      if (!ok) {
        builder.hand.pop()
        continue
      }

      if (placements < p.fixed) {
        // 固定タイルとして登録するのは「この置き手で変化したセル全部」。
        // 鏡や滲みの複製先も固定にしないと、プレイヤー側ではそのセルを
        // 元の色で埋める手段が無くなり target に到達できない（mirror+fixed 等）。
        for (let idx = 0; idx < builder.cells.length; idx++) {
          if (builder.cells[idx].color !== before[idx]) {
            fixedInit.push({ index: idx, color: builder.cells[idx].color })
          }
        }
      } else {
        handPlaced.push(prim)
        solution.push({ cellIndex: i, color: prim })
      }
      placements++
    }

    if (handPlaced.length < 1) continue

    const target = builder.cells.map((c) => c.color)
    const initial = blankCells(n, p.white)
    for (const f of fixedInit) {
      initial[f.index] = { color: f.color, fixed: true, timer: null }
    }

    const handLen = handPlaced.length
    return {
      id: p.id,
      rows: p.rows,
      cols: p.cols,
      target,
      initial,
      hand: shuffle(handPlaced, mulberry32(seed + 7)),
      maxMoves: handLen + 2,
      starThresholds: [handLen, handLen + 1],
      gimmicks: p.gimmicks,
      timedCells: p.timed,
      timedTurns,
      title: p.title,
      hint: p.hint,
      solution,
    }
  }

  // 念のためのフォールバック（通常は到達しない）
  return {
    id: p.id,
    rows: 1,
    cols: 1,
    target: ['red'],
    initial: [{ color: 'empty', fixed: false, timer: null }],
    hand: ['red'],
    maxMoves: 3,
    starThresholds: [1, 2],
    title: p.title,
    hint: p.hint,
    solution: [{ cellIndex: 0, color: 'red' }],
  }
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// 各ステージの生成パラメータ（難易度カーブ）
const PARAMS: GenParams[] = [
  // --- チュートリアル（1〜3）：小さい盤・混色少なめ ---
  { id: 1, rows: 1, cols: 3, actions: 1, fixed: 0, white: [], title: 'はじめての一手', hint: '手持ちのタイルを選んで、空きマスをタップして置こう。' },
  { id: 2, rows: 2, cols: 2, actions: 2, fixed: 0, white: [], title: 'ふたつの色', hint: '目標の配色と同じ場所に色を置こう。' },
  { id: 3, rows: 2, cols: 3, actions: 3, fixed: 0, white: [], title: 'となりに置くと…', hint: '赤と黄をとなり合わせると橙に混ざる！' },

  // --- 序盤（4〜10）：3×3・混色を活用 ---
  { id: 4, rows: 3, cols: 3, actions: 3, fixed: 0, white: [], title: '混色の基本', hint: '黄＋青＝緑、赤＋青＝紫。' },
  { id: 5, rows: 3, cols: 3, actions: 4, fixed: 0, white: [], title: '色を作る', hint: '置く順番を考えてみよう。' },
  { id: 6, rows: 3, cols: 3, actions: 4, fixed: 0, white: [], title: '連鎖の予感', hint: '混ざった色がさらに隣と混ざることもある。' },
  { id: 7, rows: 3, cols: 3, actions: 5, fixed: 0, white: [], title: 'パレットを読む', hint: 'まず目標をよく観察しよう。' },
  { id: 8, rows: 3, cols: 3, actions: 5, fixed: 0, white: [], title: '取って置き直す', hint: '一次色（赤黄青）は長押しで回収できる。' },
  { id: 9, rows: 3, cols: 3, actions: 6, fixed: 0, white: [], title: '三色そろえて', hint: '無駄な一手を減らすと星が増える。' },
  { id: 10, rows: 3, cols: 3, actions: 6, fixed: 0, white: [], title: '序盤の総仕上げ', hint: '最短手数を目指そう。' },

  // --- 中盤（11〜25）：4×4・固定タイル/白マス/ワープ ---
  { id: 11, rows: 4, cols: 4, actions: 4, fixed: 0, white: [], title: '広い盤面', hint: '4×4に挑戦。' },
  { id: 12, rows: 4, cols: 4, actions: 5, fixed: 0, white: [5], title: '白いカベ', hint: '白マスは置けず、混色にも参加しない。' },
  { id: 13, rows: 4, cols: 4, actions: 5, fixed: 1, white: [], title: '動かせないタイル', hint: '🔒固定タイルは動かせないが混色には参加する。' },
  { id: 14, rows: 4, cols: 4, actions: 6, fixed: 1, white: [6], title: '固定と白', hint: '固定タイルを活かして配色を作ろう。' },
  { id: 15, rows: 4, cols: 4, actions: 6, fixed: 1, white: [5, 10], title: '二枚の白', hint: '通れない場所を意識しよう。' },
  { id: 16, rows: 4, cols: 4, actions: 7, fixed: 1, white: [], title: '混色チェイン', hint: '連鎖で一気に色が変わる。' },
  { id: 17, rows: 4, cols: 4, actions: 7, fixed: 1, white: [0, 15], title: '隅の白', hint: '角の白マスに注意。' },
  { id: 18, rows: 4, cols: 4, actions: 6, fixed: 0, white: [], gimmicks: { warpPairs: [[3, 12]] }, title: 'ワープ初体験', hint: '🔀ワープマス同士は隣接扱いになる。' },
  { id: 19, rows: 4, cols: 4, actions: 7, fixed: 1, white: [], gimmicks: { warpPairs: [[1, 14]] }, title: 'ワープと固定', hint: '離れたマスがつながる。' },
  { id: 20, rows: 4, cols: 4, actions: 7, fixed: 1, white: [6], gimmicks: { warpPairs: [[0, 15]] }, title: '対角ワープ', hint: '角同士がつながると混色の幅が広がる。' },
  { id: 21, rows: 4, cols: 4, actions: 8, fixed: 1, white: [5, 10], title: '中盤の難所', hint: 'じっくり考えよう。' },
  { id: 22, rows: 4, cols: 4, actions: 8, fixed: 1, white: [], gimmicks: { warpPairs: [[2, 13]] }, title: 'ワープ連鎖', hint: 'ワープ越しにも混色は伝わる。' },
  { id: 23, rows: 4, cols: 4, actions: 8, fixed: 1, white: [9], title: '色の設計図', hint: '完成形から逆算しよう。' },
  { id: 24, rows: 4, cols: 4, actions: 8, fixed: 1, white: [5, 10], gimmicks: { warpPairs: [[0, 15]] }, title: '複合ギミック', hint: '白・固定・ワープの合わせ技。' },
  { id: 25, rows: 4, cols: 4, actions: 8, fixed: 1, white: [], title: '中盤の総仕上げ', hint: '星3つを狙おう。' },

  // --- 後半（26〜36）：5×5・各種ギミック ---
  { id: 26, rows: 5, cols: 5, actions: 6, fixed: 0, white: [], title: '大きな盤', hint: '5×5の世界へ。' },
  { id: 27, rows: 5, cols: 5, actions: 7, fixed: 0, white: [12], gimmicks: { bleed: [6, 18] }, title: 'にじむ色', hint: '💧滲みマスに置くと隣の空マスへ色が広がる。' },
  { id: 28, rows: 5, cols: 5, actions: 7, fixed: 0, white: [], gimmicks: { mirror: true }, title: '鏡の世界', hint: '🪞置くと左右対称の位置にも複製される。' },
  { id: 29, rows: 5, cols: 5, actions: 8, fixed: 1, white: [12], title: '広間の固定', hint: '固定タイルを中心に組み立てよう。' },
  { id: 30, rows: 5, cols: 5, actions: 8, fixed: 0, white: [], gimmicks: { catalyst: [12] }, title: '触媒の魔法', hint: '🧪触媒マスが絡む混色は結果が1段ずれる。' },
  { id: 31, rows: 5, cols: 5, actions: 9, fixed: 1, white: [6, 18], gimmicks: { warpPairs: [[4, 20]] }, title: '大ワープ', hint: '遠いマスをつないで色を運ぼう。' },
  { id: 32, rows: 5, cols: 5, actions: 9, fixed: 0, white: [], gimmicks: { bleed: [7, 17], mirror: true }, title: '滲みと鏡', hint: 'ギミックの相乗効果に注意。' },
  { id: 33, rows: 5, cols: 5, actions: 9, fixed: 1, white: [12], gimmicks: { catalyst: [6, 18] }, title: '二つの触媒', hint: '結果のずれを読み切ろう。' },
  { id: 34, rows: 5, cols: 5, actions: 10, fixed: 1, white: [0, 24], gimmicks: { warpPairs: [[2, 22]] }, title: '終盤の試練', hint: '盤面全体を使う。' },
  { id: 35, rows: 5, cols: 5, actions: 10, fixed: 1, white: [12], gimmicks: { bleed: [6, 18], warpPairs: [[4, 20]] }, title: '総力戦', hint: '全ギミックを乗りこなそう。' },
  { id: 36, rows: 5, cols: 5, actions: 10, fixed: 1, white: [], gimmicks: { mirror: true, catalyst: [12] }, title: '色まぜの極み', hint: 'これまでの集大成。星3つで完全制覇！' },
]

// 生成は一度だけ行いキャッシュする
let cached: StageMeta[] | null = null

export function getStages(): StageMeta[] {
  if (cached) return cached
  cached = PARAMS.map(generate)
  return cached
}

export function getStage(id: number): StageMeta | undefined {
  return getStages().find((s) => s.id === id)
}

export const TOTAL_STAGES = PARAMS.length
