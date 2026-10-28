# Builds site\index.html for uploading to Hostinger: the game page wrapped in a full HTML document.
$root = Resolve-Path "$PSScriptRoot\.."
$body = [IO.File]::ReadAllText("$root\game\grand-entrance.html")
$html = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body>' + $body + '</body></html>'
New-Item -ItemType Directory -Force "$root\site" | Out-Null
[IO.File]::WriteAllText("$root\site\index.html", $html, (New-Object Text.UTF8Encoding $false))
"Wrote site\index.html ($((Get-Item "$root\site\index.html").Length) bytes)"
