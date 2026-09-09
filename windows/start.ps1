# Starts TaskAlign's backend and frontend, then opens the browser.
# Assumes install.ps1 has already been run once.

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

$pgService = Get-Service -Name "postgresql-x64-16" -ErrorAction SilentlyContinue
if ($pgService -and $pgService.Status -ne "Running") {
    Write-Host "Starting PostgreSQL service..."
    try {
        Start-Service $pgService.Name
    } catch {
        Write-Host "Could not start PostgreSQL ($($_.Exception.Message)). The backend will fail to connect until it's running -- start it manually or ask an admin to." -ForegroundColor Yellow
    }
}

Write-Host "Starting backend..."
Start-Process -FilePath (Join-Path $root "backend\.venv\Scripts\uvicorn.exe") `
    -ArgumentList "app.main:app", "--host", "0.0.0.0", "--port", "8000" `
    -WorkingDirectory (Join-Path $root "backend") `
    -WindowStyle Minimized

Write-Host "Starting frontend..."
Start-Process -FilePath "pnpm" -ArgumentList "start" `
    -WorkingDirectory (Join-Path $root "frontend") `
    -WindowStyle Minimized

Write-Host "Waiting for the app to come up..."
Start-Sleep -Seconds 5
Start-Process "http://localhost:3000"
