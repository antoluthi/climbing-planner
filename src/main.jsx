import React from 'react'
import ReactDOM from 'react-dom/client'
import { Analytics } from '@vercel/analytics/react'
import { AuthProvider } from './context/AuthProvider'
import App from './App'
import { initNativeApp, isNative } from './lib/native.js'
import './assets/fonts/fonts.css'
import './index.css'

// APK Capacitor : deep link d'auth (magic link) + bouton retour Android.
// No-op sur le web.
initNativeApp()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
    {/* Vercel Analytics : uniquement sur le web (dans l'APK, le script
        _vercel/insights n'existe pas → 404 inutile) */}
    {!isNative && <Analytics />}
  </React.StrictMode>
)
