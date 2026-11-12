# LienNavigator Lambda

Deploys the **job worker** that runs bulk work inside Lambda.

## Correct architecture

```text
FE → API creates job → invoke Lambda({ jobId }) → 202 { jobId }
              ↓
     Lambda runs processJob(jobId)
              ↓
     handlers[job.type] (PDFs via API2PDF, zip, S3)
              ↓
FE polls GET /jobs/:id → signed download URL
```

- API: validate, create job, enqueue only  
- Lambda: **does the work** (not an HTTP callback to the API)  
- New jobs: add runner in backend `modules/jobs/runners/` + redeploy worker  

## Deploy

Needs sibling `../liennavigator-backend` and AWS CLI.

```bash
pnpm deploy:dev
pnpm deploy:prod
pnpm zip
```

**AWS handler:** `index.handler`  
**Timeout:** 5 minutes · **Memory:** 1024 MB+

## Lambda environment (Dev + Prod)

| File | AWS function | S3 prefix |
|---|---|---|
| `.env.dev` | `LienNavigator-jobs-dev` | `LienNavigator/jobs/dev` |
| `.env.prod` | `LienNavigator-jobs-prod` | `LienNavigator/jobs/prod` |

Fill each file, then paste into that function’s **Configuration → Environment variables**.

```bash
MONGODB_URI=
API2PDF_KEY=
JOBS_ARTIFACT_BUCKET=liennavigator-private-bucket
JOBS_ARTIFACT_PREFIX=LienNavigator/jobs/dev   # or .../prod
```

Do **not** set `AWS_REGION` / `AWS_ACCESS_KEY` on Lambda (reserved). S3 uses the function role.


## Backend `.env`

```bash
ENABLE_BACKGROUND_JOBS=false
JOBS_LAMBDA_FUNCTION_NAME=LienNavigator-jobs-dev
JOBS_ARTIFACT_BUCKET=liennavigator-private-bucket
JOBS_ARTIFACT_PREFIX=LienNavigator/jobs/dev
API2PDF_KEY=   # already used for sync certs
```

Local day-to-day: keep `ENABLE_BACKGROUND_JOBS=false` (sync zip).  
To use Lambda: `ENABLE_BACKGROUND_JOBS=true` (and do **not** set `JOBS_RUN_INLINE`).
