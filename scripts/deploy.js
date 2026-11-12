import { execSync } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const zipPath = resolve(root, 'dist/LienNavigator-jobs-worker.zip')

const loadEnvFile = (filePath) => {
  if (!existsSync(filePath)) return
  for (const line of readFileSync(filePath, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (!(key in process.env) || process.env[key] === '') {
      process.env[key] = value
    }
  }
}

const envName = (process.argv[2] || 'dev').toLowerCase()
loadEnvFile(resolve(root, `.env.${envName}`))
loadEnvFile(resolve(root, '../liennavigator-backend/.env'))

const functionByEnv = {
  dev: process.env.JOBS_LAMBDA_FUNCTION_NAME_DEV || 'LienNavigator-jobs-dev',
  prod: process.env.JOBS_LAMBDA_FUNCTION_NAME_PROD || 'LienNavigator-jobs-prod',
}

const functionName = functionByEnv[envName]
if (!functionName) {
  console.error(`Unknown env "${envName}". Use: pnpm deploy:dev | pnpm deploy:prod`)
  process.exit(1)
}

const region = process.env.AWS_REGION || process.env.AWS_BUCKET_REGION || 'us-east-1'

if (!process.env.AWS_ACCESS_KEY_ID && process.env.AWS_ACCESS_KEY) {
  process.env.AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY
}
if (!process.env.AWS_SECRET_ACCESS_KEY && process.env.AWS_SECRET_KEY) {
  process.env.AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_KEY
}

console.log('Building worker from backend jobs entry…')
execSync('node scripts/build-zip.js', { cwd: root, stdio: 'inherit' })

if (!existsSync(zipPath)) {
  console.error(`Zip not found: ${zipPath}`)
  process.exit(1)
}

const zipMb = statSync(zipPath).size / (1024 * 1024)
console.log(`Deploying → ${functionName} (${region}) · zip ${zipMb.toFixed(1)} MB`)

// Direct upload works under ~70MB; larger packages need S3.
if (zipMb <= 65) {
  execSync(
    [
      'aws lambda update-function-code',
      `--function-name ${functionName}`,
      `--zip-file fileb://${zipPath}`,
      `--region ${region}`,
    ].join(' '),
    { cwd: root, stdio: 'inherit', env: process.env }
  )
} else {
  const bucket = process.env.JOBS_DEPLOY_BUCKET || process.env.JOBS_ARTIFACT_BUCKET
  if (!bucket) {
    console.error('Zip is large; set JOBS_DEPLOY_BUCKET for S3 deploy')
    process.exit(1)
  }
  const s3Key = `LienNavigator/lambda-deploys/${functionName}/${Date.now()}.zip`
  console.log(`Uploading zip to s3://${bucket}/${s3Key}`)
  execSync(`aws s3 cp "${zipPath}" "s3://${bucket}/${s3Key}" --region ${region}`, {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
  })
  execSync(
    [
      'aws lambda update-function-code',
      `--function-name ${functionName}`,
      `--s3-bucket ${bucket}`,
      `--s3-key ${s3Key}`,
      `--region ${region}`,
    ].join(' '),
    { cwd: root, stdio: 'inherit', env: process.env }
  )
}

console.log('Deploy complete.')
console.log('Handler must be: index.handler')
console.log(`Set Lambda env from .env.${envName} (Mongo, API2PDF, AWS, JOBS_ARTIFACT_*)`)
