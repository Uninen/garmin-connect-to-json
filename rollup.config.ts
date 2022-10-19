import json from '@rollup/plugin-json'
import typescript from '@rollup/plugin-typescript'

export default {
  input: 'src/index.ts',
  output: {
    file: 'bin/index.js',
    format: 'cjs',
  },
  plugins: [typescript(), json()],
  external: [
    'commander',
    'dayjs',
    'dotenv',
    'node:fs/promises',
    'node:zlib',
    'playwright-chromium',
    'rambda',
    'dayjs/plugin/timezone',
    'dayjs/plugin/utc',
  ],
}
