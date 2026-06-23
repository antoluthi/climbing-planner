import React from 'react'
import ReactDOM from 'react-dom/client'
import { Analytics } from '@vercel/analytics/react'
import { AuthProvider } from './context/AuthProvider'
import ClimbingPlanner from './climbing-planner-new'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <ClimbingPlanner />
    </AuthProvider>
    <Analytics />
  </React.StrictMode>
)
