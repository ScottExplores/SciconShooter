[CmdletBinding()]
param(
  [string]$GalleryPath = (Join-Path $env:USERPROFILE 'Downloads\Legacy Collection\Scicon Space Sprite Gallery.html'),
  [string]$LegacySourceRoot = (Join-Path $env:USERPROFILE 'Downloads\Legacy Collection\Legacy Collection'),
  [string]$ProjectArtRoot = '',
  [string]$ProjectAudioRoot = '',
  [switch]$Open
)

$ErrorActionPreference = 'Stop'

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptRoot
if ([string]::IsNullOrWhiteSpace($ProjectArtRoot)) {
  $ProjectArtRoot = Join-Path $projectRoot 'public\game-art'
}
if ([string]::IsNullOrWhiteSpace($ProjectAudioRoot)) {
  $ProjectAudioRoot = Join-Path $projectRoot 'public\audio'
}

$imageExtensions = @('.png', '.gif', '.jpg', '.jpeg', '.webp', '.svg', '.bmp')
$audioExtensions = @('.wav', '.mp3', '.ogg', '.m4a', '.flac')
$galleryRoot = Split-Path -Parent $GalleryPath

function Assert-Directory([string]$Path, [string]$Label) {
  if (-not (Test-Path -LiteralPath $Path -PathType Container)) {
    throw "$Label directory was not found: $Path"
  }
}

