import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['logo.png', 'icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'FinBank – Ouverture de compte', short_name: 'FinBank Onboarding', lang: 'fr',
        theme_color: '#0B2D63', background_color: '#F4F6FA', display: 'standalone', orientation: 'any', start_url: '/',
        icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }, { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }],
      },
      workbox: { navigateFallback: '/index.html', navigateFallbackDenylist: [/^\/api\//], globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
        runtimeCaching: [{ urlPattern: /\/api\/catalog\//, handler: 'StaleWhileRevalidate', options: { cacheName: 'catalog' } }] },
    }),
  ],
  server: { port: 5173, proxy: { '/api': 'http://localhost:8080' } },
  test: { environment: 'jsdom', include: ['src/**/*.test.ts'] },
} as any)
