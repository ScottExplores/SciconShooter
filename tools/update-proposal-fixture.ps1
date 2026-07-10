$ErrorActionPreference = 'Stop'
$feedUrl = 'https://backend.prod.researchhub.com/api/funding_feed/?fundraise_status=OPEN&ordering=best&page_size=100&content_type=PREREGISTRATION'
$headers = @{
  Accept = 'application/json'
  'User-Agent' = 'SciconShooter/2.2 (+https://sciconshooter.xyz)'
}
$response = Invoke-WebRequest -Uri $feedUrl -Headers $headers -UseBasicParsing
$outputPath = Join-Path $PSScriptRoot '..\public\dev-researchhub-proposals.json'
[System.IO.File]::WriteAllText($outputPath, $response.Content, [System.Text.UTF8Encoding]::new($false))
Write-Output "Updated local ResearchHub proposal fixture: $outputPath"
