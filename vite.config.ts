import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const environment = loadEnv(mode, process.cwd(), '')
  const proxyTarget = (
    environment.VITE_GAME_HTTP_PROXY_TARGET ||
    environment.VITE_COLYSEUS_URL ||
    'http://localhost:2567'
  )
    .replace(/^ws:/, 'http:')
    .replace(/^wss:/, 'https:')

  return {
    plugins: [react()],
    server: {
      proxy: {
        '/game-server': {
          target: proxyTarget,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/game-server/, ''),
        },
      },
    },
  }
})
