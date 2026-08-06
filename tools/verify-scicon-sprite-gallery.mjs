#!/usr/bin/env node
// Validate the generated local sprite gallery without opening a browser.

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const galleryPath = "C:\\Users\\scott\\Downloads\\Legacy Collection\\Scicon Space Sprite Gallery.html";
const galleryRoot = path.dirname(galleryPath);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const gameArtRoot = path.join(projectRoot, "public", "game-art");
const prototypeArtRoot = path.join(projectRoot, "director-data", "prototype-assets");
const sourceArtRoot = path.join(projectRoot, "tools");
const archiveArtRoot = path.join(projectRoot, "archive");
const appArtRoot = path.join(projectRoot, "public");
const marketingArtRoot = path.join(projectRoot, "marketing");
const documentationArtRoot = path.join(projectRoot, "docs");
const designConceptArtRoot = path.join(projectRoot, "director", "design", "concepts");
const imageExtensions = new Set([".png", ".gif", ".jpg", ".jpeg", ".webp", ".svg", ".bmp", ".avif"]);
const html = fs.readFileSync(galleryPath, "utf8");
const normalizeAbsolutePath = (value) => path.resolve(value).toLocaleLowerCase("en-US");
const isPathInside = (root, candidate) => {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative !== "" &&
    relative !== ".." &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative);
};

for (const [label, root] of [
  ["Project game art", gameArtRoot],
  ["Test/prototype art", prototypeArtRoot],
  ["Builder source art", sourceArtRoot],
  ["Archived art", archiveArtRoot],
  ["App/product art", appArtRoot],
  ["Marketing art", marketingArtRoot],
  ["Documentation art", documentationArtRoot],
  ["Director design concepts", designConceptArtRoot],
]) {
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    throw new Error(`${label} root is missing: ${root}`);
  }
}

for (const [, source] of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)) {
  // Compile only. The gallery expects browser globals, so it is not executed here.
  new Function(source);
}

const parseArray = (name) => {
  const match = html.match(new RegExp(`const ${name} = (\\[[^\\n]*\\]);`));
  if (!match) throw new Error(`Could not find ${name} array`);
  return JSON.parse(match[1]);
};

