import React from 'react'
import ReactDOM from 'react-dom/client'
import { NotchApp } from './NotchApp'
import '../index.css'

ReactDOM.createRoot(document.getElementById('notch-root')!).render(
  <React.StrictMode>
    <NotchApp />
  </React.StrictMode>,
)
