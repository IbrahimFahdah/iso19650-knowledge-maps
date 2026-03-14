param(
    [string]$GraphsRoot = "graphs"
)

$ErrorActionPreference = "Stop"

function Write-Manifest {
    param(
        [string]$StandardDirectory
    )

    if (-not (Test-Path -LiteralPath $StandardDirectory)) {
        return
    }

    $standardName = Split-Path -Leaf $StandardDirectory
    $graphFiles = Get-ChildItem -LiteralPath $StandardDirectory -File -Filter *.json |
        Where-Object { $_.Name -ne "index.json" } |
        Sort-Object Name |
        ForEach-Object { "graphs/$standardName/$($_.Name)" }

    $manifest = [ordered]@{
        graphs = @($graphFiles)
    }

    $manifestPath = Join-Path $StandardDirectory "index.json"
    $manifest | ConvertTo-Json -Depth 3 | Set-Content -LiteralPath $manifestPath -Encoding UTF8
    Write-Host "Updated $manifestPath"
}

Write-Manifest -StandardDirectory (Join-Path $GraphsRoot "2018")
Write-Manifest -StandardDirectory (Join-Path $GraphsRoot "draft")
