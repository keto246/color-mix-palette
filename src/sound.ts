// 効果音（Web Audio API でその場合成）
//
// 外部音源ファイルを用意しなくても鳴らせるよう、オシレーターで合成する。
// 仕様書のサウンド設計（配置・混色・連鎖・クリア・失敗）に対応。

import { loadProgress, setSound } from './storage'

let ctx: AudioContext | null = null
let enabled = true

export function initSound(): void {
  enabled = loadProgress().soundOn
}

export function isSoundOn(): boolean {
  return enabled
}

export function toggleSound(): boolean {
  enabled = !enabled
  setSound(enabled)
  return enabled
}

function audio(): AudioContext | null {
  if (!enabled) return null
  if (!ctx) {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return null
    ctx = new Ctor()
  }
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

function tone(freq: number, start: number, dur: number, type: OscillatorType, gain: number): void {
  const ac = audio()
  if (!ac) return
  const osc = ac.createOscillator()
  const g = ac.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, ac.currentTime + start)
  g.gain.setValueAtTime(0.0001, ac.currentTime + start)
  g.gain.exponentialRampToValueAtTime(gain, ac.currentTime + start + 0.01)
  g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + start + dur)
  osc.connect(g).connect(ac.destination)
  osc.start(ac.currentTime + start)
  osc.stop(ac.currentTime + start + dur + 0.02)
}

/** タイル配置：軽いポンッ */
export function playPlace(): void {
  tone(420, 0, 0.12, 'triangle', 0.18)
}

/** 混色発生：シュワッと溶ける */
export function playMix(): void {
  tone(620, 0, 0.18, 'sine', 0.15)
  tone(820, 0.04, 0.16, 'sine', 0.1)
}

/** 連鎖混色：テンポよく重なる */
export function playChain(depth: number): void {
  const base = 500
  const steps = Math.min(depth, 5)
  for (let i = 0; i < steps; i++) {
    tone(base + i * 120, i * 0.06, 0.12, 'sine', 0.12)
  }
}

/** クリア：明るいファンファーレ */
export function playClear(): void {
  const notes = [523.25, 659.25, 783.99, 1046.5] // C5 E5 G5 C6
  notes.forEach((f, i) => tone(f, i * 0.12, 0.28, 'triangle', 0.2))
}

/** 失敗（茶色生成・手数切れ）：くぐもった低音 */
export function playFail(): void {
  tone(180, 0, 0.4, 'sawtooth', 0.16)
  tone(120, 0.05, 0.4, 'sine', 0.14)
}

/** タイル回収：小さなクリック */
export function playCollect(): void {
  tone(300, 0, 0.08, 'square', 0.1)
}
