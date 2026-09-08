# Scheme Automation

A full-stack reference implementation of a **spreadsheet ingestion and pipeline-trigger tool**.
Business users drop Excel/CSV files into labelled slots; the app validates each file's column
headings against a BigQuery table schema, lets the user correct mismatches, uploads the files to
Google Cloud Storage, and triggers a downstream Cloud Run job — notifying by email.

> **Sanitized reference implementation.** This is a genericised version of a private project,
> published for reference. All credentials, infrastructure identifiers and organisation-specific
> naming have been removed. It is not affiliated with, endorsed by, or derived from the data of
> any organisation, and it ships with no working cloud configuration — you must supply your own.

## What it does

```
Spreadsheet  ->  Browser         ->  Column check   ->  Cloud Storage  ->  Cloud Run  ->  Email
on disk          reads headers       vs BigQuery         one folder         the actual     notify
                 stages locally      + rename UI         per slot           calculation
```

The app itself performs no business calculation. It validates, stores, and hands off.

**Features**

- 15 configurable upload slots across two independent pipelines, each with its own run lock
- Header extraction from `.xlsx` / `.xls` / `.csv` in the browser
- Column comparison against a BigQuery table schema, with fuzzy matching that tolerates
  differences in case, spacing, punctuation, trailing numbers and date fragments
- A rename UI for unmatched columns; the corrected copy is what gets uploaded
- Manual "adjustment" overrides with a generated mapping summary
- Drag-and-drop, multi-file slots, per-file progress, desktop and mobile layouts
- Files staged in IndexedDB so a closed tab doesn't lose work
- Email notification on trigger, success and failure

## Architecture

| Layer | Stack |
|---|---|
| Frontend | React 19, TypeScript, Vite (rolldown), Tailwind CSS 4, Redux Toolkit, Radix UI, `xlsx` |
| Backend | Node.js, Express 4, Multer, `@google-cloud/storage`, `@google-cloud/bigquery`, Nodemailer, Swagger UI |
| Cloud | Google Cloud Storage, BigQuery, Cloud Run, SMTP |

```
backend/
  index.js                    Express app
  routes/upload.routes.js     upload, run-process, process-status
  routes/bigquery.routes.js   schema comparison + row extraction
  config/{gcp,bigquery}.js    cloud clients
  utils/columnCleaner.js      header normalisation + matching
  utils/extractXlsxRows.js    workbook parsing
  utils/email/                notification templates
frontend/
  src/config/upload-slots.ts  slot definitions - start here
  src/page/pages/upload.tsx   main screen
  src/page/uploadHooks.ts     selection, validation, column check, upload
  src/page/columnCleaner.ts   client-side header normalisation
```

## Requirements

- Node.js 20+ (22 recommended — the Vite build requires 20 or newer)
- npm 10+
- A Google Cloud project with a GCS bucket, a BigQuery dataset, and optionally a Cloud Run service

## Setup

```bash
git clone https://github.com/MMC1410001/scheme-automation.git
cd scheme-automation

# Backend
cd backend && npm install && cp .env.example .env
# edit .env with your own values

# Frontend
cd ../frontend && npm install && cp .env.example .env.local
```

### Run

Two terminals:

```bash
cd backend && npm run dev        # API on :3000
cd frontend && npm run dev:local # UI on :5173
```

Open <http://localhost:5173>. Swagger UI is at <http://localhost:3000/api-docs>.

`npm run dev:local` proxies `/api` to `localhost:3000`. Plain `npm run dev` builds in production
mode and expects `VITE_API_URL` to point at a deployed backend.

## Configuration

All backend settings come from `backend/.env` — see `.env.example` for the full list.

| Variable | Purpose |
|---|---|
| `PORT` | API port. **No default** — the server binds a random port if unset. |
| `project_id`, `client_email`, `private_key` | Service-account credentials for GCS and BigQuery. Alternatively set `GOOGLE_APPLICATION_CREDENTIALS` to a key-file path. |
| `GCP_BUCKET_NAME` | Destination bucket for uploads. |
| `BQ_PROJECT_ID`, `BQ_DATASET_ID` | Where the column-validation schemas live. |
| `BQ_TABLE_MAP_JSON` | Optional JSON overriding the slot → table mapping. |
| `CLOUD_RUN_URL_NORMAL`, `CLOUD_RUN_URL_REVISED` | The two downstream jobs. `POST /api/run-process` returns **503** until these are set. |
| `RUN_ID_NORMAL`, `RUN_ID_REVISED` | Identifiers sent with each trigger. |
| `EMAIL_USERNAME`, `EMAIL_APP_PASS`, `EMAIL_TO` | SMTP sender and recipient list. Without these the app runs but sends no mail. |

`private_key` must stay on **one line** with escaped `\n` — the loader splits on the literal
two-character sequence.

Frontend variables are prefixed `VITE_` and are therefore **inlined into the client bundle**.
Do not put anything genuinely secret there.

## API

| Method | Route | Notes |
|---|---|---|
| `GET` | `/api/process-status` | Per-pipeline run flags |
| `GET` | `/api/bigquery/config` | Resolved project, dataset and slot→table map |
| `POST` | `/api/bigquery/compare-columns` | Compare uploaded headings to a table schema |
| `POST` | `/api/bigquery/extract-rows` | Parse rows from an uploaded workbook |
| `GET` | `/api/bigquery/probe` | Connectivity / permission check |
| `GET` | `/api/bigquery/debug-auth` | Resolved credential identity |
| `POST` | `/api/upload` | multipart `file` + `slot` + `module` → GCS |
| `POST` | `/api/run-process` | Trigger the downstream Cloud Run job |
| `GET` | `/api/test-connection` | Reachability of the configured Cloud Run service |

Files land at `<slot>/uncleaned/<filename>`, with special cases for `billing_extract`,
`missed_inbill`, `scheme_mapping` and anything matching "adjustment".

## Adding or changing a slot

Edit `frontend/src/config/upload-slots.ts` — each entry sets the label, the `bucketPath` (the GCS
folder), the accepted formats, the size cap, whether it is optional, whether it accepts multiple
files, and the `bigQueryTableId` used for column validation. Keep `bucketPath` in step with the
folder cases in `backend/routes/upload.routes.js` and the table map in `backend/config/bigquery.js`.

## Known limitations

Carried over from the original implementation and worth understanding before reuse:

- **No authentication.** Every route is open, including `POST /api/run-process`. Put this behind
  an authenticating proxy before exposing it.
- **The two debug endpoints are unauthenticated** and reveal credential identity.
- **The run lock is in-memory and has no timeout.** It clears when Cloud Run replies; if that
  never happens the pipeline stays locked until the process restarts. There is no server-side
  rejection of a concurrent duplicate run.
- **Staged files are never cleared automatically.** Browser-held files persist indefinitely, so a
  stale file can look identical to a fresh one.
- **The upload progress panel's first three steps are cosmetic delays.** Only the final step
  transfers anything; real validation happens at file-selection time.
- **`multer.memoryStorage()` with no size limit**, against slots that advertise 500 MB.
- **The two pipelines are labelled inconsistently** — the UI tab names and the internal
  `normal` / `revised` module names do not correspond. Worth renaming before building on this.
- No automated tests.

## License

MIT — see [LICENSE](LICENSE).
