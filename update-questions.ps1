# One-click: start the database (if Docker is installed), apply migrations, and import the question bank.
# Run from PowerShell:  .\update-questions.ps1
Set-Location -Path $PSScriptRoot

Write-Host "`n[1/3] Starting PostgreSQL with Docker (skipped if Docker is not available)..."
docker compose up -d postgres

Write-Host "`n[2/3] Applying database migrations..."
npm run db:migrate --workspace server
if ($LASTEXITCODE -ne 0) { Write-Host "Migration failed. Check server\.env (DATABASE_URL) and that PostgreSQL is running." -ForegroundColor Red; exit 1 }

Write-Host "`n[3/3] Importing the question bank..."
npm run questions:import --workspace server -- ./seeds/approved-question-bank.json
if ($LASTEXITCODE -ne 0) { Write-Host "Import failed." -ForegroundColor Red; exit 1 }

Write-Host "`nDone! Questions updated. Now run: npm run dev:server  and  npm run dev:client" -ForegroundColor Green
