# Migrate Auth API schema to Neon PostgreSQL (Windows PowerShell)
# Usage: edit $DbPassword below, then run:
#   cd auth_backend
#   .\scripts\migrate-neon.ps1

$ErrorActionPreference = "Stop"

$DbHost = "ep-morning-bread-ayihmeh7-pooler.c-5.us-east-2.aws.neon.tech"
$DbPort = "5432"
$DbName = "neondb"
$DbUser = "neondb_owner"
$DbPassword = "YOUR_NEON_PASSWORD_HERE"

if ($DbPassword -eq "YOUR_NEON_PASSWORD_HERE") {
    Write-Host "Edit scripts/migrate-neon.ps1 and set your Neon password first." -ForegroundColor Yellow
    exit 1
}

$env:DB_HOST = $DbHost
$env:DB_PORT = $DbPort
$env:DB_NAME = $DbName
$env:DB_USER = $DbUser
$env:DB_PASSWORD = $DbPassword
$env:DB_SSL = "true"

Write-Host "Running auth DB migrate against Neon..." -ForegroundColor Cyan
npm run db:migrate

if ($LASTEXITCODE -eq 0) {
    Write-Host "Migration complete." -ForegroundColor Green
} else {
    Write-Host "Migration failed. If DNS/network error, use Neon SQL Editor instead:" -ForegroundColor Yellow
    Write-Host "  db/migrate_refresh_password_tables.sql" -ForegroundColor Yellow
}
