import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, 'tests/browser/**'],
    env: {
      ALLOWED_WEB_ORIGINS: 'https://evileggs.vercel.app',
    },
  },
})
