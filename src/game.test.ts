import { describe, expect, it } from 'vitest'
import { ColorName } from './colors'
import {
  boardMatchesTarget,
  calcStars,
  Cell,
  collect,
  createGame,
  place,
  slide,
  StageConfig,
} from './game'

function blank(n: number): Cell[] {
  return Array.from({ length: n }, () => ({ color: 'empty' as ColorName, fixed: false, timer: null }))
}

function stage(over: Partial<StageConfig> & { rows: number; cols: number }): StageConfig {
  const n = over.rows * over.cols
  return {
    id: 1,
    target: new Array<ColorName>(n).fill('empty'),
    initial: blank(n),
    hand: [],
    maxMoves: 99,
    starThresholds: [n, n + 1],
    ...over,
  }
}

describe('place と混色', () => {
  it('空マスに置くと手持ちが減り手数が増える', () => {
    const g = createGame(stage({ rows: 1, cols: 2, hand: ['red'] }))
    expect(place(g, 0, 0)).toBe(true)
    expect(g.cells[0].color).toBe('red')
    expect(g.hand.length).toBe(0)
    expect(g.moves).toBe(1)
  })

  it('となり合わせると両方が混ざる', () => {
    const g = createGame(stage({ rows: 1, cols: 2, hand: ['red', 'yellow'] }))
    place(g, 0, 0) // red @0
    place(g, 0, 1) // yellow @1
    expect(g.cells[0].color).toBe('orange')
    expect(g.cells[1].color).toBe('orange')
  })

  it('連鎖混色で茶になる', () => {
    // [orange, _, blue] の中央に橙と青を隣接させる構成
    const g = createGame(stage({ rows: 1, cols: 3, hand: ['red', 'yellow', 'blue'] }))
    place(g, 0, 0) // red @0
    place(g, 0, 1) // yellow @1 -> 0,1 ともに orange
    place(g, 0, 2) // blue @2 -> 1,2 が brown、さらに0へ連鎖
    expect(g.cells[2].color).toBe('brown')
    expect(g.cells[1].color).toBe('brown')
    expect(g.cells[0].color).toBe('brown')
  })

  it('占有済みマスには置けない', () => {
    const g = createGame(stage({ rows: 1, cols: 2, hand: ['red', 'blue'] }))
    place(g, 0, 0)
    expect(place(g, 0, 0)).toBe(false)
  })
})

describe('collect（回収）', () => {
  it('一次色は回収できる', () => {
    const g = createGame(stage({ rows: 1, cols: 2, hand: ['red'] }))
    place(g, 0, 0)
    expect(collect(g, 0)).toBe(true)
    expect(g.cells[0].color).toBe('empty')
    expect(g.hand).toContain('red')
  })

  it('二次色は回収できない', () => {
    const g = createGame(stage({ rows: 1, cols: 2, hand: ['red', 'yellow'] }))
    place(g, 0, 0)
    place(g, 0, 1) // 両方 orange
    expect(collect(g, 0)).toBe(false)
  })
})

describe('slide（スライド）', () => {
  it('隣の空マスへ動かせる', () => {
    const g = createGame(stage({ rows: 1, cols: 2, hand: ['red'] }))
    place(g, 0, 0)
    expect(slide(g, 0, 1)).toBe(true)
    expect(g.cells[0].color).toBe('empty')
    expect(g.cells[1].color).toBe('red')
  })

  it('離れたマスへは動かせない', () => {
    const g = createGame(stage({ rows: 1, cols: 3, hand: ['red'] }))
    place(g, 0, 0)
    expect(slide(g, 0, 2)).toBe(false)
  })
})

describe('固定タイル', () => {
  it('動かす・回収はできないが混色には参加する', () => {
    const init = blank(2)
    init[0] = { color: 'red', fixed: true, timer: null }
    const g = createGame(stage({ rows: 1, cols: 2, initial: init, hand: ['yellow'] }))
    expect(collect(g, 0)).toBe(false)
    expect(slide(g, 0, 1)).toBe(false)
    place(g, 0, 1) // yellow を隣に置く
    expect(g.cells[0].color).toBe('orange') // 固定タイルも混ざる
    expect(g.cells[1].color).toBe('orange')
  })
})

describe('ワープ', () => {
  it('ワープでつながったマス同士が混色する', () => {
    const g = createGame(
      stage({ rows: 1, cols: 3, hand: ['red', 'yellow'], gimmicks: { warpPairs: [[0, 2]] } })
    )
    place(g, 0, 0) // red @0
    place(g, 0, 2) // yellow @2 （ワープで0と隣接）
    expect(g.cells[0].color).toBe('orange')
    expect(g.cells[2].color).toBe('orange')
    expect(g.cells[1].color).toBe('empty') // 中央は無関係
  })
})

describe('滲み（bleed）', () => {
  it('滲みマスに置くと隣の空マスへ色が広がる', () => {
    const g = createGame(stage({ rows: 1, cols: 2, hand: ['red'], gimmicks: { bleed: [0] } }))
    place(g, 0, 0)
    expect(g.cells[0].color).toBe('red')
    expect(g.cells[1].color).toBe('red')
  })
})

describe('鏡（mirror）', () => {
  it('置くと左右対称位置に複製される', () => {
    const g = createGame(stage({ rows: 1, cols: 3, hand: ['blue'], gimmicks: { mirror: true } }))
    place(g, 0, 0)
    expect(g.cells[0].color).toBe('blue')
    expect(g.cells[2].color).toBe('blue') // 鏡像
  })
})

describe('触媒（catalyst）', () => {
  it('異なる2色の混色結果が1段ずれる', () => {
    const g = createGame(
      stage({ rows: 1, cols: 2, hand: ['red', 'yellow'], gimmicks: { catalyst: [1] } })
    )
    place(g, 0, 0) // red
    place(g, 0, 1) // yellow -> 通常は orange、触媒で yellow にずれる
    expect(g.cells[1].color).toBe('yellow')
    expect(g.cells[0].color).toBe('yellow')
  })
})

describe('時限マス', () => {
  it('置いた後、手数経過で消える', () => {
    const g = createGame(
      stage({ rows: 1, cols: 3, hand: ['red', 'blue', 'yellow'], timedCells: [0], timedTurns: 2 })
    )
    place(g, 0, 0) // red @0、timer=2 → 直後に tick されて 1
    expect(g.cells[0].timer).toBe(1)
    place(g, 0, 2) // 別の手 → tick で 0 になり消滅
    expect(g.cells[0].color).toBe('empty')
  })
})

describe('クリア・失敗・スター', () => {
  it('目標一致でクリアし手数からスターが決まる', () => {
    const g = createGame(
      stage({ rows: 1, cols: 2, target: ['orange', 'orange'], hand: ['red', 'yellow'], maxMoves: 4, starThresholds: [2, 3] })
    )
    place(g, 0, 0)
    place(g, 0, 1)
    expect(boardMatchesTarget(g)).toBe(true)
    expect(g.status).toBe('cleared')
    expect(calcStars(g)).toBe(3)
  })

  it('手数を使い切って未達なら失敗', () => {
    const g = createGame(
      stage({ rows: 1, cols: 2, target: ['red', 'empty'], hand: ['blue'], maxMoves: 1 })
    )
    place(g, 0, 0) // blue を置くが目標は red
    expect(g.status).toBe('failed')
  })
})