const assets = parseArray("assets");
const sounds = parseArray("sounds");
const expectedSimpleCategories = [
  "All GIFs",
  "Sprite Sheets",
  "Simple Arcade Kit",
  "Ships",
  "Bosses",
  "Elite Enemies",
  "Test Bosses & Prototypes",
  "Enemies",
  "UI & Menus",
  "Backgrounds",
  "Props & Effects",
  "Items & Power-Ups",
  "Characters",
  "Source Art",
  "App & Product Art",
  "Marketing",
  "Documentation & References",
  "Design Concepts",
  "Archived & Superseded",
  "Other",
];
const actualSimpleCategories = [...new Set(assets.flatMap((item) => item.simpleCategories || [item.simpleCategory]))];
const unexpectedSimpleCategories = actualSimpleCategories.filter((value) => !expectedSimpleCategories.includes(value));
const missingSimpleCategories = expectedSimpleCategories.filter((value) => !actualSimpleCategories.includes(value));
if (unexpectedSimpleCategories.length || missingSimpleCategories.length) {
  throw new Error(`Simple category mismatch. Unexpected: ${unexpectedSimpleCategories.join(", ") || "none"}; missing: ${missingSimpleCategories.join(", ") || "none"}`);
}
if (assets.some((item) => !item.simpleCategory)) throw new Error("Gallery items missing a simple category");
if (assets.some((item) => !Array.isArray(item.simpleCategories) || !item.simpleCategories.includes(item.simpleCategory))) {
  throw new Error("Gallery items are missing multi-category metadata");
}
if (assets.some((item) => item.kind === "GIF" && !item.simpleCategories.includes("All GIFs"))) throw new Error("Not every GIF is in All GIFs");
const bossAnimation = assets.find((item) => item.name === "paywall-bastion-animation-preview.gif");
if (!bossAnimation?.simpleCategories.includes("Bosses")) throw new Error("Boss GIFs are not also discoverable under Bosses");
const bossAtlas = assets.find((item) => item.path.includes("scicon-stage20-expansion-v1") && item.name === "source-atlas.png");
if (!bossAtlas?.simpleCategories.includes("Bosses") || !bossAtlas.simpleCategories.includes("Sprite Sheets")) {
  throw new Error("Boss atlases are not cross-categorized as Bosses and Sprite Sheets");
}
const eliteEncounterAssets = assets.filter((item) => item.absolutePath.includes(`${path.sep}mini-boss-lab-v2${path.sep}`));
if (!eliteEncounterAssets.length) throw new Error("Elite encounter runtime art is missing from the Sprite Gallery");
if (eliteEncounterAssets.some((item) => (
  item.category !== "Scicon - Elite Enemies" ||
  !item.simpleCategories.includes("Elite Enemies") ||
  !item.bossGroup
))) {
  throw new Error("Elite encounter art is not clearly categorized or grouped in the Sprite Gallery");
}
if (eliteEncounterAssets.some((item) => (
  !item.inGame ||
  !item.usageLocations.some((value) => value.startsWith("services/gameplay/mini-bosses/MiniBossEncounterRegistry.ts"))
))) {
  throw new Error("Elite encounter runtime art is not marked as in-game through the shared registry");
}
const maxShotFrame = assets.find((item) => item.name === "max-shot-aura-01.png");
if (!maxShotFrame?.simpleCategories.includes("Items & Power-Ups")) throw new Error("Generated power-up frames are miscategorized");
const playerWeaponFrame = assets.find((item) => item.absolutePath.includes("scicon-player-weapon-fx-v1") && item.name === "frame-1.png");
if (
  playerWeaponFrame?.category !== "Scicon - Combat FX" ||
  !playerWeaponFrame.simpleCategories.includes("Props & Effects")
) {
  throw new Error("Generated player weapon frames are not categorized as Combat FX");
}
const requiredHeliosPrototypeAssets = [
  "helios-clawcarrier-v2-neutral.png",
  "body.closed.png",
  "body.open.png",
  "body.damaged.png",
  "claw.port.shell.png",
  "claw.port.attack.png",
  "claw.starboard.shell.png",
  "claw.starboard.attack.png",
  "rotary.port.0.png",
  "rotary.port.1.png",
  "rotary.port.2.png",
  "rotary.port.3.png",
  "rotary.starboard.0.png",
  "rotary.starboard.1.png",
  "rotary.starboard.2.png",
  "rotary.starboard.3.png",
  "muzzle.flash.0.png",
  "muzzle.flash.1.png",
  "muzzle.flash.2.png",
  "muzzle.flash.3.png",
  "leg.outer-port.png",
  "leg.inner-port.png",
  "leg.inner-starboard.png",
  "leg.outer-starboard.png",
  "mine.deploy.0.png",
  "mine.deploy.1.png",
  "mine.deploy.2.png",
  "mine.deploy.3.png",
  "gatling-tracer.0.png",
  "gatling-tracer.1.png",
  "gatling-tracer.2.png",
  "gatling-tracer.3.png",
  "heavy-shell.0.png",
  "heavy-shell.1.png",
  "heavy-shell.2.png",
  "heavy-shell.3.png",
  "reactor-pellet.0.png",
  "reactor-pellet.1.png",
  "reactor-pellet.2.png",
  "reactor-pellet.3.png",
];
for (const name of requiredHeliosPrototypeAssets) {
  const item = assets.find((candidate) => (
    candidate.name === name &&
    candidate.absolutePath.replaceAll("\\", "/").includes("/helios-clawcarrier-v2/")
  ));
  if (!item?.simpleCategories.includes("Test Bosses & Prototypes")) {
    throw new Error(`Helios runtime asset is missing from Test Bosses & Prototypes: ${name}`);
  }
}
const heliosExplosionFrames = assets.filter((item) => (
  /\/pixi\/effects\/explosion\/frame-[1-7]\.png$/
    .test(item.absolutePath.replaceAll("\\", "/"))
));
if (
  heliosExplosionFrames.length !== 7 ||
  heliosExplosionFrames.some((item) => !item.simpleCategories.includes("Test Bosses & Prototypes"))
) {
  throw new Error("Helios mine explosion frames are not discoverable under Test Bosses & Prototypes");
}
const biohazardBomb = assets.find((item) => item.name === "biohazard-bomb-e5d01d651f2f.png");
if (
  biohazardBomb?.category !== "Scicon - UI & Menus" ||
  !biohazardBomb.simpleCategories.includes("UI & Menus")
) {
  throw new Error("Generated HUD bomb icon is not categorized under UI & Menus");
}
const simpleArcadeAssets = assets.filter((item) => item.simpleCategories.includes("Simple Arcade Kit"));
if (!simpleArcadeAssets.length || simpleArcadeAssets.some((item) => !item.path.includes("scicon-simple-arcade-kit-v1"))) {
  throw new Error("Simple Arcade Kit category is missing or contains unrelated assets");
}
if (!html.includes("All simple categories")) throw new Error("Simplified category control is missing from the gallery");
if (!html.includes('id="inGameToggle"')) throw new Error("Yellow In Game filter is missing from the gallery");
if (!html.includes('.in-game-toggle[aria-pressed="true"]')) throw new Error("In Game filter highlight style is missing");
if (!/<input id="search"[^>]*>\s*<button class="in-game-toggle" id="inGameToggle"/.test(html)) {
  throw new Error("In Game filter is not immediately to the right of Search");
}
if (html.includes('data-library="scicon"')) throw new Error("Obsolete Scicon Created button is still present");
if (html.includes('data-library="animations"')) throw new Error("Obsolete Animations button is still present");
if (assets.some((item) => typeof item.inGame !== "boolean" || !Array.isArray(item.usageLocations))) {
  throw new Error("Gallery items are missing in-game reference metadata");
}
if (assets.some((item) => item.inGame !== (item.usageLocations.length > 0))) {
  throw new Error("In-game flags do not match usage locations");
}
if (assets.some((item) => item.source !== "Scicon project" && item.inGame)) {
  throw new Error("Legacy assets were incorrectly marked as used in game");
}
const inGameAssets = assets.filter((item) => item.inGame);
if (!inGameAssets.length) throw new Error("No in-game assets were discovered");
const researchHubHardRight = assets.find((item) => item.name === "researchhub-05-hard-right.png");
if (!researchHubHardRight?.inGame || !researchHubHardRight.usageLocations.some((value) => value.startsWith("services/playerShipMotion.ts:"))) {
  throw new Error("Template-based ship motion reference was not indexed correctly");
}
const assertDynamicInGameGroup = (pattern, expectedCount, locationPrefix) => {
  const matches = assets.filter((item) => pattern.test(item.absolutePath.replaceAll("\\", "/")));
  if (
    matches.length !== expectedCount ||
    matches.some((item) => !item.inGame || !item.usageLocations.some((value) => value.startsWith(locationPrefix)))
  ) {
    throw new Error(`Expected ${expectedCount} dynamically generated in-game assets from ${locationPrefix}, found ${matches.length}`);
  }
};
assertDynamicInGameGroup(/\/max-shot-aura\/frames\/max-shot-aura-\d{2}\.png$/, 8, "constants.ts:");
assertDynamicInGameGroup(/\/trace-boxes\/label\/cyan\/frames\/trace-box-label-cyan-\d{2}\.png$/, 24, "components/SquadHangar.tsx:");
assertDynamicInGameGroup(/\/selectors\/diamond\/(?:ship|mini)\/(?:lime|gold)\/frames\/diamond-selector-(?:ship|mini)-(?:lime|gold)-\d{2}\.png$/, 32, "components/SquadHangar.tsx:");
assertDynamicInGameGroup(/\/scicon-mini-squadron-pack-v1\/[^/]+\/frames\/[^/]+-\d{2}-(?:neutral|flex-in|flex-out)\.png$/, 30, "services/squadProgression.ts:");
assertDynamicInGameGroup(/\/first-place-row-idle\/parts\/first-place-crown-diamond-\d+\.png$/, 4, "components/StartScreen.tsx:");
assertDynamicInGameGroup(/\/astral-crownclaw\/animations\/decay\/frames\/astral-crownclaw-decay-frame-\d+\.png$/, 6, "constants.ts:");
assertDynamicInGameGroup(/\/paywall-decimator\/rays\/frame-\d+\.png$/, 11, "constants.ts:");
assertDynamicInGameGroup(/\/legacy\/weapon-fx\/research-(?:charge|impact)\/(?:charged|hits-5-)\d+\.png$/, 13, "services/shipAbilityService.ts:");
if (!biohazardBomb?.inGame || !biohazardBomb.usageLocations.some((value) => value.startsWith("game-config/generated-assets.json:"))) {
  throw new Error("Generated HUD bomb icon is not indexed from generated-assets.json");
}
if (!html.includes("USED IN GAME")) throw new Error("In-game card usage badge is missing");
if (html.includes("usage.className = 'usage-reference'")) throw new Error("In-game code locations are still visible on gallery cards");
const missingAbsolutePaths = [...assets, ...sounds].filter((item) => !item.absolutePath || !path.isAbsolute(item.absolutePath));
if (missingAbsolutePaths.length) throw new Error(`Gallery items missing absolute copy paths: ${missingAbsolutePaths.slice(0, 10).map((item) => item.name).join(", ")}`);
if (!html.includes("async function copyItemPath(item, button)")) throw new Error("Copy-path interaction is missing from the gallery");
if (!html.includes("copyButton.className = 'copy-path'")) throw new Error("Copy-path buttons are missing from gallery cards");
if (!html.includes("document.execCommand('copy')")) throw new Error("Local file clipboard fallback is missing from the gallery");
if (!html.includes(".asset-preview { display:block;")) throw new Error("Preview and card-action styles are not correctly separated");
if (!html.includes("async function deleteGalleryItem(item, button)")) throw new Error("Delete interaction is missing from the gallery");
if (!html.includes("deleteButton.className = item.deleteProtected ? 'delete-asset protected' : 'delete-asset'")) {
  throw new Error("Delete and protected controls are missing from gallery cards");
}
if (!html.includes("deleteButton.textContent = item.deleteProtected ? 'Protected' : 'Delete'")) {
  throw new Error("Protected Director assets are not visibly protected from deletion");
}
if (!html.includes("WARNING: ${item.name} is currently used by the game")) throw new Error("In-game deletion warning is missing");
if (!html.includes("The file will be moved to the Windows Recycle Bin")) throw new Error("Recoverable deletion notice is missing");
if (!html.includes('id="selectionToolbar"') || !html.includes("checkbox.setAttribute('aria-label', `Select ${item.name}`)")) {
  throw new Error("Top-right multi-selection controls are missing");
}
if (!html.includes("async function deleteSelectedGalleryItems()") || !html.includes("bulkDeleteWarning(items)")) {
  throw new Error("Bulk deletion workflow is missing");
}
if (html.includes('<div class="path">${item.pack}</div>') || !html.includes("viewerInfo.hidden = true")) {
  throw new Error("Visible asset location text is still present");
}
if (!html.includes('class="viewer-resize-grip"') || !html.includes("viewerResizeGrip.addEventListener('pointerdown'")) {
  throw new Error("The image preview resize grip is missing");
}
if (!html.includes("viewer.style.width = `${Math.round(width)}px`") || !html.includes("viewer.style.height = `${Math.round(height)}px`")) {
  throw new Error("The image preview resize behavior is missing");
}
if (!html.includes("const clickedBackdrop =") || !html.includes("if (clickedBackdrop) viewer.close()")) {
  throw new Error("Resize-safe image preview backdrop handling is missing");
}
const livingMachineryPreview = assets.find((item) => item.name === "first-place-row-living-machinery-idle.gif");
if (!livingMachineryPreview?.absolutePath.endsWith("first-place-row-living-machinery-idle.gif")) {
  throw new Error("Animation copy path is not registered correctly");
}
const missing = [];
for (const item of [...assets, ...sounds]) {
  const absolutePath = path.resolve(galleryRoot, item.path.replaceAll("/", path.sep));
  if (!fs.existsSync(absolutePath)) missing.push(item.path);
  if (item.audioPreview) {
    const audioPath = path.resolve(galleryRoot, item.audioPreview.replaceAll("/", path.sep));
    if (!fs.existsSync(audioPath)) missing.push(item.audioPreview);
  }
}
if (missing.length) throw new Error(`Missing gallery files: ${missing.slice(0, 10).join(", ")}`);

