import './style.css'
import { initSound } from './sound'
import { startApp } from './ui'

initSound()

const el = document.querySelector<HTMLDivElement>('#app')
if (el) startApp(el)
