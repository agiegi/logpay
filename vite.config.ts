import { readFileSync } from 'node:fs'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// About に出すバージョン。package.json と二重に持たないよう, ここで埋め込む
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8'))

// 版を上げ忘れても, いつのビルドかは分かるようにしておく。sv-SE は YYYY-MM-DD で出る
const buildDate = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date())

// https://vite.dev/config/
export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_DATE__: JSON.stringify(buildDate),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.png', 'apple-touch-icon.png'],
      workbox: {
        // ogp.png はリンクカード用。アプリ側では使わないのでキャッシュに入れない
        globIgnores: ['**/ogp.png'],
      },
      manifest: {
        name: 'LogPay — バイトの給料記録',
        short_name: 'LogPay',
        description: 'バイトの勤務を記録して, 次の給料日にもらう額とこれまでの支給額を確認する。',
        lang: 'ja',
        theme_color: '#fafaf9',
        background_color: '#fafaf9',
        display: 'standalone',
        start_url: '.',
        scope: '.',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: 'maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
})
