// 画面描画とユーザー操作

import { COLOR_HEX, COLOR_LABEL, ColorName } from './colors'
import {
  calcStars,
  collect,
  createGame,
  GameState,
  neighbors,
  place,
  slide,
} from './game'
import { getStage, getStages, TOTAL_STAGES } from './stages'
import { getStars, isUnlocked, loadProgress, recordStars, saveProgress } from './storage'
import {
  isSoundOn,
  playChain,
  playClear,
  playCollect,
  playFail,
  playMix,
  playPlace,
  toggleSound,
} from './sound'

let root: HTMLElement
let game: GameState | null = null
let currentStageId = 0
let selHand: number | null = null
let selCell: number | null = null
let changedCells: Set<number> = new Set()

export function startApp(el: HTMLElement): void {
  root = el
  if (!loadProgress().stars[0] && localStorage.getItem('color-mix-palette/seen-rules') !== '1') {
    showRules(() => showStageSelect())
  } else {
    showStageSelect()
  }
}

// ---------- 小さな DOM ヘルパ ----------
function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  children: (Node | string)[] = []
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v
    else e.setAttribute(k, v)
  }
  for (const c of children) e.append(c)
  return e
}

function clear(): void {
  root.replaceChildren()
}

function styleSwatch(color: ColorName): string {
  if (color === 'empty') return 'transparent'
  return COLOR_HEX[color]
}

// ---------- ステージ選択 ----------
function showStageSelect(): void {
  game = null
  clear()
  const stages = getStages()
  const totalStars = stages.reduce((sum, s) => sum + getStars(s.id), 0)

  const bar = h('div', { class: 'title-bar' }, [
    h('h1', {}, ['色まぜパレット']),
    h('div', { class: 'hud-mini' }, [`⭐ ${totalStars} / ${TOTAL_STAGES * 3}`]),
  ])

  const grid = h('div', { class: 'stage-grid' })
  for (const s of stages) {
    const unlocked = isUnlocked(s.id)
    const stars = getStars(s.id)
    const cell = h('div', { class: `stage-cell${unlocked ? '' : ' locked'}` })
    if (unlocked) {
      cell.append(
        h('div', { class: 'num' }, [String(s.id)]),
        h('div', { class: 'stars' }, [stars > 0 ? '★'.repeat(stars) : ''])
      )
      cell.addEventListener('click', () => openStage(s.id))
    } else {
      cell.append(h('div', { class: 'lock' }, ['🔒']))
    }
    grid.append(cell)
  }

  const help = h('button', { class: 'btn ghost' }, ['遊び方を見る'])
  help.addEventListener('click', () => showRules(() => showStageSelect()))

  root.append(bar, grid, help)
}

// ---------- ゲーム画面 ----------
function openStage(id: number): void {
  const stage = getStage(id)
  if (!stage) return
  currentStageId = id
  game = createGame(stage)
  selHand = null
  selCell = null
  changedCells = new Set()
  renderGame()
}

function renderGame(): void {
  if (!game) return
  clear()
  const stage = getStage(currentStageId)!

  // HUD
  const back = h('button', { class: 'btn icon ghost' }, ['‹ 戻る'])
  back.addEventListener('click', () => showStageSelect())
  const soundBtn = h('button', { class: 'btn icon ghost' }, [isSoundOn() ? '🔊' : '🔇'])
  soundBtn.addEventListener('click', () => {
    toggleSound()
    soundBtn.textContent = isSoundOn() ? '🔊' : '🔇'
  })
  const movesLeft = game.maxMoves - game.moves
  const movesEl = h('div', { class: 'moves' }, [
    '手数 ',
    h('span', { class: movesLeft <= 1 ? 'danger' : '' }, [`${game.moves} / ${game.maxMoves}`]),
  ])
  const hud = h('div', { class: 'hud' }, [
    h('div', {}, [back]),
    h('div', { class: 'stage-name' }, [`#${stage.id} ${stage.title}`]),
    movesEl,
    soundBtn,
  ])

  // 目標パレット
  const targetGrid = h('div', { class: 'grid target' })
  setGridCols(targetGrid, game.cols)
  for (let i = 0; i < game.target.length; i++) {
    const color = game.target[i]
    const t = h('div', {
      class: `tile target-tile${color === 'empty' ? ' empty' : ''}${color === 'white' ? ' white' : ''}`,
    })
    t.style.background = styleSwatch(color)
    targetGrid.append(t)
  }
  const targetPanel = h('div', { class: 'panel' }, [
    h('div', { class: 'label' }, ['目標パレット']),
    targetGrid,
  ])

  // ボード
  const boardGrid = h('div', { class: 'grid' })
  setGridCols(boardGrid, game.cols)
  for (let i = 0; i < game.cells.length; i++) {
    boardGrid.append(buildBoardTile(i))
  }
  const boardPanel = h('div', { class: 'panel' }, [boardGrid])

  // 手持ち
  const hand = h('div', { class: 'hand' })
  if (game.hand.length === 0) {
    hand.append(h('div', { class: 'hand-empty' }, ['手持ちなし']))
  }
  game.hand.forEach((color, idx) => {
    const ht = h('div', { class: `hand-tile${selHand === idx ? ' selected' : ''}` }, [
      COLOR_LABEL[color],
    ])
    ht.style.background = COLOR_HEX[color]
    ht.addEventListener('click', () => {
      selHand = selHand === idx ? null : idx
      selCell = null
      renderGame()
    })
    hand.append(ht)
  })
  const handPanel = h('div', { class: 'panel' }, [
    h('div', { class: 'label' }, ['手持ちタイル']),
    hand,
  ])

  // ヒント＆ツールバー
  const hint = h('div', { class: 'hint' }, [stage.hint])
  const retry = h('button', { class: 'btn' }, ['やり直す'])
  retry.addEventListener('click', () => openStage(currentStageId))
  const toolbar = h('div', { class: 'toolbar' }, [retry])

  root.append(hud, targetPanel, boardPanel, handPanel, hint, toolbar)
}

