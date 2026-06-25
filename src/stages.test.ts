import { describe, expect, it } from 'vitest'
import { getStages, TOTAL_STAGES } from './stages'

describe('ステージ生成', () => {
  const stages = getStages()

  it('規定数のステージが生成される', () => {
    expect(stages.length).toBe(TOTAL_STAGES)
    expect(stages.length).toBe(36)
  })

  it('すべてのステージが健全である', () => {
    for (const s of stages) {
      const n = s.rows * s.cols
      // 盤面サイズ整合
      expect(s.target.length).toBe(n)
      expect(s.initial.length).toBe(n)
      // 目標に失敗色（茶）を含まない
      expect(s.target).not.toContain('brown')
      // 手持ちがあり、目標に色がある
      expect(s.hand.length).toBeGreaterThanOrEqual(1)
      expect(s.target.some((c) => c !== 'empty' && c !== 'white')).toBe(true)
      // 手数の整合（最短=手持ち数、上限はそれ以上）
      expect(s.starThresholds[0]).toBe(s.hand.length)
      expect(s.maxMoves).toBeGreaterThanOrEqual(s.starThresholds[1])
      // 白マスは初期と目標で一致
      for (let i = 0; i < n; i++) {
        if (s.initial[i].color === 'white') {
          expect(s.initial[i].fixed).toBe(true)
          expect(s.target[i]).toBe('white')
        }
      }
    }
  })

  it('難易度カーブ：盤面が段階的に大きくなる', () => {
    expect(stages[0].rows * stages[0].cols).toBeLessThanOrEqual(stages[10].rows * stages[10].cols)
    expect(stages[10].rows * stages[10].cols).toBeLessThanOrEqual(
      stages[30].rows * stages[30].cols
    )
  })
})
