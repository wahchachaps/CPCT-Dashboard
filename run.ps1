Set-Location -Path $PSScriptRoot

$venvPython = Join-Path -Path $PSScriptRoot -ChildPath ".venv\Scripts\python.exe"

if (-not (Test-Path -Path $venvPython)) {
    Write-Host "Creating local virtual environment..."
    python -m venv .venv
    if (-not (Test-Path -Path $venvPython)) {
        Write-Error "Failed to create virtual environment. Ensure Python is installed and available on PATH."
        exit 1
    }
    Write-Host "Installing dependencies..."
    & $venvPython -m pip install --upgrade pip setuptools wheel
    & $venvPython -m pip install -r requirements.txt
}

Write-Host "Starting app with .venv Python..."
& $venvPython app.py