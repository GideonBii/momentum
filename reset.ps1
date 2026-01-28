Write-Host "🚀 Resetting Momentum project..." -ForegroundColor Cyan

# 1. Stop any running Metro / Expo servers
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force
Get-Process expo -ErrorAction SilentlyContinue | Stop-Process -Force

# 2. Clean old installs
if (Test-Path "node_modules") {
    Write-Host "🧹 Removing node_modules..." -ForegroundColor Yellow
    Remove-Item -Recurse -Force node_modules
}

if (Test-Path "package-lock.json") {
    Write-Host "🧹 Removing package-lock.json..." -ForegroundColor Yellow
    Remove-Item -Force package-lock.json
}

# 3. Ensure project is outside OneDrive (recommended)
if ($PWD.Path -like "*OneDrive*") {
    Write-Host "⚠️ WARNING: Project is inside OneDrive. Consider moving to C:\Projects\momentum" -ForegroundColor Red
}

# 4. Install dependencies with legacy peer deps (resolves conflicts safely)
Write-Host "📦 Installing dependencies..." -ForegroundColor Green
npm install --legacy-peer-deps

# 5. Verify critical Expo packages
Write-Host "📦 Installing Expo SDK 53 core modules..." -ForegroundColor Green
npx expo install expo-splash-screen expo-constants expo-status-bar expo-font expo-system-ui

# 6. Clear Metro cache & start
Write-Host "🚀 Starting Expo with clean cache..." -ForegroundColor Cyan
npx expo start -c
