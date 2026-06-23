import React from 'react'
import ReactDOM from 'react-dom/client'
import { Analytics } from '@vercel/analytics/react'
import { AuthProvider } from './context/AuthProvider'
import { DataProvider } from './context/DataProvider'
import ClimbingPlanner from './climbing-planner-new'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <DataProvider>
        <ClimbingPlanner />
      </DataProvider>
    </AuthProvider>
    <Analytics />
  </React.StrictMode>
)
