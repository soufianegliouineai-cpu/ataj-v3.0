path "secret/data/ataj/*" {
  capabilities = ["read"]
  min_wrapping_ttl = "24h"
  max_wrapping_ttl = "24h"
}

path "transit/encrypt/ataj" {
  capabilities = ["update"]
}

Rule: All secrets from Vault. Rotated every 24h. No ENV vars.
