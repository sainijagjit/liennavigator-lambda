import { execSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Package a slim backend job worker so Lambda runs processJob in-process.
 */
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const backendRoot = resolve(root, '../liennavigator-backend')
const staging = resolve(root, '.deploy-staging')
const dist = resolve(root, 'dist')
const zipPath = resolve(dist, 'LienNavigator-jobs-worker.zip')

if (!existsSync(backendRoot)) {
  console.error(`Backend not found at ${backendRoot}`)
  process.exit(1)
}

rmSync(staging, { recursive: true, force: true })
mkdirSync(staging, { recursive: true })
mkdirSync(dist, { recursive: true })

const copyPaths = [
  'auth',
  'modules/jobs',
  'modules/report',
  'modules/property',
  'modules/title',
  'database',
  'services',
  'utils',
  'middleware',
]

for (const rel of copyPaths) {
  const from = resolve(backendRoot, rel)
  if (!existsSync(from)) {
    console.error(`Missing required backend path: ${rel}`)
    process.exit(1)
  }
  cpSync(from, resolve(staging, rel), { recursive: true })
}

// Certs use API2PDF — strip local wkhtmltopdf binaries
rmSync(resolve(staging, 'utils/lib'), { recursive: true, force: true })

const backendPkg = JSON.parse(readFileSync(resolve(backendRoot, 'package.json'), 'utf8'))
const pick = (name) => {
  const version = backendPkg.dependencies?.[name]
  if (!version) {
    console.error(`Missing dependency in backend package.json: ${name}`)
    process.exit(1)
  }
  return version
}

// Runtime deps pulled in by the job worker require graph (keeps zip under Lambda limits)
const workerPkg = {
  name: 'liennavigator-jobs-worker',
  private: true,
  version: '1.0.0',
  dependencies: {
    '@aws-sdk/client-eventbridge': pick('@aws-sdk/client-eventbridge'),
    '@aws-sdk/client-lambda': pick('@aws-sdk/client-lambda'),
    '@aws-sdk/client-s3': pick('@aws-sdk/client-s3'),
    '@aws-sdk/client-sqs': pick('@aws-sdk/client-sqs'),
    '@aws-sdk/s3-request-presigner': pick('@aws-sdk/s3-request-presigner'),
    axios: pick('axios'),
    dotenv: pick('dotenv'),
    'expo-server-sdk': pick('expo-server-sdk'),
    express: pick('express'),
    'firebase-admin': pick('firebase-admin'),
    handlebars: pick('handlebars'),
    joi: pick('joi'),
    jszip: pick('jszip'),
    lodash: pick('lodash'),
    moment: pick('moment'),
    'moment-timezone': pick('moment-timezone'),
    mongoose: pick('mongoose'),
    multer: pick('multer'),
    'pdf-merger-js': pick('pdf-merger-js'),
    'promise-limit': pick('promise-limit'),
    resend: pick('resend'),
    'to-words': pick('to-words'),
    xlsx: pick('xlsx'),
  },
}

writeFileSync(resolve(staging, 'package.json'), `${JSON.stringify(workerPkg, null, 2)}\n`)
writeFileSync(
  resolve(staging, 'index.js'),
  "module.exports = require('./modules/jobs/lambdaHandler')\n"
)

console.log('Installing slim production dependencies…')
execSync('npm install --omit=dev --no-fund --no-audit', {
  cwd: staging,
  stdio: 'inherit',
})

if (existsSync(zipPath)) rmSync(zipPath)

console.log('Creating zip…')
// Do not use broad "*test*" — it matches paths like moment-timezone/.../latest.json
// Keep utils/wkhtmltopdf.js (require target); binaries under utils/lib are already removed.
execSync(
  [
    `zip -qr "${zipPath}" .`,
    '-x "*.git*"',
    '-x "*/*.test.js"',
    '-x "*/*.test.cjs"',
    '-x "*/test/*"',
    '-x "*/tests/*"',
    '-x "*/__tests__/*"',
    '-x "*.map"',
  ].join(' '),
  { cwd: staging, stdio: 'inherit' }
)

rmSync(staging, { recursive: true, force: true })

const sizeMb = (statSync(zipPath).size / (1024 * 1024)).toFixed(1)
console.log(`Created ${zipPath} (${sizeMb} MB)`)
console.log('AWS handler: index.handler')
