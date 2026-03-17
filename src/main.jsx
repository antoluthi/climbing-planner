import React from 'react'
import ReactDOM from 'react-dom/client'
import { Analytics } from '@vercel/analytics/react'
import ClimbingPlanner from './climbing-planner'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ClimbingPlanner />
    <Analytics />
  </React.StrictMode>
)
