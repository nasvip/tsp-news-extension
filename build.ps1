# 打包前后端完整包：ZIP 根目录直接放 extension.yaml
$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$dist = Join-Path $root "dist"
New-Item -ItemType Directory -Force $dist | Out-Null
$zip = Join-Path $dist "news.zip"
if (Test-Path $zip) { Remove-Item $zip -Force }

# 清掉字节码缓存，别打进包里
Get-ChildItem $root -Recurse -Directory -Filter "__pycache__" -ErrorAction SilentlyContinue |
    Remove-Item -Recurse -Force

Push-Location $root
try {
    Compress-Archive -Path "extension.yaml", "backend", "frontend" -DestinationPath $zip -CompressionLevel Optimal
} finally {
    Pop-Location
}

Write-Output "built: $zip"
Get-Item $zip | Select-Object Name, Length | Format-Table -AutoSize
Add-Type -AssemblyName System.IO.Compression.FileSystem
$z = [System.IO.Compression.ZipFile]::OpenRead($zip)
$z.Entries | Select-Object FullName, Length | Format-Table -AutoSize
$z.Dispose()
