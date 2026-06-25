import { describe, expect, it } from 'vitest'
import { isMixable, mixColors, shiftColor } from './colors'

describe('mixColors', () => {
  it('二次色を正しく作る', () => {
    expect(mixColors('red', 'yellow')).toBe('orange')
    expect(mixColors('yellow', 'blue')).toBe('green')
    expect(mixColors('red', 'blue')).toBe('purple')
  })

  it('混色は順序に依らない', () => {
    expect(mixColors('yellow', 'red')).toBe('orange')
    expect(mixColors('blue', 'yellow')).toBe('green')
  })

  it('3原色そろうと茶になる', () => {
    expect(mixColors('orange', 'blue')).toBe('brown')
    expect(mixColors('green', 'red')).toBe('brown')
    expect(mixColors('purple', 'yellow')).toBe('brown')
  })

  it('同色どうしは変わらない', () => {
    expect(mixColors('red', 'red')).toBe('red')
    expect(mixColors('orange', 'orange')).toBe('orange')
  })

  it('既に含む原色を足しても変わらない', () => {
    expect(mixColors('orange', 'red')).toBe('orange')
    expect(mixColors('orange', 'yellow')).toBe('orange')
  })
})

describe('shiftColor', () => {
  it('色相環で1段ずれる', () => {
    expect(shiftColor('red')).toBe('orange')
    expect(shiftColor('orange')).toBe('yellow')
    expect(shiftColor('purple')).toBe('red')
  })
  it('環にない色はそのまま', () => {
    expect(shiftColor('brown')).toBe('brown')
    expect(shiftColor('white')).toBe('white')
  })
})

describe('isMixable', () => {
  it('空・白は混色に参加しない', () => {
    expect(isMixable('empty')).toBe(false)
    expect(isMixable('white')).toBe(false)
    expect(isMixable('red')).toBe(true)
    expect(isMixable('orange')).toBe(true)
  })
})
