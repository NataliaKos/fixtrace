terraform {
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

# ── Cloud Storage bucket for uploads ────────────────────────────────────────

resource "google_storage_bucket" "uploads" {
  name                        = "fixtrace-uploads-${var.project_id}"
  location                    = var.region
  force_destroy               = false
  uniform_bucket_level_access = true

  lifecycle_rule {
    condition { age = 90 }
    action { type = "Delete" }
  }
}

# ── Cloud Run service ────────────────────────────────────────────────────────

resource "google_cloud_run_v2_service" "fixtrace" {
  name     = "fixtrace-backend"
  location = var.region

  template {
    containers {
      image = "gcr.io/${var.project_id}/fixtrace-backend:latest"

      resources {
        limits = {
          memory = "1Gi"
          cpu    = "1"
        }
      }

      env {
        name  = "GOOGLE_CLOUD_PROJECT"
        value = var.project_id
      }
      env {
        name  = "GOOGLE_CLOUD_LOCATION"
        value = var.region
      }
      env {
        name  = "GCS_BUCKET_NAME"
        value = "fixtrace-uploads-${var.project_id}"
      }
      env {
        name  = "GOOGLE_GENAI_USE_VERTEXAI"
        value = "true"
      }
    }

    timeout = "300s"
  }

  traffic {
    type    = "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"
    percent = 100
  }
}

# ── Allow unauthenticated access ─────────────────────────────────────────────

resource "google_cloud_run_v2_service_iam_member" "public" {
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.fixtrace.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# ── Outputs ──────────────────────────────────────────────────────────────────

output "service_url" {
  value = google_cloud_run_v2_service.fixtrace.uri
}

output "bucket_name" {
  value = google_storage_bucket.uploads.name
}
