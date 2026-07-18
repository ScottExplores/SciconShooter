#!/usr/bin/env node
// Validate the generated local sprite gallery without opening a browser.

import fs from "node:fs";
import path from "node:path";

const galleryPath = "C:\\Users\\scott\\Downloads\\Legacy Collection\\Scicon Space Sprite Gallery.html";
const galleryRoot = path.dirname(galleryPath);
const html = fs.readFileSync(galleryPath, "utf8");

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
const expectedSimpleCategories = ["All GIFs", "Sprite Sheets", "Ships", "Bosses", "Enemies", "UI & Menus", "Backgrounds", "Props & Effects", "Items & Power-Ups", "Characters", "Other"];
const actualSimpleCategories = [...new Set(assets.map((item) => item.simpleCategory))];
const unexpectedSimpleCategories = actualSimpleCategories.filter((value) => !expectedSimpleCategories.includes(value));
const missingSimpleCategories = expectedSimpleCategories.filter((value) => !actualSimpleCategories.includes(value));
if (unexpectedSimpleCategories.length || missingSimpleCategories.length) {
  throw new Error(`Simple category mismatch. Unexpected: ${unexpectedSimpleCategories.join(", ") || "none"}; missing: ${missingSimpleCategories.join(", ") || "none"}`);
}
if (assets.some((item) => !item.simpleCategory)) throw new Error("Gallery items missing a simple category");
if (assets.some((item) => item.kind === "GIF" && item.simpleCategory !== "All GIFs")) throw new Error("Not every GIF is in All GIFs");
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
if (!html.includes("USED IN GAME") || !html.includes("Used in:")) throw new Error("In-game card usage labels are missing");
const missingAbsolutePaths = [...assets, ...sounds].filter((item) => !item.absolutePath || !path.isAbsolute(item.absolutePath));
if (missingAbsolutePaths.length) throw new Error(`Gallery items missing absolute copy paths: ${missingAbsolutePaths.slice(0, 10).map((item) => item.name).join(", ")}`);
if (!html.includes("async function copyItemPath(item, button)")) throw new Error("Copy-path interaction is missing from the gallery");
if (!html.includes("copyButton.className = 'copy-path'")) throw new Error("Copy-path buttons are missing from gallery cards");
if (!html.includes("document.execCommand('copy')")) throw new Error("Local file clipboard fallback is missing from the gallery");
if (!html.includes(".asset > button { display:block;")) throw new Error("Preview and copy-button styles are not correctly separated");
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

const uiMenuImages = assets.filter((item) => item.category === "Scicon - UI & Menus").length;
const interfacePackImages = assets.filter((item) => item.path.includes("scicon-interface-pack-v1")).length;
const uiSystemV2Images = assets.filter((item) => item.path.includes("scicon-ui-system-v2")).length;
if (interfacePackImages !== 62) throw new Error(`Expected 62 interface pack gallery images, found ${interfacePackImages}`);
if (uiSystemV2Images !== 460) throw new Error(`Expected 460 UI System v2 gallery images, found ${uiSystemV2Images}`);
if (!assets.some((item) => item.path.endsWith("first-place-row-living-machinery-idle.gif"))) {
  throw new Error("First-place row living-machinery idle GIF is missing from the gallery");
}

const simpleCategoryCounts = Object.fromEntries(expectedSimpleCategories.map((value) => [value, assets.filter((item) => item.simpleCategory === value).length]));
console.log(JSON.stringify({ assets: assets.length, sounds: sounds.length, missing: 0, inGameAssets: inGameAssets.length, uiMenuImages, interfacePackImages, uiSystemV2Images, simpleCategoryCounts }));
