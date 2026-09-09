# TaskAlign Windows installer.
#
# Run this once from the project root (double-click install.bat, which calls
# this with the right options). Installs Python, Node.js and PostgreSQL via
# winget if they're missing, creates the app database, builds the backend
# venv and the frontend, and creates a desktop shortcut to start the app.
#
# Safe to re-run: every step checks whether it's already done before acting.

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Write-Step($msg) { Write-Host ""; Write-Host "==> $msg" -ForegroundColor Cyan }
function Write-Ok($msg)   { Write-Host "    $msg" -ForegroundColor Green }
function Write-Warn2($msg) { Write-Host "    $msg" -ForegroundColor Yellow }

# ---------------------------------------------------------------------------
# 0. Must run elevated (winget installs + Postgres service both need it).
# ---------------------------------------------------------------------------
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Warn2 "Restarting with administrator rights (required for installing software)..."
    Start-Process powershell -Verb RunAs -ArgumentList "-NoExit","-ExecutionPolicy","Bypass","-File","`"$PSCommandPath`""
    exit
}

function Update-SessionPath {
    $machine = [Environment]::GetEnvironmentVariable("Path", "Machine")
    $user = [Environment]::GetEnvironmentVariable("Path", "User")
    $env:Path = "$machine;$user"
}

# ---------------------------------------------------------------------------
# 1. winget itself
# ---------------------------------------------------------------------------
Write-Step "Checking for winget (Windows Package Manager)"
if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
    Write-Host "winget was not found. Install 'App Installer' from the Microsoft Store," -ForegroundColor Red
    Write-Host "then run this installer again. (Windows 10 2020+ and Windows 11 already have it.)" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}
Write-Ok "winget found."

# ---------------------------------------------------------------------------
# 2. Python
# ---------------------------------------------------------------------------
Write-Step "Checking for Python"
if (Get-Command python -ErrorAction SilentlyContinue) {
    Write-Ok "Python already installed: $(python --version)"
} else {
    Write-Host "    Installing Python 3.11 via winget..."
    winget install --id Python.Python.3.11 -e --silent --accept-package-agreements --accept-source-agreements
    Update-SessionPath
    Write-Ok "Python installed: $(python --version)"
}

# ---------------------------------------------------------------------------
# 3. Node.js (LTS)
# ---------------------------------------------------------------------------
Write-Step "Checking for Node.js"
if (Get-Command node -ErrorAction SilentlyContinue) {
    Write-Ok "Node.js already installed: $(node --version)"
} else {
    Write-Host "    Installing Node.js LTS via winget..."
    winget install --id OpenJS.NodeJS.LTS -e --silent --accept-package-agreements --accept-source-agreements
    Update-SessionPath
    Write-Ok "Node.js installed: $(node --version)"
}

Write-Step "Enabling pnpm (bundled with Node via corepack)"
corepack enable
corepack prepare pnpm@9 --activate
Write-Ok "pnpm ready: $(pnpm --version)"

# ---------------------------------------------------------------------------
# 4. Root .env: DB credentials, ports, API base URL. Reused on re-run.
# ---------------------------------------------------------------------------
Write-Step "Preparing configuration (.env)"
$envPath = Join-Path $root ".env"
$dbPassword = $null
if (Test-Path $envPath) {
    $existing = Get-Content $envPath | Where-Object { $_ -match "^POSTGRES_PASSWORD=" }
    if ($existing) { $dbPassword = ($existing -split "=", 2)[1] }
}
if (-not $dbPassword) {
    $dbPassword = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 24 | ForEach-Object { [char]$_ })
}
$envContent = @"
POSTGRES_USER=taskalign
POSTGRES_PASSWORD=$dbPassword
POSTGRES_DB=taskalign
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
DATABASE_URL=postgresql://taskalign:$dbPassword@localhost:5432/taskalign
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
"@
Set-Content -Path $envPath -Value $envContent -Encoding UTF8
Write-Ok ".env written."

# ---------------------------------------------------------------------------
# 5. PostgreSQL
# ---------------------------------------------------------------------------
Write-Step "Checking for PostgreSQL"
$pgService = Get-Service -Name "postgresql-x64-16" -ErrorAction SilentlyContinue
if (-not $pgService) {
    Write-Host "    Installing PostgreSQL 16 via winget (this sets the Postgres superuser password)..."
    $pgSuperPassword = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 24 | ForEach-Object { [char]$_ })
    winget install --id PostgreSQL.PostgreSQL.16 -e --silent --accept-package-agreements --accept-source-agreements `
        --override "--mode unattended --superpassword `"$pgSuperPassword`" --serverport 5432 --disable-components stackbuilder"
    Set-Content -Path (Join-Path $root ".pg_superuser_password.txt") -Value $pgSuperPassword -Encoding UTF8
    Update-SessionPath
    $pgService = Get-Service -Name "postgresql-x64-16" -ErrorAction SilentlyContinue
}
if (-not $pgService) {
    Write-Host "PostgreSQL service not found after install. Check the winget output above." -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}
if ($pgService.Status -ne "Running") {
    Start-Service $pgService.Name
}
Write-Ok "PostgreSQL service is running."

$pgBin = "C:\Program Files\PostgreSQL\16\bin"
if (-not (Get-Command psql -ErrorAction SilentlyContinue)) {
    $env:Path = "$env:Path;$pgBin"
}
$pgSuperPasswordFile = Join-Path $root ".pg_superuser_password.txt"
$pgSuperPassword = if (Test-Path $pgSuperPasswordFile) { Get-Content $pgSuperPasswordFile } else { $null }
if (-not $pgSuperPassword) {
    Write-Warn2 "Postgres superuser password not on file (Postgres was already installed before this script ran)."
    $pgSuperPassword = Read-Host "Enter the Postgres 'postgres' user password to create the app database"
}
$env:PGPASSWORD = $pgSuperPassword

Write-Step "Creating the application database and user (if not already present)"
$roleSql = "DO `$`$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'taskalign') THEN CREATE ROLE taskalign LOGIN PASSWORD '$dbPassword'; ELSE ALTER ROLE taskalign WITH PASSWORD '$dbPassword'; END IF; END `$`$;"
& psql -U postgres -h localhost -c $roleSql
$dbExists = & psql -U postgres -h localhost -tAc "SELECT 1 FROM pg_database WHERE datname = 'taskalign'"
if ($dbExists -ne "1") {
    & psql -U postgres -h localhost -c "CREATE DATABASE taskalign OWNER taskalign;"
}
Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
Write-Ok "Database ready."

# ---------------------------------------------------------------------------
# 6. Backend: venv + dependencies + migrations
# ---------------------------------------------------------------------------
Write-Step "Setting up backend (Python virtual environment, dependencies, migrations)"
Push-Location (Join-Path $root "backend")
if (-not (Test-Path ".venv")) {
    python -m venv .venv
}
& ".venv\Scripts\pip.exe" install --upgrade pip | Out-Null
& ".venv\Scripts\pip.exe" install -r requirements.txt
$env:DATABASE_URL = "postgresql://taskalign:$dbPassword@localhost:5432/taskalign"
& ".venv\Scripts\python.exe" -m alembic upgrade head
Pop-Location
Write-Ok "Backend ready."

# ---------------------------------------------------------------------------
# 7. Frontend: install + production build
# ---------------------------------------------------------------------------
Write-Step "Building frontend (this can take a few minutes the first time)"
Push-Location (Join-Path $root "frontend")
$env:NEXT_PUBLIC_API_BASE_URL = "http://localhost:8000"
pnpm install --frozen-lockfile
pnpm build
Pop-Location
Write-Ok "Frontend built."

# ---------------------------------------------------------------------------
# 8. Desktop shortcut to start.bat
# ---------------------------------------------------------------------------
Write-Step "Creating desktop shortcut"
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut("$([Environment]::GetFolderPath('Desktop'))\TaskAlign.lnk")
$shortcut.TargetPath = Join-Path $root "windows\start.bat"
$shortcut.WorkingDirectory = $root
$shortcut.IconLocation = "shell32.dll,220"
$shortcut.Save()
Write-Ok "Shortcut created on the Desktop."

Write-Host ""
Write-Host "Setup complete. Starting TaskAlign now..." -ForegroundColor Cyan
& (Join-Path $root "windows\start.ps1")