function setGridCols(el: HTMLElement, cols: number): void {
  el.style.gridTemplateColumns = `repeat(${cols}, 1fr)`
}

function buildBoardTile(i: number): HTMLElement {
  const cell = game!.cells[i]
  const movable = !cell.fixed && cell.color !== 'empty' && cell.color !== 'white'
  const classes = ['tile']
  if (cell.color === 'empty') classes.push('empty')
  if (cell.color === 'white') classes.push('white')
  if (movable) classes.push('movable')
  if (selCell === i) classes.push('selected')
  if (changedCells.has(i)) classes.push('just-changed')
  // 選択中タイルの移動先候補をハイライト
  if (selCell !== null && cell.color === 'empty' && neighbors(game!, selCell).includes(i)) {
    classes.push('placeable-hint')
  }

  const t = h('div', { class: classes.join(' ') })
  t.style.background = styleSwatch(cell.color)

  // ギミックのマーカー
  const marker = gimmickMarker(i)
  if (marker) t.append(h('span', { class: 'marker' }, [marker]))
  if (cell.fixed && cell.color !== 'white') t.append(h('span', { class: 'lock' }, ['🔒']))
  if (cell.timer !== null) t.append(h('span', { class: 'marker' }, [`⏱${cell.timer}`]))

  attachTileHandlers(t, i)
  return t
}

function gimmickMarker(i: number): string {
  if (!game) return ''
  if (game.bleed.has(i)) return '💧'
  if (game.catalyst.has(i)) return '🧪'
  if (game.warp.has(i)) return '🔀'
  if (game.timedCells.has(i)) return '⏱'
  return ''
}

// ---------- 操作 ----------
function attachTileHandlers(el: HTMLElement, i: number): void {
  let pressTimer: number | null = null
  let longPressed = false

  el.addEventListener('pointerdown', () => {
    longPressed = false
    const cell = game!.cells[i]
    const isPrimary = cell.color === 'red' || cell.color === 'yellow' || cell.color === 'blue'
    if (!cell.fixed && isPrimary) {
      pressTimer = window.setTimeout(() => {
        longPressed = true
        doCollect(i)
      }, 500)
    }
  })
  const cancel = () => {
    if (pressTimer !== null) {
      clearTimeout(pressTimer)
      pressTimer = null
    }
  }
  el.addEventListener('pointerup', () => {
    cancel()
    if (!longPressed) handleTap(i)
  })
  el.addEventListener('pointerleave', cancel)
  el.addEventListener('pointercancel', cancel)
}

function handleTap(i: number): void {
  if (!game || game.status !== 'playing') return
  const cell = game.cells[i]

  // 手持ち選択中 → 空マスに置く
  if (selHand !== null && cell.color === 'empty') {
    doPlace(selHand, i)
    return
  }

  const movable = !cell.fixed && cell.color !== 'empty' && cell.color !== 'white'

  // タイル選択中 → 隣の空マスへスライド
  if (selCell !== null && cell.color === 'empty') {
    if (neighbors(game, selCell).includes(i)) {
      doSlide(selCell, i)
    } else {
      selCell = null
      renderGame()
    }
    return
  }

  // 盤上タイルを選ぶ／選び直す
  if (movable) {
    selCell = selCell === i ? null : i
    selHand = null
    renderGame()
    return
  }

  // それ以外は選択解除
  selHand = null
  selCell = null
  renderGame()
}

function snapshot(): ColorName[] {
  return game!.cells.map((c) => c.color)
}

