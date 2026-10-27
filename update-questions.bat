@echo off
REM One-click: start the database (if Docker is installed), apply migrations, and import the question bank.
REM Double-click this file, or run it from the tech-treasure-hunt folder.
cd /d "%~dp0"

echo.
echo [1/3] Starting PostgreSQL with Docker (skipped if Docker is not available)...
docker compose up -d postgres

echo.
echo [2/3] Applying database migrations...
call npm run db:migrate --workspace server
if errorlevel 1 goto fail

echo.
echo [3/3] Importing the question bank...
call npm run questions:import --workspace server -- ./seeds/approved-question-bank.json
if errorlevel 1 goto fail

echo.
echo Done! Questions updated. Now run:  npm run dev:server   and   npm run dev:client
pause
exit /b 0

:fail
echo.
echo Something failed. Check that server\.env exists with a valid DATABASE_URL and that PostgreSQL is running.
pause
exit /b 1
