import process from 'node:process'
import { execSync } from 'node:child_process'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Version affichée dans l'app (pied du profil) : en CI c'est APK_VERSION_NAME
// (= 1.0.<numéro de run>, identique au versionName de l'APK) ; en local ou sur
// Vercel on retombe sur le SHA court du commit buildé.
function appVersion() {
  if (process.env.APK_VERSION_NAME) return process.env.APK_VERSION_NAME
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim()
  } catch {
    return 'dev'
  }
}

// Le build APK utilise `vite build --mode capacitor` (script cap:sync) :
// le service worker PWA y est désactivé — dans la WebView Capacitor il est
// inutile (assets locaux) et risque de servir des assets périmés après une
// mise à jour de l'app.
export default defineConfig(({ mode }) => ({
  define: {
    __APP_VERSION__: JSON.stringify(appVersion()),
    // 0 hors CI (build local ou web) : aucune comparaison de version possible,
    // la vérification de mise à jour se désactive d'elle-même.
    __APP_VERSION_CODE__: JSON.stringify(Number(process.env.APK_VERSION_CODE) || 0),
  },
  plugins: [
    react(),
    VitePWA({
      disable: mode === 'capacitor',
      registerType: 'autoUpdate',
      workbox: {
        // Exclude HTML from precache so navigation always fetches fresh from network.
        // JS/CSS assets are fingerprinted by Vite so caching them is safe.
        globPatterns: ['**/*.{js,css,ico,png,svg,woff,woff2}'],
        navigateFallback: null,
        runtimeCaching: [
          {
            // Always fetch the app shell (HTML) from network first.
            // This ensures users always run the latest deployed code,
            // preventing stale SW cache from serving old JS after a deployment.
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'html-cache',
              networkTimeoutSeconds: 5,
            },
          },
        ],
      },
      manifest: {
        name: 'Climbing Planner',
        short_name: 'Planif',
        description: 'Planificateur d\'entraînement escalade',
        theme_color: '#ffffff',
        background_color: '#fafafa',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      }
    })
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Recharts (+ d3) pèse lourd : chunk séparé, chargé en parallèle et
          // caché indépendamment du bundle applicatif.
          recharts: ['recharts'],
        },
      },
    },
  },
}))