function diff(before: ColorName[]): Set<number> {
  const s = new Set<number>()
  for (let i = 0; i < before.length; i++) {
    if (before[i] !== game!.cells[i].color) s.add(i)
  }
  return s
}

function afterAction(before: ColorName[], placed: number): void {
  const changed = diff(before)
  changedCells = changed
  // サウンド：混色の度合いに応じて鳴らし分け
  const mixedCount = changed.size - (changed.has(placed) ? 1 : 0)
  if (mixedCount >= 2) playChain(mixedCount + 1)
  else if (mixedCount >= 1) playMix()

  if (game!.status === 'cleared') {
    const stars = calcStars(game!)
    recordStars(currentStageId, stars)
    setTimeout(() => playClear(), 120)
    selHand = null
    selCell = null
    renderGame()
    setTimeout(() => showClear(stars), 400)
    return
  }
  if (game!.status === 'failed') {
    setTimeout(() => playFail(), 120)
    selHand = null
    selCell = null
    renderGame()
    setTimeout(() => showFail(), 400)
    return
  }
  selHand = null
  selCell = null
  renderGame()
}

function doPlace(handIdx: number, cellIdx: number): void {
  const before = snapshot()
  if (place(game!, handIdx, cellIdx)) {
    playPlace()
    afterAction(before, cellIdx)
  }
}

function doSlide(from: number, to: number): void {
  const before = snapshot()
  if (slide(game!, from, to)) {
    playPlace()
    afterAction(before, to)
  }
}

function doCollect(i: number): void {
  const before = snapshot()
  if (collect(game!, i)) {
    playCollect()
    afterAction(before, i)
  }
}

// ---------- モーダル ----------
function overlay(modal: HTMLElement): HTMLElement {
  const ov = h('div', { class: 'overlay' }, [modal])
  document.body.append(ov)
  return ov
}

function showClear(stars: number): void {
  const starsEl = h('div', { class: 'big-stars' })
  for (let i = 0; i < 3; i++) {
    starsEl.append(h('span', { class: i < stars ? 'star-on' : 'star-off' }, ['★']))
  }
  const next = h('button', { class: 'btn primary' }, ['次のステージ ›'])
  const sel = h('button', { class: 'btn' }, ['ステージ一覧'])
  const hasNext = currentStageId < TOTAL_STAGES

  const modal = h('div', { class: 'modal' }, [
    h('h2', {}, ['クリア！']),
    starsEl,
    h('p', {}, [`手数: ${game!.moves}　星${stars}つ獲得`]),
    h('div', { class: 'actions' }, hasNext ? [sel, next] : [sel]),
  ])
  const ov = overlay(modal)
  sel.addEventListener('click', () => {
    ov.remove()
    showStageSelect()
  })
  next.addEventListener('click', () => {
    ov.remove()
    openStage(currentStageId + 1)
  })
}

function showFail(): void {
  const retry = h('button', { class: 'btn primary' }, ['もう一度'])
  const sel = h('button', { class: 'btn' }, ['ステージ一覧'])
  const modal = h('div', { class: 'modal' }, [
    h('h2', {}, ['ざんねん…']),
    h('p', {}, ['手数が足りなくなりました。配色をよく見て、最短ルートを探そう。']),
    h('div', { class: 'actions' }, [sel, retry]),
  ])
  const ov = overlay(modal)
  retry.addEventListener('click', () => {
    ov.remove()
    openStage(currentStageId)
  })
  sel.addEventListener('click', () => {
    ov.remove()
    showStageSelect()
  })
}

function ruleRow(color: ColorName, text: string): HTMLElement {
  const sw = h('div', { class: 'swatch' })
  sw.style.background = COLOR_HEX[color]
  return h('div', { class: 'rule-row' }, [sw, h('span', {}, [text])])
}

function showRules(onClose: () => void): void {
  const ok = h('button', { class: 'btn primary' }, ['はじめる'])
  const modal = h('div', { class: 'modal' }, [
    h('h2', {}, ['遊び方']),
    h('p', {}, ['手持ちの色タイルを置いて、目標パレットと同じ配色を完成させよう。']),
    ruleRow('orange', '赤 + 黄 = 橙'),
    ruleRow('green', '黄 + 青 = 緑'),
    ruleRow('purple', '赤 + 青 = 紫'),
    ruleRow('brown', '3色混ぜると茶（失敗色）になるので注意'),
    h('p', { style: 'margin-top:12px' }, [
      'タイルをとなり合わせると自動で混ざります。一次色（赤・黄・青）は長押しで回収できます。決められた手数内にクリアすると星がもらえます。',
    ]),
    h('div', { class: 'actions' }, [ok]),
  ])
  const ov = overlay(modal)
  ok.addEventListener('click', () => {
    localStorage.setItem('color-mix-palette/seen-rules', '1')
    const p = loadProgress()
    saveProgress(p)
    ov.remove()
    onClose()
  })
}
