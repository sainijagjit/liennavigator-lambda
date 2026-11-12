import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

test('backend jobs lambda entry exists', () => {
  const handler = resolve(
    dirname(fileURLToPath(import.meta.url)),
    '../../liennavigator-backend/modules/jobs/lambdaHandler.js'
  )
  assert.equal(existsSync(handler), true)
})
