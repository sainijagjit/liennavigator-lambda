import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

test('backend sibling exists for worker packaging', () => {
  const backend = resolve(dirname(fileURLToPath(import.meta.url)), '../../liennavigator-backend')
  assert.equal(existsSync(backend), true)
})
