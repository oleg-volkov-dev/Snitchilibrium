import { build } from 'vite'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const directory = await mkdtemp(join(tmpdir(), 'snitchilibrium-tests-'))
try {
  await build({
    configFile: false,
    logLevel: 'error',
    build: {
      ssr: 'tests/simulation.test.ts',
      outDir: directory,
      rollupOptions: { output: { format: 'cjs', entryFileNames: 'tests.cjs' } },
    },
    ssr: { noExternal: ['zustand', 'react', 'use-sync-external-store'] },
  })
  const result = spawnSync(process.execPath, ['--test', join(directory, 'tests.cjs')], { stdio: 'inherit' })
  process.exitCode = result.status ?? 1
} finally {
  await rm(directory, { recursive: true, force: true })
}
