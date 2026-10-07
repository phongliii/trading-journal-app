import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config.js'

// Pin the timezone so date bucketing (local-time date-fns calls, naive
// broker timestamps) gives the same answers on every machine.
process.env.TZ = 'UTC'

export default mergeConfig(viteConfig, defineConfig({
  test: {
    include: ['src/**/*.test.js'],
  },
}))