const listImages = (root) => {
  return fs.readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && imageExtensions.has(path.extname(entry.name).toLowerCase()))
    .map((entry) => path.resolve(entry.parentPath, entry.name));
};
const listRootImages = (root) => fs.readdirSync(root, { withFileTypes: true })
  .filter((entry) => entry.isFile() && imageExtensions.has(path.extname(entry.name).toLowerCase()))
  .map((entry) => path.resolve(root, entry.name));
const catalogPaths = new Set(assets.map((item) => normalizeAbsolutePath(item.absolutePath)));
const trackedImageFiles = execFileSync("git", ["ls-files", "-z"], {
  cwd: projectRoot,
  encoding: "utf8",
}).split("\0")
  .filter(Boolean)
  .filter((relativePath) => imageExtensions.has(path.extname(relativePath).toLowerCase()))
  .map((relativePath) => path.resolve(projectRoot, relativePath));
const uncatalogedTrackedImages = trackedImageFiles.filter(
  (filePath) => !catalogPaths.has(normalizeAbsolutePath(filePath)),
);
if (uncatalogedTrackedImages.length) {
  throw new Error(`Tracked project images missing from gallery: ${uncatalogedTrackedImages.slice(0, 10).join(", ")}`);
}
const gameArtFiles = listImages(gameArtRoot);
// Runtime review and evidence captures are QA records, not reusable sprites.
// Keep the gallery focused on source sheets, modular parts, effects, and previews.
const prototypeArtFiles = listImages(prototypeArtRoot).filter((filePath) => {
  const relativePath = path.relative(prototypeArtRoot, filePath);
  const segments = relativePath.split(path.sep);
  return !segments.includes("review") && !segments.includes("evidence");
});
const sourceArtFiles = listImages(sourceArtRoot);
const archiveArtFiles = listImages(archiveArtRoot);
const appArtFiles = listRootImages(appArtRoot);
const marketingArtFiles = listImages(marketingArtRoot);
const documentationArtFiles = listImages(documentationArtRoot);
const designConceptArtFiles = listImages(designConceptArtRoot);
const inventoryGroups = [
  {
    label: "Project game art",
    root: gameArtRoot,
    files: gameArtFiles,
    source: "Scicon project",
    category: null,
    simpleCategory: null,
    protected: false,
  },
  {
    label: "Test/prototype art",
    root: prototypeArtRoot,
    files: prototypeArtFiles,
    source: "Scicon test prototype",
    category: "Scicon - Test Bosses & Prototypes",
    simpleCategory: "Test Bosses & Prototypes",
    protected: true,
  },
  {
    label: "Builder source art",
    root: sourceArtRoot,
    files: sourceArtFiles,
    source: "Scicon source art",
    category: "Scicon - Source Art",
    simpleCategory: "Source Art",
    protected: true,
  },
  {
    label: "Archived art",
    root: archiveArtRoot,
    files: archiveArtFiles,
    source: "Scicon archive",
    category: "Scicon - Archived & Superseded",
    simpleCategory: "Archived & Superseded",
    protected: true,
  },
  {
    label: "App/product art",
    root: appArtRoot,
    files: appArtFiles,
    source: "Scicon app art",
    category: "Scicon - App & Product Art",
    simpleCategory: "App & Product Art",
    protected: true,
  },
  {
    label: "Marketing art",
    root: marketingArtRoot,
    files: marketingArtFiles,
    source: "Scicon marketing",
    category: "Scicon - Marketing",
    simpleCategory: "Marketing",
    protected: true,
  },
  {
    label: "Documentation art",
    root: documentationArtRoot,
    files: documentationArtFiles,
    source: "Scicon documentation",
    category: "Scicon - Documentation & References",
    simpleCategory: "Documentation & References",
    protected: true,
  },
  {
    label: "Director design concepts",
    root: designConceptArtRoot,
    files: designConceptArtFiles,
    source: "Scicon Director design",
    category: "Scicon - Director Design Concepts",
    simpleCategory: "Design Concepts",
    protected: true,
  },
];
for (const group of inventoryGroups) {
  const uncataloged = group.files.filter((filePath) => !catalogPaths.has(normalizeAbsolutePath(filePath)));
  if (uncataloged.length) {
    throw new Error(`${group.label} missing from gallery: ${uncataloged.slice(0, 10).join(", ")}`);
  }
  const groupAssets = assets.filter((item) => item.source === group.source);
  if (
    groupAssets.length !== group.files.length ||
    groupAssets.some((item) => !isPathInside(group.root, item.absolutePath))
  ) {
    throw new Error(`Expected exactly ${group.files.length} ${group.label} images, found ${groupAssets.length}`);
  }
  if (group.category && groupAssets.some((item) => (
    item.category !== group.category ||
    item.simpleCategory !== group.simpleCategory ||
    item.deleteProtected !== group.protected ||
    !item.protectionReason
  ))) {
    throw new Error(`${group.label} assets are not categorized and protected correctly`);
  }
}
const prototypeAssets = assets.filter((item) => item.source === "Scicon test prototype");
if (prototypeAssets.some((item) => (
  !item.simpleCategories.includes("Bosses") ||
  (/(?:sheet|atlas)/i.test(item.name) && !item.simpleCategories.includes("Sprite Sheets"))
))) {
  throw new Error("Test/prototype boss images are missing semantic Bosses or Sprite Sheets categories");
}
if (prototypeAssets.some((item) => !item.bossGroup)) {
  throw new Error("Test/prototype boss images are missing boss-group metadata");
}
if (assets.some((item) => /[\\/](?:review|evidence)[\\/]/i.test(item.absolutePath))) {
  throw new Error("Review or evidence screenshots were added to the sprite gallery");
}
const groupedProjectBossAssets = assets.filter((item) => item.source === "Scicon project" && item.simpleCategories.includes("Bosses"));
if (groupedProjectBossAssets.some((item) => !item.bossGroup)) {
  throw new Error("Project boss images are missing boss-group metadata");
}
if (!html.includes("const organizeByBoss =") || !html.includes("subgroup.className = 'asset-subgroup'")) {
  throw new Error("Collapsible boss subgroups are missing from the gallery");
}
if (new Set(assets.map((item) => normalizeAbsolutePath(item.absolutePath))).size !== assets.length) {
  throw new Error("Duplicate image paths were added to the gallery");
}

