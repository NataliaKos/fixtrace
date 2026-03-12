#!/bin/bash
# FixTrace — Manual deploy script for Google Cloud Run
# Usage: ./deploy.sh [PROJECT_ID]
set -euo pipefail

PROJECT_ID="${1:-$(gcloud config get-value project)}"
REGION="us-central1"
SERVICE_NAME="fixtrace-backend"
IMAGE="gcr.io/${PROJECT_ID}/${SERVICE_NAME}"

echo "🚀 FixTrace deploy — project: ${PROJECT_ID}"

# Build Docker image
echo "📦 Building Docker image…"
(cd "$(dirname "$0")/../backend" && docker build -t "${IMAGE}" .)

# Push to Container Registry
echo "⬆️  Pushing to Container Registry…"
docker push "${IMAGE}"

# Deploy to Cloud Run
echo "☁️  Deploying to Cloud Run…"
gcloud run deploy "${SERVICE_NAME}" \
  --image="${IMAGE}" \
  --region="${REGION}" \
  --platform=managed \
  --allow-unauthenticated \
  --memory=2Gi \
  --cpu=2 \
  --timeout=3600 \
  --min-instances=1 \
  --concurrency=20 \
  --session-affinity \
  --set-env-vars="GOOGLE_CLOUD_PROJECT=${PROJECT_ID},GOOGLE_CLOUD_LOCATION=${REGION},GCS_BUCKET_NAME=fixtrace-uploads-${PROJECT_ID},GOOGLE_GENAI_USE_VERTEXAI=true"

echo ""
echo "✅ Deployed! Service URL:"
gcloud run services describe "${SERVICE_NAME}" \
  --region="${REGION}" \
  --format='value(status.url)'
