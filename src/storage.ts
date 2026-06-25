// LocalStorage によるステージ進捗・スター評価の保存

const KEY = 'color-mix-palette/progress/v1'

export interface Progress {
  stars: Record<number, number> // stageId -> 0〜3
  soundOn: boolean
}

function defaults(): Progress {
  return { stars: {}, soundOn: true }
}

export function loadProgress(): Progress {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return defaults()
    const parsed = JSON.parse(raw) as Partial<Progress>
    return {
      stars: parsed.stars ?? {},
      soundOn: parsed.soundOn ?? true,
    }
  } catch {
    return defaults()
  }
}

export function saveProgress(p: Progress): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p))
  } catch {
    // 保存に失敗してもゲームは続行できる
  }
}

/** 過去のベスト評価を超えた場合のみ更新して保存する。 */
export function recordStars(stageId: number, stars: number): Progress {
  const p = loadProgress()
  if ((p.stars[stageId] ?? 0) < stars) {
    p.stars[stageId] = stars
    saveProgress(p)
  }
  return p
}

export function getStars(stageId: number): number {
  return loadProgress().stars[stageId] ?? 0
}

/** そのステージが解放されているか（ステージ1は常時、以降は前を1つでもクリア）。 */
export function isUnlocked(stageId: number): boolean {
  if (stageId <= 1) return true
  return (loadProgress().stars[stageId - 1] ?? 0) > 0
}

export function setSound(on: boolean): void {
  const p = loadProgress()
  p.soundOn = on
  saveProgress(p)
}