const uiMenuImages = assets.filter((item) => item.category === "Scicon - UI & Menus").length;
const interfacePackImages = assets.filter((item) => item.path.includes("scicon-interface-pack-v1")).length;
const uiSystemV2Images = assets.filter((item) => item.path.includes("scicon-ui-system-v2")).length;
if (interfacePackImages !== 62) throw new Error(`Expected 62 interface pack gallery images, found ${interfacePackImages}`);
if (uiSystemV2Images !== 460) throw new Error(`Expected 460 UI System v2 gallery images, found ${uiSystemV2Images}`);
if (!assets.some((item) => item.path.endsWith("first-place-row-living-machinery-idle.gif"))) {
  throw new Error("First-place row living-machinery idle GIF is missing from the gallery");
}

const simpleCategoryCounts = Object.fromEntries(expectedSimpleCategories.map((value) => [value, assets.filter((item) => item.simpleCategories.includes(value)).length]));
console.log(JSON.stringify({
  assets: assets.length,
  sounds: sounds.length,
  missing: 0,
  uncatalogedProjectImages: 0,
  trackedProjectImages: trackedImageFiles.length,
  gameArtImages: gameArtFiles.length,
  testPrototypeImages: prototypeAssets.length,
  sourceArtImages: sourceArtFiles.length,
  archivedImages: archiveArtFiles.length,
  appProductImages: appArtFiles.length,
  marketingImages: marketingArtFiles.length,
  documentationImages: documentationArtFiles.length,
  designConceptImages: designConceptArtFiles.length,
  inGameAssets: inGameAssets.length,
  uiMenuImages,
  interfacePackImages,
  uiSystemV2Images,
  simpleCategoryCounts
}));
