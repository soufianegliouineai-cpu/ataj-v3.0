resource "google_sql_database_instance" "ataj" {
  name = "ataj-db"
  region = "us-central1"
  database_version = "COCKROACHDB_23"
  settings {
    tier = "db-custom-4-16384"
    backup_configuration {
      enabled = true
      point_in_time_recovery_enabled = true
    }
  }
}

resource "google_storage_bucket" "audit" {
  name = "ataj-audit-worm"
  retention_policy {
    retention_period = 31536000
  }
}
