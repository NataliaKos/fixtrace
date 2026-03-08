# FixTrace — Live UI Refactor & Performance Debug Agent

> Show your app. Talk to the agent. Get code fixes.

A multimodal AI agent powered by **Gemini 2.0 Flash** that lets frontend developers upload screenshots and performance reports, then chat in real-time to get concrete UI refactors, performance fixes, and actionable task plans.

## Features

- **📸 UI Refactor** — Upload a screenshot → get accessibility, UX, and code refactor suggestions ranked by severity
- **⚡ Performance Debugger** — Upload a Lighthouse JSON or DevTools trace → get Core Web Vitals diagnosis and Angular-specific fixes
- **🎤 Live Agent** — Chat with the AI agent via text (voice capture ready); attach files directly in the conversation

COMMING SOON:
- **📋 Issues Board** — Collapsible issues with severity badges, location context, and code snippets

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Angular 21 (standalone, signals), Tailwind CSS v4, DaisyUI |
| Backend | Node.js, TypeScript, Express 5 |
| AI | Gemini 2.0 Flash, Google GenAI SDK (`@google/genai`) |
| Cloud | Google Cloud Run, Cloud Storage |
| DevOps | Docker, Cloud Build, Terraform |

## Repository Structure

```
fixtrace/
├── frontend/          # Angular 21 app
│   └── src/app/
│       ├── pages/     # home / ui-refactor / performance-debugger / live-session
│       ├── components/ # file-upload / issues-list
│       ├── services/  # api.service / voice.service
│       └── models/    # interfaces.ts
├── backend/           # Express + Gemini GenAI
│   └── src/
│       ├── routes/    # upload / ui-analyze / perf-analyze / live-session
│       ├── services/  # gemini / storage / ui-analysis / perf-analysis / live-session
│       └── prompts/   # ui-refactor / perf-debug
├── infra/
│   ├── cloudbuild.yaml   # CI/CD automation
│   ├── deploy.sh         # Manual deploy
│   └── terraform/        # IaC (Cloud Run + Storage)
└── README.md
```

## Quick Start

### Prerequisites

- Node.js 20+
- A Google Cloud project with **Vertex AI API**, **Cloud Storage API**, and **Cloud Run API** enabled
- A GCS bucket: `fixtrace-uploads-<your-project-id>`
- Service account with `Vertex AI User` + `Storage Object Admin` roles (for local dev)

### Backend

```bash
cd backend
cp .env.example .env
# Edit .env: set GOOGLE_CLOUD_PROJECT, GCS_BUCKET_NAME, GEMINI_API_KEY
npm install
npm run dev        # ts-node-dev hot-reload on :8080
```

### Frontend

```bash
cd frontend
npm install
npm start          # Angular dev server on :4200
```

Open http://localhost:4200 in your browser.

### Deploy to GCP

```bash
cd infra
chmod +x deploy.sh
./deploy.sh your-project-id
```

Or with Terraform:

```bash
cd infra/terraform
terraform init
terraform apply -var="project_id=your-project-id"
```

## API Reference

| Endpoint | Method | Input | Output |
|----------|--------|-------|--------|
| `/health` | GET | — | `{ status, timestamp }` |
| `/api/upload` | POST | `multipart: file` | `UploadResult` |
| `/api/ui-analyze` | POST | `{ fileId, gcsUri, mimeType, userPrompt? }` | `UiAnalysisResult` |
| `/api/perf-analyze` | POST | `{ fileId, gcsUri, mimeType, userPrompt? }` | `PerfAnalysisResult` |
| `/api/live-session` | POST | `{ mode }` | `LiveSessionState` |
| `/api/live-session/:id/message` | POST | `{ content, attachments? }` | `ChatMessage` |
| `/api/live-session/:id` | DELETE | — | `{ success }` |

## Submission

Built for the **#GeminiLiveAgentChallenge** hackathon.

- Uses **Gemini 2.0 Flash** for multimodal UI and performance analysis
- Uses **Google GenAI SDK** (`@google/genai`) for multi-turn chat sessions
- Deployed on **Google Cloud Run** with **Cloud Storage** for file handling
