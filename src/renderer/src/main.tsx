import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MotionConfig } from 'framer-motion'
import App from './App'
import './index.css'

const container = document.getElementById('root')
if (!container) {
  throw new Error('找不到 #root 挂载点')
}

// reducedMotion="user"：系统开了「减少动态效果」时，framer-motion 自动跳过位移/缩放类动画，
// 只保留淡入淡出。全应用配这一次就够，不用在每个组件上写 useReducedMotion。
createRoot(container).render(
  <StrictMode>
    <MotionConfig reducedMotion="user">
      <App />
    </MotionConfig>
  </StrictMode>
)