function Get-RelativeFileUrl([string]$FromDirectory, [string]$FilePath) {
  $separator = [System.IO.Path]::DirectorySeparatorChar
  $basePath = [System.IO.Path]::GetFullPath($FromDirectory).TrimEnd('\', '/') + $separator
  $fullPath = [System.IO.Path]::GetFullPath($FilePath)
  $baseUri = New-Object System.Uri($basePath)
  $fileUri = New-Object System.Uri($fullPath)
  return [System.Uri]::UnescapeDataString($baseUri.MakeRelativeUri($fileUri).ToString())
}

function Get-PathWithin([string]$Root, [string]$FilePath) {
  $rootPath = [System.IO.Path]::GetFullPath($Root).TrimEnd('\', '/')
  $fullPath = [System.IO.Path]::GetFullPath($FilePath)
  $prefix = $rootPath + [System.IO.Path]::DirectorySeparatorChar
  if (-not $fullPath.StartsWith($prefix, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "File is outside the expected root: $FilePath"
  }
  return $fullPath.Substring($prefix.Length).Replace('\', '/')
}

function Get-DirectoryLabel([string]$Prefix, [string]$RelativePath) {
  $directory = [System.IO.Path]::GetDirectoryName($RelativePath.Replace('/', '\'))
  if ([string]::IsNullOrWhiteSpace($directory)) { return $Prefix }
  return "$Prefix\$directory"
}

function Get-ProjectCategory([string]$RelativePath) {
  $normalized = $RelativePath.ToLowerInvariant().Replace('\', '/')
  if ($normalized -match '(^|/)animations/' -or $normalized.EndsWith('.gif')) { return 'Scicon - Animations' }
  if ($normalized -match '(^|/)bosses/') { return 'Scicon - Bosses & Mini-Bosses' }
  if ($normalized -match '(^|/)enemies/') { return 'Scicon - Enemies' }
  if ($normalized -match '(^|/)ships/' -or $normalized -match '^branding/') { return 'Scicon - Player & Escort Ships' }
  if ($normalized -match '(^|/)backgrounds/') { return 'Scicon - Backgrounds' }
  if ($normalized -match '(^|/)effects/') { return 'Scicon - Combat FX' }
  if ($normalized -match '^powerups/' -or $normalized -match '^tokens/') { return 'Scicon - Powerups, Tokens & Props' }
  if ($normalized -match '^generated/ui/') { return 'Scicon - UI & Menus' }
  if ($normalized -match '^generated/') { return 'Scicon - Generated Art' }
  if ($normalized -match '^record-card/') { return 'Scicon - Record Card Art' }
  if ($normalized -match '^founders/') { return 'Scicon - Founder Portraits' }
  return 'Scicon - Other Game Art'
}

function Get-LegacyCategory([string]$RelativePath) {
  $normalized = $RelativePath.ToLowerInvariant().Replace('\', '/')
  $hasSpaceTheme = $normalized -match 'space|spaceship|spacecraft|sci-fi|asteroid|top-down-shooter|warped vehicles|fighter|rocket|jet'
  $hasEnvironment = $normalized -match 'environment|background|backdrop|tileset|tile-map|tilemap|terrain|planet|stars|sky|cloud|graveyard|city|forest|cave|sewer|church|cemetery|town|swamp|beach|cliff|underwater|river|desert'
  $hasCombatFx = $normalized -match 'explosion|shooting.?fx|combat.?fx|projectile|laser|bullet|bolt|missile|weapon|thrust|smoke|impact|muzzle|beam|ray|fireball'

  if ($normalized -match 'boss|mini.?boss') { return 'Legacy - Bosses' }
  if ($hasCombatFx) { return 'Legacy - Combat FX' }
  if ($hasSpaceTheme -and $hasEnvironment) { return 'Legacy - Space Environments' }
  if ($hasSpaceTheme) { return 'Legacy - Ships, Vehicles & Enemies' }
  if ($normalized -match '^assets/environments/' -or $hasEnvironment -or $normalized -match 'prop|object|decoration') {
    return 'Legacy - Backgrounds, Tiles & Props'
  }
  if ($normalized -match '^assets/characters/' -or $normalized -match 'enemy|creature|monster|hero|knight|marine|robot|demon|ghost|ogre|character') {
    return 'Legacy - Characters & Creatures'
  }
  if ($normalized -match '(^|/)ui(/|$)|icon|interface|hud|inventory|item|button|cursor|font') {
    return 'Legacy - UI, Icons & Items'
  }
  if ($normalized -match '^assets/packs/') { return 'Legacy - Complete Sprite Packs' }
  return 'Legacy - Other Assets'
}

function Get-LegacyLibrary([string]$RelativePath) {
  $normalized = $RelativePath.ToLowerInvariant().Replace('\', '/')
  $spaceTheme = $normalized -match 'space|spaceship|spacecraft|sci-fi|asteroid|meteor|top-down-shooter|top-down-boss|warped vehicles|warped fast ship|fighter|rocket|jet|satellite|starfield'
  $meleeOrGroundCharacter = $normalized -match 'sword|blade|melee|slash|katana|axe|knight|warrior|archer|human|portrait|zombie|demon|ogre|heroine|dancing girl|space-marine'
  $usefulEffect = $normalized -match 'explosion|shooting.?fx|projectile|laser|bullet|bolt|missile|thrust|smoke|impact|muzzle|beam|(^|/)ray|bomb|energy|electric|shield|(^|/)hit([0-9._/-]|$)'
  $usefulPickup = $normalized -match 'power.?up|pickup|collectible|gem|crystal|coin|token|potion|flask'
  $usefulSpaceProp = $normalized -match 'rock|meteor'

  if ($meleeOrGroundCharacter) { return 'extras' }
  if ($spaceTheme) { return 'space' }
  if ($usefulEffect -or $usefulPickup -or $usefulSpaceProp) { return 'space' }
  return 'extras'
}

function Get-SimpleAssetCategory([string]$RelativePath, [string]$Extension) {
  $normalized = $RelativePath.ToLowerInvariant().Replace('\', '/')
  $extensionLower = $Extension.ToLowerInvariant()

  if ($extensionLower -eq '.gif') { return 'All GIFs' }
  if ($normalized -match 'scicon-simple-arcade-kit-v1') { return 'Simple Arcade Kit' }
  if ($normalized -match 'sprite.?sheet|spritesheets|sprite.?atlas|(^|/)[^/]*sheet[^/]*\.(png|jpg|jpeg|webp|bmp|svg)$') { return 'Sprite Sheets' }
  if ($normalized -match '(^|/)(ui|menus?|hud|dashboard|interface|buttons?|icons?)(/|$)' -or $normalized -match '^generated/ui/') { return 'UI & Menus' }
  if ($normalized -match 'background|backdrop|terrain|parallax|environment|tilemap|tile.?set|starfield|skybox') { return 'Backgrounds' }
  if ($normalized -match '(^|/)(ships?|spacecraft|fighters?|rockets?|jets?|vehicles?)(/|$)' -or $normalized -match 'player.?ship|escort.?ship|token.?ship') { return 'Ships' }
  if ($normalized -match 'boss|mini.?boss') { return 'Bosses' }
  if ($normalized -match '(^|/)(enemies|enemy|creatures?|monsters?)(/|$)') { return 'Enemies' }
  if ($normalized -match 'power.?up|pickup|collectible|items?|tokens?|coins?|gems?|crystals?|flasks?|rewards?') { return 'Items & Power-Ups' }
  if ($normalized -match 'effects?|explosion|projectile|laser|bullet|missile|weapon|thrust|smoke|impact|muzzle|beam|props?|objects?|decoration') { return 'Props & Effects' }
  if ($normalized -match 'characters?|player|humans?|soldiers?|heroes?|portraits?|founders?|robots?|knights?|warriors?') { return 'Characters' }
  return 'Other'
}

function Get-SimpleAssetCategories([string]$RelativePath, [string]$Extension) {
  $normalized = $RelativePath.ToLowerInvariant().Replace('\', '/')
  $categories = New-Object System.Collections.Generic.List[string]
  $primary = Get-SimpleAssetCategory $RelativePath $Extension
  $categories.Add($primary)
  if ($normalized -match 'scicon-simple-arcade-kit-v1' -and -not $categories.Contains('Simple Arcade Kit')) {
    $categories.Add('Simple Arcade Kit')
  }
  if ($normalized -match 'sprite.?sheet|spritesheets|sprite.?atlas|(^|/)[^/]*sheet[^/]*\.(png|jpg|jpeg|webp|bmp|svg)$' -and -not $categories.Contains('Sprite Sheets')) {
    $categories.Add('Sprite Sheets')
  }
  return [string[]]$categories.ToArray()
}

function Get-ProjectAudioCategory([string]$RelativePath) {
  $normalized = $RelativePath.ToLowerInvariant().Replace('\', '/')
  if ($normalized -match '^ui/' -or $normalized -match 'victory|animation') { return 'Scicon - Animation Audio' }
  return 'Scicon - Game Audio'
}

function Get-FilesByExtension([string]$Root, [string[]]$Extensions) {
  if (-not (Test-Path -LiteralPath $Root -PathType Container)) { return @() }
  return @(
    Get-ChildItem -LiteralPath $Root -Recurse -File |
      Where-Object { $Extensions -contains $_.Extension.ToLowerInvariant() }
  )
}

function Get-AssetUsageIndex([string]$SourceRoot, [string]$ArtRoot) {
  $usageIndex = @{}
  $sourceExtensions = @('.ts', '.tsx', '.js', '.jsx', '.css', '.scss')
  $excludedDirectories = '\\(node_modules|public|tools|docs|archive|tmp|dist|build|coverage|\.git|\.codex-remote-attachments)\\'
  $directAssetPattern = '(?<path>/game-art/[A-Za-z0-9_./\- ]+\.(?:png|gif|jpg|jpeg|webp|svg|bmp))'
  $prefixPattern = '(?m)\b(?:const|let|var)\s+(?<name>[A-Za-z_][A-Za-z0-9_]*)\s*=\s*[''"](?<path>/game-art/[^''"]+)[''"]'
  $templateAssetPattern = '\$\{(?<name>[A-Za-z_][A-Za-z0-9_]*)\}/(?<tail>[A-Za-z0-9_./\- ]+\.(?:png|gif|jpg|jpeg|webp|svg|bmp))'

  $sourceFiles = @(
    Get-ChildItem -LiteralPath $SourceRoot -Recurse -File |
      Where-Object {
        $sourceExtensions -contains $_.Extension.ToLowerInvariant() -and
        $_.FullName -notmatch $excludedDirectories
      }
  )

  foreach ($sourceFile in $sourceFiles) {
    $content = [System.IO.File]::ReadAllText($sourceFile.FullName)
    $sourceRelative = Get-PathWithin $SourceRoot $sourceFile.FullName
    $prefixes = @{}
    foreach ($prefixMatch in [regex]::Matches($content, $prefixPattern)) {
      $prefixes[$prefixMatch.Groups['name'].Value] = $prefixMatch.Groups['path'].Value.TrimEnd('/')
    }

    $references = New-Object System.Collections.Generic.List[object]
    foreach ($assetMatch in [regex]::Matches($content, $directAssetPattern)) {
      $references.Add([pscustomobject]@{ Path = $assetMatch.Groups['path'].Value; Index = $assetMatch.Index })
    }
    foreach ($assetMatch in [regex]::Matches($content, $templateAssetPattern)) {
      $variableName = $assetMatch.Groups['name'].Value
      if ($prefixes.ContainsKey($variableName)) {
        $references.Add([pscustomobject]@{
          Path = $prefixes[$variableName] + '/' + $assetMatch.Groups['tail'].Value
          Index = $assetMatch.Index
        })
      }
    }

    foreach ($reference in $references) {
      $assetRelative = $reference.Path.Substring('/game-art/'.Length).Replace('\\', '/')
      $assetPath = Join-Path $ArtRoot $assetRelative.Replace('/', '\\')
      if (-not (Test-Path -LiteralPath $assetPath -PathType Leaf)) { continue }
      $assetKey = $assetRelative.ToLowerInvariant()
      if (-not $usageIndex.ContainsKey($assetKey)) {
        $usageIndex[$assetKey] = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
      }
      $lineNumber = 1 + [regex]::Matches($content.Substring(0, $reference.Index), "`n").Count
      [void]$usageIndex[$assetKey].Add("${sourceRelative}:$lineNumber")
    }
  }

  return $usageIndex
}

Assert-Directory $galleryRoot 'Gallery root'
Assert-Directory $LegacySourceRoot 'Legacy Collection'
Assert-Directory $ProjectArtRoot 'Scicon project art'
if (-not (Test-Path -LiteralPath $GalleryPath -PathType Leaf)) {
  throw "Sprite gallery was not found: $GalleryPath"
}

$legacyImageFiles = Get-FilesByExtension $LegacySourceRoot $imageExtensions
$projectImageFiles = Get-FilesByExtension $ProjectArtRoot $imageExtensions
$legacyAudioFiles = Get-FilesByExtension $LegacySourceRoot $audioExtensions
$projectAudioFiles = Get-FilesByExtension $ProjectAudioRoot $audioExtensions
$assetUsageIndex = Get-AssetUsageIndex $projectRoot $ProjectArtRoot

$categoryOrder = @(
  'Scicon - Animations',
  'Scicon - Bosses & Mini-Bosses',
  'Scicon - Enemies',
  'Scicon - Player & Escort Ships',
  'Scicon - Combat FX',
  'Scicon - Backgrounds',
  'Scicon - Powerups, Tokens & Props',
  'Scicon - UI & Menus',
  'Scicon - Generated Art',
  'Scicon - Record Card Art',
  'Scicon - Founder Portraits',
  'Scicon - Other Game Art',
  'Legacy - Bosses',
  'Legacy - Ships, Vehicles & Enemies',
  'Legacy - Combat FX',
  'Legacy - Space Environments',
  'Legacy - Backgrounds, Tiles & Props',
  'Legacy - Characters & Creatures',
  'Legacy - UI, Icons & Items',
  'Legacy - Complete Sprite Packs',
  'Legacy - Other Assets'
)
$categoryRank = @{}
for ($index = 0; $index -lt $categoryOrder.Count; $index += 1) {
  $categoryRank[$categoryOrder[$index]] = $index
}
$simpleCategoryOrder = @(
  'All GIFs',
  'Sprite Sheets',
  'Simple Arcade Kit',
  'Ships',
  'Bosses',
  'Enemies',
  'UI & Menus',
  'Backgrounds',
  'Props & Effects',
  'Items & Power-Ups',
  'Characters',
  'Other'
)
$simpleCategoryRank = @{}
for ($index = 0; $index -lt $simpleCategoryOrder.Count; $index += 1) {
  $simpleCategoryRank[$simpleCategoryOrder[$index]] = $index
}

$assets = New-Object System.Collections.Generic.List[object]
foreach ($file in $projectImageFiles) {
  $relative = Get-PathWithin $ProjectArtRoot $file.FullName
  $usageKey = $relative.ToLowerInvariant()
  [string[]]$usageLocations = @()
  if ($assetUsageIndex.ContainsKey($usageKey)) {
    $usageLocations = [string[]]@($assetUsageIndex[$usageKey] | Sort-Object)
  }
  $audioPreview = ''
  $audioPreviewAbsolutePath = ''
  if ($relative -eq 'generated/ui/animations/victory-signet/previews/scicon-victory-signet-animation.gif') {
    $previewMixPath = Join-Path $ProjectAudioRoot 'ui\victory-signet\victory-signet-preview-mix.wav'
    if (Test-Path -LiteralPath $previewMixPath -PathType Leaf) {
      $audioPreview = Get-RelativeFileUrl $galleryRoot $previewMixPath
      $audioPreviewAbsolutePath = $previewMixPath
    }
  }
  $assets.Add([pscustomobject][ordered]@{
    category = Get-ProjectCategory $relative
    simpleCategory = Get-SimpleAssetCategory $relative $file.Extension
    simpleCategories = [string[]]@(Get-SimpleAssetCategories $relative $file.Extension)
    library = 'space'
    source = 'Scicon project'
    pack = Get-DirectoryLabel 'Scicon Shooter\public\game-art' $relative
    name = $file.Name
    path = Get-RelativeFileUrl $galleryRoot $file.FullName
    absolutePath = $file.FullName
    kind = $file.Extension.TrimStart('.').ToUpperInvariant()
    bytes = [int64]$file.Length
    audioPreview = $audioPreview
    audioPreviewAbsolutePath = $audioPreviewAbsolutePath
    inGame = $usageLocations.Count -gt 0
    usageLocations = [string[]]$usageLocations
  })
}

foreach ($file in $legacyImageFiles) {
  $relative = Get-PathWithin $LegacySourceRoot $file.FullName
  $assets.Add([pscustomobject][ordered]@{
    category = Get-LegacyCategory $relative
    simpleCategory = Get-SimpleAssetCategory $relative $file.Extension
    simpleCategories = [string[]]@(Get-SimpleAssetCategories $relative $file.Extension)
    library = Get-LegacyLibrary $relative
    source = 'Legacy Collection (CC0)'
    pack = Get-DirectoryLabel 'Legacy Collection' $relative
    name = $file.Name
    path = Get-RelativeFileUrl $galleryRoot $file.FullName
    absolutePath = $file.FullName
    kind = $file.Extension.TrimStart('.').ToUpperInvariant()
    bytes = [int64]$file.Length
    inGame = $false
    usageLocations = @()
  })
}

$assetSortProperties = @(
  @{ Expression = { $simpleCategoryRank[$_.simpleCategory] } },
  @{ Expression = { $categoryRank[$_.category] } },
  @{ Expression = { $_.pack } },
  @{ Expression = { $_.name } },
  @{ Expression = { $_.path } }
)
$sortedAssets = @($assets | Sort-Object -Property $assetSortProperties)

$sounds = New-Object System.Collections.Generic.List[object]
foreach ($file in $projectAudioFiles) {
  $relative = Get-PathWithin $ProjectAudioRoot $file.FullName
  $sounds.Add([pscustomobject][ordered]@{
    category = Get-ProjectAudioCategory $relative
    source = 'Scicon project'
    name = $file.Name
    path = Get-RelativeFileUrl $galleryRoot $file.FullName
    absolutePath = $file.FullName
  })
}
foreach ($file in $legacyAudioFiles) {
  $relative = Get-PathWithin $LegacySourceRoot $file.FullName
  $sounds.Add([pscustomobject][ordered]@{
    category = 'Legacy - Audio'
    source = 'Legacy Collection (CC0)'
    name = $file.Name
    path = Get-RelativeFileUrl $galleryRoot $file.FullName
    absolutePath = $file.FullName
  })
}
$sortedSounds = @($sounds | Sort-Object category, name, path)

$assetJson = ConvertTo-Json -InputObject $sortedAssets -Depth 4 -Compress
$soundJson = ConvertTo-Json -InputObject $sortedSounds -Depth 4 -Compress
$html = [System.IO.File]::ReadAllText($GalleryPath)
$catalogPattern = 'const assets = \[.*?\];\s*const sounds = \[.*?\];'
if (-not [System.Text.RegularExpressions.Regex]::IsMatch(
  $html,
  $catalogPattern,
  [System.Text.RegularExpressions.RegexOptions]::Singleline
)) {
  throw 'The gallery catalog block could not be found.'
}
$catalogReplacement = "const assets = $assetJson;`r`nconst sounds = $soundJson;"
$updatedHtml = [System.Text.RegularExpressions.Regex]::Replace(
  $html,
  $catalogPattern,
  $catalogReplacement,
  [System.Text.RegularExpressions.RegexOptions]::Singleline
)

$updatedHtml = $updatedHtml.Replace(
  'Curated from the Legacy Collection. Nothing here has been copied into the game.',
  'Complete visual inventory of Scicon project art and the full Legacy Collection. The catalog refreshes whenever you use the desktop shortcut.'
)
$updatedHtml = $updatedHtml.Replace(
  '<span><strong>CC0 licensed</strong> by the included public license.</span>',
  '<span><strong>All available art</strong> from the Scicon project and Legacy Collection. Legacy assets use the included CC0 public license.</span>'
)
$updatedHtml = $updatedHtml.Replace(
  '<h2>Space Shooter Sound Effects</h2>',
  '<h2>Available Sound Library</h2>'
)
$updatedHtml = $updatedHtml.Replace(
  '`${item.name} ${item.path}`.toLowerCase().includes(needle)',
  '`${item.name} ${item.path} ${item.pack} ${item.category} ${item.source}`.toLowerCase().includes(needle)'
)
$updatedHtml = $updatedHtml.Replace(
  '<span class="kind">${item.kind}</span>`;',
  '<span class="kind">${item.kind}</span> <span class="kind">${item.source}</span>`;'
)

$updatedHtml = [System.Text.RegularExpressions.Regex]::Replace(
  $updatedHtml,
  '<p class="sub">.*?</p>',
  '<p class="sub">Space-shooter-ready art stays up front. Human, fantasy, side-scroller, melee, and ground-world packs remain available under Legacy Extras.</p>',
  [System.Text.RegularExpressions.RegexOptions]::Singleline
)

$controlsMarkup = @'
  <div class="controls">
    <input id="search" type="search" placeholder="Search filenames or folders" autocomplete="off">
    <button class="in-game-toggle" id="inGameToggle" type="button" aria-pressed="false">&#9733; In Game</button>
    <div class="library-toggle" id="libraryToggle" role="group" aria-label="Gallery library">
      <button type="button" data-library="space" aria-pressed="true">Space Shooter</button>
      <button type="button" data-library="extras" aria-pressed="false">Legacy Extras</button>
    </div>
    <select id="category" aria-label="Simple asset category"></select>
    <div class="count" id="count"></div>
  </div>
  <div class="selection-toolbar" id="selectionToolbar" hidden>
    <strong id="selectionCount">0 selected</strong>
    <button type="button" id="selectVisible">Select visible</button>
    <button type="button" id="clearSelection">Clear</button>
    <button type="button" class="bulk-delete" id="deleteSelected">Delete selected</button>
  </div>
</header>
'@
$updatedHtml = [System.Text.RegularExpressions.Regex]::Replace(
  $updatedHtml,
  '<div class="controls">.*?</header>',
  $controlsMarkup.Trim(),
  [System.Text.RegularExpressions.RegexOptions]::Singleline
)

$updatedHtml = [System.Text.RegularExpressions.Regex]::Replace(
  $updatedHtml,
  '(?m)^  \.library[^\r\n]*(?:\r?\n)?',
  ''
)
$updatedHtml = [System.Text.RegularExpressions.Regex]::Replace(
  $updatedHtml,
  '(?m)^  /\* In-game filter \*/\r?\n(?:.*\r?\n)*?^  /\* End in-game filter \*/\r?\n?',
  ''
)
$controlsCss = @'
  .controls { display:grid; grid-template-columns:minmax(220px,1fr) auto auto minmax(180px,280px) auto; gap:8px; align-items:center; }
  /* In-game filter */
  .in-game-toggle { min-height:40px; padding:8px 14px; border:1px solid #ffd94d; border-radius:6px; background:#5e4700; color:#fff3a3; box-shadow:inset 0 0 0 1px #9d7800,0 0 12px rgba(255,205,37,.16); font:800 12px/1 "Segoe UI",Arial,sans-serif; letter-spacing:.04em; white-space:nowrap; cursor:pointer; }
  .in-game-toggle:hover { background:#806000; color:#fffbd7; }
  .in-game-toggle[aria-pressed="true"] { background:#ffd429; color:#201800; border-color:#fff2a0; box-shadow:inset 0 0 0 1px #fff4ad,0 0 18px rgba(255,212,41,.45); }
  .in-game-toggle:focus-visible { outline:2px solid var(--mint); outline-offset:2px; }
  .usage-reference { margin-top:6px; padding:5px 6px; border-left:2px solid #e8bb22; border-radius:2px; background:#171a16; color:#f4d96a; font-size:10px; line-height:1.35; word-break:break-word; }
  .in-game-kind { border-color:#9b7612; background:#342a0b; color:#ffe278; }
  /* End in-game filter */
  .library-toggle { display:flex; min-height:40px; padding:3px; border:1px solid var(--line); border-radius:6px; background:#0b121a; }
  .library-toggle button { min-height:32px; padding:6px 11px; border:0; border-radius:4px; background:transparent; color:var(--muted); font:700 12px/1 "Segoe UI",Arial,sans-serif; white-space:nowrap; cursor:pointer; }
  .library-toggle button[aria-pressed="true"] { background:#153447; color:var(--cyan); box-shadow:inset 0 0 0 1px #28769b; }
  .library-toggle button:focus-visible { outline:2px solid var(--mint); outline-offset:2px; }
'@
$updatedHtml = [System.Text.RegularExpressions.Regex]::Replace(
  $updatedHtml,
  '(?m)^  \.controls \{[^\r\n]*\}',
  $controlsCss.TrimEnd()
)

$updatedHtml = $updatedHtml.Replace('  .asset button { display:block;', '  .asset-preview { display:block;')
$updatedHtml = $updatedHtml.Replace('  .asset > button { display:block;', '  .asset-preview { display:block;')
$updatedHtml = $updatedHtml.Replace('.asset button { height:128px; }', '.asset-preview { height:128px; }')
$updatedHtml = $updatedHtml.Replace('.asset > button { height:128px; }', '.asset-preview { height:128px; }')
$updatedHtml = [System.Text.RegularExpressions.Regex]::Replace(
  $updatedHtml,
  '(?m)^  /\* Copy-path controls \*/\r?\n(?:.*\r?\n)*?^  /\* End copy-path controls \*/\r?\n?',
  ''
)
$copyPathCss = @'
  /* Copy-path controls */
  .asset { position:relative; }
  .asset.is-selected { border-color:var(--cyan); box-shadow:0 0 0 1px var(--cyan),0 0 18px rgba(57,211,255,.22); }
  .asset-selector { position:absolute; top:7px; right:7px; z-index:3; display:grid; place-items:center; width:28px; height:28px; border:1px solid #507086; border-radius:6px; background:rgba(6,13,19,.9); box-shadow:0 2px 8px rgba(0,0,0,.55); cursor:pointer; }
  .asset-selector:hover { border-color:var(--cyan); background:#102b3b; }
  .asset-selector input { width:17px; height:17px; min-height:0; padding:0; margin:0; accent-color:#24caff; cursor:pointer; }
  .asset-selector:has(input:focus-visible) { outline:2px solid var(--mint); outline-offset:2px; }
  .meta-actions { display:flex; align-items:flex-end; justify-content:space-between; gap:7px; margin-top:4px; }
  .meta-tags { min-width:0; }
  .meta-controls { display:flex; flex:0 0 auto; gap:5px; }
  .copy-path { flex:0 0 auto; min-height:28px; padding:5px 8px; border:1px solid #28769b; border-radius:5px; background:#102533; color:var(--cyan); font:700 10px/1 "Segoe UI",Arial,sans-serif; cursor:pointer; }
  .copy-path:hover { background:#153b50; border-color:var(--cyan); }
  .copy-path:focus-visible { outline:2px solid var(--mint); outline-offset:2px; }
  .copy-path.copied { border-color:#42c889; background:#123a2b; color:var(--mint); }
  .delete-asset { flex:0 0 auto; min-height:28px; padding:5px 8px; border:1px solid #8c3340; border-radius:5px; background:#31141a; color:#ff9ba8; font:800 10px/1 "Segoe UI",Arial,sans-serif; cursor:pointer; }
  .delete-asset:hover { background:#541a24; border-color:#ff5268; color:#ffd6db; }
  .delete-asset:focus-visible { outline:2px solid #ff6a7c; outline-offset:2px; }
  .delete-asset:disabled { opacity:.55; cursor:wait; }
  .selection-toolbar { display:flex; align-items:center; justify-content:flex-end; gap:7px; margin-top:9px; padding:7px; border:1px solid #31556b; border-radius:7px; background:#0b151e; }
  .selection-toolbar[hidden] { display:none; }
  .selection-toolbar strong { margin-right:auto; color:var(--cyan); font-size:12px; }
  .selection-toolbar button { min-height:32px; padding:6px 10px; border:1px solid #31556b; border-radius:5px; background:#112532; color:#c7d7e1; font:750 11px/1 "Segoe UI",Arial,sans-serif; cursor:pointer; }
  .selection-toolbar button:hover { border-color:var(--cyan); color:#fff; }
  .selection-toolbar .bulk-delete { border-color:#9f3443; background:#43151d; color:#ffadb8; }
  .selection-toolbar .bulk-delete:hover { border-color:#ff5268; background:#611c28; color:#fff; }
  .selection-toolbar button:focus-visible { outline:2px solid var(--mint); outline-offset:2px; }
  .gallery-toast { position:fixed; right:18px; bottom:18px; z-index:1000; max-width:min(420px,calc(100vw - 36px)); padding:11px 14px; border:1px solid #42c889; border-radius:7px; background:#10281f; color:#baf8d7; box-shadow:0 10px 30px rgba(0,0,0,.45); font:700 12px/1.4 "Segoe UI",Arial,sans-serif; }
  .gallery-toast.error { border-color:#ff5268; background:#351319; color:#ffd2d8; }
  .audio-copy-row { display:flex; align-items:center; justify-content:space-between; gap:8px; }
  /* End copy-path controls */
'@
$updatedHtml = [System.Text.RegularExpressions.Regex]::Replace(
  $updatedHtml,
  '(?m)^(  \.kind \{[^\r\n]*\})',
  '$1' + "`r`n" + $copyPathCss.TrimEnd()
)

$updatedHtml = [System.Text.RegularExpressions.Regex]::Replace(
  $updatedHtml,
  '(?m)^  /\* Scicon A/V preview \*/\r?\n(?:.*\r?\n)*?^  /\* End Scicon A/V preview \*/\r?\n?',
  ''
)
$updatedHtml = [System.Text.RegularExpressions.Regex]::Replace(
  $updatedHtml,
  '(?m)^  \.(?:viewer-av(?:\[hidden\])?(?: button| audio)?|av-kind) \{[^\r\n]*\}\r?\n?',
  ''
)
$viewerCss = @'
  .viewer-info { margin-top:10px; color:var(--muted); }
  /* Scicon A/V preview */
  .viewer-av { display:flex; flex-wrap:wrap; align-items:center; justify-content:center; gap:9px; width:min(720px,100%); margin:14px auto 0; }
  .viewer-av[hidden] { display:none; }
  .viewer-av button { min-height:42px; padding:9px 14px; border:1px solid #28769b; border-radius:6px; background:#153447; color:var(--cyan); font:700 13px/1.2 "Segoe UI",Arial,sans-serif; cursor:pointer; }
  .viewer-av span { color:var(--mint); font-weight:700; }
  .viewer-av audio { display:none; }
  .av-kind { color:var(--mint); }
  /* End Scicon A/V preview */
'@
$updatedHtml = [System.Text.RegularExpressions.Regex]::Replace(
  $updatedHtml,
  '(?m)^  \.viewer-info \{[^\r\n]*\}',
  $viewerCss.TrimEnd()
)

$viewerBodyMarkup = @'
  <div class="viewer-body">
    <img id="viewerImage" alt="">
    <div class="viewer-av" id="viewerAv" hidden>
      <span id="viewerAvStatus">&#128266; Sound starts automatically</span>
      <button type="button" id="replayAvPreview">Replay animation + sound</button>
      <audio id="viewerAudio" preload="auto"></audio>
    </div>
    <div class="viewer-info" id="viewerInfo"></div>
  </div>
'@
$updatedHtml = [System.Text.RegularExpressions.Regex]::Replace(
  $updatedHtml,
  '<div class="viewer-body">.*?</div>\s*</dialog>',
  $viewerBodyMarkup.Trim() + "`r`n</dialog>",
  [System.Text.RegularExpressions.RegexOptions]::Singleline
)

$galleryScript = @'
const search = document.querySelector('#search');
const category = document.querySelector('#category');
const inGameToggle = document.querySelector('#inGameToggle');
const libraryButtons = [...document.querySelectorAll('[data-library]')];
const count = document.querySelector('#count');
const sections = document.querySelector('#sections');
const audioGrid = document.querySelector('#audioGrid');
const viewer = document.querySelector('#viewer');
const viewerImage = document.querySelector('#viewerImage');
const viewerAv = document.querySelector('#viewerAv');
const viewerAudio = document.querySelector('#viewerAudio');
const viewerAvStatus = document.querySelector('#viewerAvStatus');
const replayAvPreview = document.querySelector('#replayAvPreview');
const viewerTitle = document.querySelector('#viewerTitle');
const viewerInfo = document.querySelector('#viewerInfo');
const selectionToolbar = document.querySelector('#selectionToolbar');
const selectionCount = document.querySelector('#selectionCount');
const selectVisibleButton = document.querySelector('#selectVisible');
const clearSelectionButton = document.querySelector('#clearSelection');
const deleteSelectedButton = document.querySelector('#deleteSelected');
let activeLibrary = 'space';
let inGameOnly = false;
let categories = [];
let currentViewerItem = null;
let renderedAssetPaths = [];
const selectedAssetPaths = new Set();
const interactiveGallery = location.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(location.hostname);
const assetUrl = value => {
  const item = typeof value === 'string' ? { path: value, absolutePath: '' } : value;
  if (interactiveGallery && item.absolutePath) return `/api/file?path=${encodeURIComponent(item.absolutePath)}`;
  return encodeURI(item.path).replaceAll('#','%23');
};
const humanBytes = value => value < 1024 ? `${value} B` : `${(value / 1024).toFixed(1)} KB`;
const transparentPixel = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';
const simpleCategoryOrder = ['All GIFs', 'Sprite Sheets', 'Simple Arcade Kit', 'Ships', 'Bosses', 'Enemies', 'UI & Menus', 'Backgrounds', 'Props & Effects', 'Items & Power-Ups', 'Characters', 'Other'];
async function copyItemPath(item, button) {
  const value = item.absolutePath;
  const original = button.textContent;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
    } else {
      const field = document.createElement('textarea');
      field.value = value;
      field.setAttribute('readonly', '');
      field.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
      document.body.append(field);
      field.select();
      if (!document.execCommand('copy')) throw new Error('Copy command failed');
      field.remove();
    }
    button.textContent = 'Copied!';
    button.classList.add('copied');
  } catch {
    button.textContent = 'Copy failed';
  }
  window.setTimeout(() => {
    button.textContent = original;
    button.classList.remove('copied');
  }, 1400);
}
function showGalleryToast(message, isError = false) {
  document.querySelector('.gallery-toast')?.remove();
  const toast = document.createElement('div');
  toast.className = `gallery-toast${isError ? ' error' : ''}`;
  toast.textContent = message;
  document.body.append(toast);
  window.setTimeout(() => toast.remove(), 4200);
}
function inGameDeleteWarning(item, usageLocations = item.usageLocations || []) {
  const locations = usageLocations.length ? `\n\nUsed in:\n${usageLocations.join('\n')}` : '';
  return `WARNING: ${item.name} is currently used by the game.${locations}\n\nDeleting it can create missing artwork in gameplay. Are you absolutely sure you want to move it to the Recycle Bin?`;
}
function bulkDeleteWarning(items) {
  const usedItems = items.filter(item => item.inGame);
  if (!usedItems.length) {
    return `Delete ${items.length} selected ${items.length === 1 ? 'asset' : 'assets'}?\n\nThe files will be moved to the Windows Recycle Bin and removed from this gallery.`;
  }
  const usedDetails = usedItems.slice(0, 12).map(item => {
    const locations = (item.usageLocations || []).slice(0, 3);
    return `- ${item.name}${locations.length ? `\n  Used in: ${locations.join(' | ')}` : ''}`;
  }).join('\n');
  const remaining = usedItems.length > 12 ? `\n- ...and ${usedItems.length - 12} more used assets` : '';
  return `WARNING: ${usedItems.length} of the ${items.length} selected assets ${usedItems.length === 1 ? 'is' : 'are'} currently used by the game.\n\n${usedDetails}${remaining}\n\nDeleting them can create missing artwork in gameplay. Are you absolutely sure you want to move all ${items.length} selected files to the Recycle Bin?`;
}
async function sendDeleteRequest(item, confirmInGame) {
  return fetch('/api/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ absolutePath: item.absolutePath, confirmInGame }),
  });
}
async function deleteGalleryItem(item, button) {
  if (!interactiveGallery) {
    window.alert('Real deletion is available from the desktop shortcut: Scicon Space Sprite Gallery. The direct file version is read-only for browser safety.');
    return;
  }

  const approved = window.confirm(item.inGame
    ? inGameDeleteWarning(item)
    : `Delete ${item.name}?\n\nThe file will be moved to the Windows Recycle Bin and removed from this gallery.`);
  if (!approved) return;

  const original = button.textContent;
  button.disabled = true;
  button.textContent = 'Deleting...';
  try {
    let response = await sendDeleteRequest(item, item.inGame === true);
    let result = await response.json();
    if (response.status === 409 && result.requiresConfirmation) {
      const confirmed = window.confirm(inGameDeleteWarning(item, result.usageLocations || []));
      if (!confirmed) return;
      response = await sendDeleteRequest(item, true);
      result = await response.json();
    }
    if (!response.ok) throw new Error(result.error || 'Delete failed.');

    const index = assets.findIndex(candidate => candidate.absolutePath === item.absolutePath);
    if (index >= 0) assets.splice(index, 1);
    if (currentViewerItem?.absolutePath === item.absolutePath) viewer.close();
    updateCategories();
    render();
    showGalleryToast(`${item.name} was moved to the Recycle Bin.`);
  } catch (error) {
    button.disabled = false;
    button.textContent = original;
    showGalleryToast(error instanceof Error ? error.message : String(error), true);
  }
}
function updateSelectionToolbar() {
  for (const value of [...selectedAssetPaths]) {
    if (!assets.some(item => item.absolutePath === value)) selectedAssetPaths.delete(value);
  }
  selectionToolbar.hidden = selectedAssetPaths.size === 0;
  selectionCount.textContent = `${selectedAssetPaths.size} selected`;
}
async function deleteSelectedGalleryItems() {
  const items = assets.filter(item => selectedAssetPaths.has(item.absolutePath));
  if (!items.length) return;
  if (!interactiveGallery) {
    window.alert('Real deletion is available from the desktop shortcut: Scicon Space Sprite Gallery. The direct file version is read-only for browser safety.');
    return;
  }
  if (!window.confirm(bulkDeleteWarning(items))) return;

  const original = deleteSelectedButton.textContent;
  deleteSelectedButton.disabled = true;
  deleteSelectedButton.textContent = `Deleting 0/${items.length}...`;
  const removedPaths = new Set();
  const failures = [];
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    deleteSelectedButton.textContent = `Deleting ${index + 1}/${items.length}...`;
    try {
      let response = await sendDeleteRequest(item, item.inGame === true);
      let result = await response.json();
      if (response.status === 409 && result.requiresConfirmation) {
        const confirmed = window.confirm(inGameDeleteWarning(item, result.usageLocations || []));
        if (!confirmed) {
          failures.push(`${item.name}: skipped`);
          continue;
        }
        response = await sendDeleteRequest(item, true);
        result = await response.json();
      }
      if (!response.ok) throw new Error(result.error || 'Delete failed.');
      removedPaths.add(item.absolutePath);
      selectedAssetPaths.delete(item.absolutePath);
      if (currentViewerItem?.absolutePath === item.absolutePath) viewer.close();
    } catch (error) {
      failures.push(`${item.name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  for (let index = assets.length - 1; index >= 0; index -= 1) {
    if (removedPaths.has(assets[index].absolutePath)) assets.splice(index, 1);
  }
  deleteSelectedButton.disabled = false;
  deleteSelectedButton.textContent = original;
  updateCategories();
  render();
  if (failures.length) {
    showGalleryToast(`${removedPaths.size} moved to the Recycle Bin. ${failures.length} could not be deleted.`, true);
  } else {
    showGalleryToast(`${removedPaths.size} selected ${removedPaths.size === 1 ? 'asset was' : 'assets were'} moved to the Recycle Bin.`);
  }
}
const isInActiveLibrary = item => item.library === activeLibrary;
const isInCurrentView = item => isInActiveLibrary(item) && (!inGameOnly || item.inGame);
function updateCategories() {
  const previous = category.value;
  const available = new Set(assets.filter(isInCurrentView).flatMap(item => item.simpleCategories || [item.simpleCategory]));
  categories = simpleCategoryOrder.filter(value => available.has(value));
  category.innerHTML = '<option value="">All simple categories</option>' + categories.map(value => `<option>${value}</option>`).join('');
  category.value = categories.includes(previous) ? previous : '';
}
function loadViewerImage(item, restart = false) {
  if (restart) {
    viewerImage.onload = null;
    viewerImage.src = transparentPixel;
    void viewerImage.offsetWidth;
  }
  viewerImage.alt = item.name;
  viewerImage.onload = () => { viewerInfo.textContent = `${item.path} | ${viewerImage.naturalWidth} x ${viewerImage.naturalHeight} | ${humanBytes(item.bytes)}`; };
  viewerImage.src = assetUrl(item);
}
async function playSynchronizedPreview() {
  if (!currentViewerItem?.audioPreview) return;
  viewerAudio.pause();
  viewerAudio.currentTime = 0;
  loadViewerImage(currentViewerItem, true);
  viewerAvStatus.textContent = '\u{1F50A} Sound playing automatically';
  try {
    await viewerAudio.play();
  } catch {
    viewerAvStatus.textContent = '\u{1F50A} Use Replay if your browser blocked automatic sound';
  }
}
function openViewer(item) {
  currentViewerItem = item;
  viewerAudio.pause();
  viewerTitle.textContent = item.name;
  if (item.audioPreview) {
    viewerAudio.src = assetUrl({ path: item.audioPreview, absolutePath: item.audioPreviewAbsolutePath || '' });
    viewerAudio.load();
    viewerAv.hidden = false;
  } else {
    viewerAudio.removeAttribute('src');
    viewerAudio.load();
    viewerAv.hidden = true;
  }
  viewerInfo.textContent = '';
  viewerInfo.hidden = true;
  viewer.showModal();
  if (item.audioPreview) void playSynchronizedPreview();
  else loadViewerImage(item);
}
replayAvPreview.addEventListener('click', () => void playSynchronizedPreview());
viewer.addEventListener('close', () => {
  viewerAudio.pause();
  currentViewerItem = null;
});
function render() {
  const needle = search.value.trim().toLowerCase();
  const selected = category.value;
  const libraryAssets = assets.filter(isInActiveLibrary);
  const viewAssets = libraryAssets.filter(item => !inGameOnly || item.inGame);
  const filtered = viewAssets.filter(item => (!selected || (item.simpleCategories || [item.simpleCategory]).includes(selected)) && (!needle || `${item.name} ${item.path} ${item.pack} ${(item.simpleCategories || [item.simpleCategory]).join(' ')} ${item.category} ${item.source} ${(item.usageLocations || []).join(' ')}`.toLowerCase().includes(needle)));
  renderedAssetPaths = filtered.map(item => item.absolutePath);
  const label = { space: 'Space Shooter', extras: 'Legacy Extras' }[activeLibrary];
  count.textContent = inGameOnly
    ? `${filtered.length} of ${viewAssets.length} in-game images`
    : `${filtered.length} of ${libraryAssets.length} ${label} images`;
  sections.innerHTML = '';
  const renderGroups = selected ? [selected] : categories;
  for (const group of renderGroups) {
    const items = selected ? filtered : filtered.filter(item => item.simpleCategory === group);
    if (!items.length) continue;
    const section = document.createElement('section');
    const heading = document.createElement('h2');
    heading.textContent = `${group} (${items.length})`;
    const grid = document.createElement('div');
    grid.className = 'grid';
    for (const item of items) {
      const card = document.createElement('article');
      card.className = 'asset';
      card.classList.toggle('is-selected', selectedAssetPaths.has(item.absolutePath));
      const selector = document.createElement('label');
      selector.className = 'asset-selector';
      selector.title = `Select ${item.name}`;
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = selectedAssetPaths.has(item.absolutePath);
      checkbox.setAttribute('aria-label', `Select ${item.name}`);
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) selectedAssetPaths.add(item.absolutePath);
        else selectedAssetPaths.delete(item.absolutePath);
        card.classList.toggle('is-selected', checkbox.checked);
        updateSelectionToolbar();
      });
      selector.append(checkbox);
      const preview = document.createElement('button');
      preview.type = 'button';
      preview.className = 'asset-preview';
      preview.title = `Preview ${item.name}`;
      const image = document.createElement('img');
      image.loading = 'lazy';
      image.src = assetUrl(item);
      image.alt = item.name;
      preview.append(image);
      preview.addEventListener('click', () => openViewer(item));
      const meta = document.createElement('div');
      meta.className = 'meta';
      const avBadge = item.audioPreview ? ' <span class="kind av-kind">&#128266; SOUND</span>' : '';
      meta.innerHTML = `<div class="name" title="${item.name.replaceAll('"','&quot;')}">${item.name}</div>`;
      const actions = document.createElement('div');
      actions.className = 'meta-actions';
      const tags = document.createElement('div');
      tags.className = 'meta-tags';
      const inGameBadge = item.inGame ? ' <span class="kind in-game-kind">USED IN GAME</span>' : '';
      tags.innerHTML = `<span class="kind">${item.kind}</span> <span class="kind">${item.source}</span>${inGameBadge}${avBadge}`;
      const copyButton = document.createElement('button');
      copyButton.type = 'button';
      copyButton.className = 'copy-path';
      copyButton.textContent = 'Copy path';
      copyButton.title = `Copy full file path for ${item.name}`;
      copyButton.setAttribute('aria-label', `Copy full file path for ${item.name}`);
      copyButton.addEventListener('click', () => void copyItemPath(item, copyButton));
      const deleteButton = document.createElement('button');
      deleteButton.type = 'button';
      deleteButton.className = 'delete-asset';
      deleteButton.textContent = 'Delete';
      deleteButton.title = item.inGame ? `Delete ${item.name} (used in game — confirmation required)` : `Delete ${item.name}`;
      deleteButton.setAttribute('aria-label', `Delete ${item.name}`);
      deleteButton.addEventListener('click', () => void deleteGalleryItem(item, deleteButton));
      const controls = document.createElement('div');
      controls.className = 'meta-controls';
      controls.append(copyButton, deleteButton);
      actions.append(tags, controls);
      meta.append(actions);
      card.append(selector, preview, meta);
      grid.append(card);
    }
    section.append(heading, grid);
    sections.append(section);
  }
  if (!filtered.length) sections.innerHTML = '<div class="empty">No matching assets in this view.</div>';
  updateSelectionToolbar();
}
for (const button of libraryButtons) {
  button.addEventListener('click', () => {
    activeLibrary = button.dataset.library;
    if (activeLibrary === 'extras' && inGameOnly) {
      inGameOnly = false;
      inGameToggle.setAttribute('aria-pressed', 'false');
    }
    for (const candidate of libraryButtons) candidate.setAttribute('aria-pressed', String(candidate === button));
    updateCategories();
    render();
  });
}
inGameToggle.addEventListener('click', () => {
  inGameOnly = !inGameOnly;
  inGameToggle.setAttribute('aria-pressed', String(inGameOnly));
  if (inGameOnly && activeLibrary !== 'space') {
    activeLibrary = 'space';
    for (const candidate of libraryButtons) candidate.setAttribute('aria-pressed', String(candidate.dataset.library === 'space'));
  }
  updateCategories();
  render();
});
selectVisibleButton.addEventListener('click', () => {
  for (const absolutePath of renderedAssetPaths) selectedAssetPaths.add(absolutePath);
  render();
});
clearSelectionButton.addEventListener('click', () => {
  selectedAssetPaths.clear();
  render();
});
deleteSelectedButton.addEventListener('click', () => void deleteSelectedGalleryItems());
updateCategories();
'@
$updatedHtml = [System.Text.RegularExpressions.Regex]::Replace(
  $updatedHtml,
  "const search = document\.querySelector\('#search'\);.*?(?=for \(const sound of sounds\) \{)",
  $galleryScript.Trim() + "`r`n",
  [System.Text.RegularExpressions.RegexOptions]::Singleline
)
$soundScript = @'
for (const sound of sounds) {
  const item = document.createElement('div');
  item.className = 'audio-item';
  const row = document.createElement('div');
  row.className = 'audio-copy-row';
  const label = document.createElement('div');
  label.className = 'name';
  label.textContent = sound.name;
  const copyButton = document.createElement('button');
  copyButton.type = 'button';
  copyButton.className = 'copy-path';
  copyButton.textContent = 'Copy path';
  copyButton.title = `Copy full file path for ${sound.name}`;
  copyButton.setAttribute('aria-label', `Copy full file path for ${sound.name}`);
  copyButton.addEventListener('click', () => void copyItemPath(sound, copyButton));
  row.append(label, copyButton);
  const player = document.createElement('audio');
  player.controls = true;
  player.preload = 'none';
  player.src = assetUrl(sound);
  item.append(row, player);
  audioGrid.append(item);
}
'@
$updatedHtml = [System.Text.RegularExpressions.Regex]::Replace(
  $updatedHtml,
  'for \(const sound of sounds\) \{.*?\}(?=\s*if \(!sounds\.length\))',
  $soundScript.Trim(),
  [System.Text.RegularExpressions.RegexOptions]::Singleline
)
$updatedHtml = $updatedHtml.Replace(
  "if (!sounds.length) document.querySelector('#audioSection').hidden = true;`r`nsearch.addEventListener('input', render);",
  "if (!sounds.length) document.querySelector('#audioSection').hidden = true;`r`nupdateCategories();`r`nsearch.addEventListener('input', render);"
)

$utf8WithoutBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($GalleryPath, $updatedHtml, $utf8WithoutBom)

$result = [pscustomobject][ordered]@{
  gallery = $GalleryPath
  totalImages = $sortedAssets.Count
  spaceImages = @($sortedAssets | Where-Object library -eq 'space').Count
  legacyExtraImages = @($sortedAssets | Where-Object library -eq 'extras').Count
  sciconImages = $projectImageFiles.Count
  animationImages = @($sortedAssets | Where-Object { $_.source -eq 'Scicon project' -and ($_.kind -eq 'GIF' -or $_.path -match '(^|/)(animations|previews)(/|$)') }).Count
  legacyImages = $legacyImageFiles.Count
  totalSounds = $sortedSounds.Count
  sciconSounds = $projectAudioFiles.Count
  legacySounds = $legacyAudioFiles.Count
  categories = $simpleCategoryOrder.Count
}
$result | ConvertTo-Json -Compress

if ($Open) {
  Start-Process -FilePath $GalleryPath
}
