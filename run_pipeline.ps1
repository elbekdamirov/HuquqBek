<#
.SYNOPSIS
  QonunVerse Blender asset pipeline - builds the courtroom, cast, QonunAI, clip libraries,
  exports GLBs to public/assets and validates them.

.EXAMPLE
  .\run_pipeline.ps1                                  # everything
  .\run_pipeline.ps1 -Blender "D:\Blender\blender.exe"
  .\run_pipeline.ps1 -Steps environment,validate
  .\run_pipeline.ps1 -Steps characters -Only advokat,sudya -Render

  Steps: deps, environment, characters, qonunai, library, assemble, manifest, validate
#>
param(
  [string]$Blender = $env:QV_BLENDER,
  [string[]]$Steps = @("deps", "environment", "characters", "qonunai", "library", "assemble", "manifest", "validate"),
  [string[]]$Only = @(),
  [switch]$Render
)
$ErrorActionPreference = "Stop"
# accept "a,b" as one string too (powershell -File passes comma lists unsplit)
$Steps = @($Steps | ForEach-Object { $_ -split "," } | Where-Object { $_ })
$Only = @($Only | ForEach-Object { $_ -split "," } | Where-Object { $_ })
$known = "deps", "environment", "characters", "qonunai", "library", "assemble", "manifest", "validate"
$bad = $Steps | Where-Object { $known -notcontains $_ }
if ($bad) { throw "Unknown step(s): $($bad -join ', '). Valid: $($known -join ', ')" }
$Root = $PSScriptRoot
$S = Join-Path $Root "blender\scripts"
$py = (Get-Command python -ErrorAction SilentlyContinue).Source
if (-not $py) { $py = (Get-Command py -ErrorAction SilentlyContinue).Source }
if (-not $py) { throw "Python 3 is required for check_deps / manifest / validate steps." }

function Invoke-Blender([string[]]$BlArgs, [string]$Label) {
  Write-Host "`n=== $Label" -ForegroundColor Cyan
  # Blender prints harmless lines on stderr (e.g. TBBmalloc); judge success by exit code only.
  $prev = $ErrorActionPreference; $ErrorActionPreference = "Continue"
  & $script:Blender -b --python-exit-code 1 @BlArgs 2>&1 | ForEach-Object { "$_" }
  $code = $LASTEXITCODE
  $ErrorActionPreference = $prev
  if ($code -ne 0) { throw "Blender step failed: $Label (exit $code)" }
}

# ---- dependency detection (always runs; decides what can be built)
$depArgs = @("$S\check_deps.py")
if ($Blender) { $depArgs += @("--blender", $Blender) }
$depJson = & $py @depArgs --json | Out-String
$depCode = $LASTEXITCODE
$deps = $depJson | ConvertFrom-Json
if ($Steps -contains "deps") { & $py @depArgs }
if ($depCode -eq 2) { throw "Blender 4.2+ not found. Install it or pass -Blender / set QV_BLENDER. See docs/SETUP.md" }
$script:Blender = $deps.blender
$humans = $depCode -eq 0
if (-not $humans) { Write-Warning "MPFB or MakeHuman assets missing: human characters will be SKIPPED (see output above)." }

Push-Location $Root
try {
  if ($Steps -contains "environment") {
    $a = @("--python", "$S\build_courtroom.py", "--")
    if ($Render) { $a += "--render" }
    Invoke-Blender $a "Build courtroom (blender/courtroom.blend)"
    Invoke-Blender @("blender\courtroom.blend", "--python", "$S\export_environment.py") "Export environment GLBs"
  }
  if ($Steps -contains "characters" -and $humans) {
    $a = @("--python", "$S\build_characters.py", "--")
    if ($Only.Count) { $a += @("--only", ($Only -join ",")) } else { $a += "--all" }
    if ($Render) { $a += "--render" }
    Invoke-Blender $a "Build + export human cast"
  }
  if ($Steps -contains "qonunai") { Invoke-Blender @("--python", "$S\build_qonunai.py") "Build + export QonunAI" }
  if ($Steps -contains "library" -and $humans) {
    Invoke-Blender @("blender\characters\advokat.blend", "--python", "$S\export_animation_library.py", "--", "female") "Female clip library"
    Invoke-Blender @("blender\characters\davogar.blend", "--python", "$S\export_animation_library.py", "--", "male") "Male clip library"
  }
  if ($Steps -contains "assemble") {
    $a = @("blender\courtroom.blend", "--python", "$S\assemble_scene.py", "--")
    if ($Render) { $a += "--render" }
    Invoke-Blender $a "Assemble characters into courtroom_assembled.blend"
  }
  if ($Steps -contains "manifest") { Write-Host "`n=== Manifest + licences" -ForegroundColor Cyan; & $py "$S\export_manifest.py" }
  if ($Steps -contains "validate") {
    Write-Host "`n=== Validate GLBs" -ForegroundColor Cyan
    & $py "$S\validate_glb.py"
    if ($LASTEXITCODE -ne 0) { throw "Validation reported errors (public/assets/validation_report.json)" }
  }
} finally { Pop-Location }
Write-Host "`nDone. Outputs: public/assets/{environment,characters,animations}, manifest.json, LICENSES.json" -ForegroundColor Green
