#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const SCRIPT_DIR = path.dirname(SCRIPT_PATH);
const PROJECT_ROOT = path.dirname(SCRIPT_DIR);
const DEFAULT_PORT = 43817;
const DEFAULT_HOST = "127.0.0.1";
const galleryHome = process.env.HOME || process.env.USERPROFILE || PROJECT_ROOT;
const DEFAULT_GALLERY_PATH = process.env.SCICON_SPRITE_GALLERY
  || path.join(
    galleryHome,
    "Downloads",
    "Legacy Collection",
    "Scicon Space Sprite Gallery.html",
  );
const DEFAULT_PROJECT_ART_ROOT = path.join(PROJECT_ROOT, "public", "game-art");
const DEFAULT_PROJECT_PROTOTYPE_ART_ROOT = path.join(PROJECT_ROOT, "director-data", "prototype-assets");
const DEFAULT_PROJECT_SOURCE_ART_ROOT = path.join(PROJECT_ROOT, "tools");
const DEFAULT_PROJECT_ARCHIVE_ART_ROOT = path.join(PROJECT_ROOT, "archive");
const DEFAULT_PROJECT_APP_ART_ROOT = path.join(PROJECT_ROOT, "public");
const DEFAULT_PROJECT_MARKETING_ART_ROOT = path.join(PROJECT_ROOT, "marketing");
const DEFAULT_PROJECT_DOCUMENTATION_ART_ROOT = path.join(PROJECT_ROOT, "docs");
const DEFAULT_PROJECT_DESIGN_CONCEPT_ART_ROOT = path.join(PROJECT_ROOT, "director", "design", "concepts");
const DEFAULT_PROJECT_AUDIO_ROOT = path.join(PROJECT_ROOT, "public", "audio");
const DEFAULT_LEGACY_ROOT = process.env.SCICON_LEGACY_ROOT
  || path.join(
    galleryHome,
    "Downloads",
    "Legacy Collection",
    "Legacy Collection",
  );
const ALLOWED_EXTENSIONS = new Set([".png", ".gif", ".jpg", ".jpeg", ".webp", ".svg", ".bmp", ".avif"]);
const MAX_BODY_BYTES = 32 * 1024;

const mimeTypes = new Map([
  [".png", "image/png"],
  [".gif", "image/gif"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
  [".svg", "image/svg+xml; charset=utf-8"],
  [".bmp", "image/bmp"],
  [".avif", "image/avif"],
  [".wav", "audio/wav"],
  [".mp3", "audio/mpeg"],
  [".ogg", "audio/ogg"],
  [".m4a", "audio/mp4"],
  [".flac", "audio/flac"],
]);

const normalizeCase = (value) => path.resolve(value).toLocaleLowerCase("en-US");

export function isPathInside(root, candidate) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative !== "" && !relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative);
}

export function readGalleryCatalog(galleryPath) {
  const html = fs.readFileSync(galleryPath, "utf8");
  const assetMatch = html.match(/const assets = (\[[^\n]*\]);/);
  const soundMatch = html.match(/const sounds = (\[[^\n]*\]);/);
  if (!assetMatch || !soundMatch) throw new Error("The gallery catalog could not be read.");
  return { html, assets: JSON.parse(assetMatch[1]), sounds: JSON.parse(soundMatch[1]) };
}

function sendJson(response, statusCode, body) {
  const payload = Buffer.from(JSON.stringify(body));
  response.writeHead(statusCode, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": payload.length,
  });
  response.end(payload);
}

function sendText(response, statusCode, message) {
  const payload = Buffer.from(message);
  response.writeHead(statusCode, {
    "Cache-Control": "no-store",
    "Content-Type": "text/plain; charset=utf-8",
    "Content-Length": payload.length,
  });
  response.end(payload);
}

function requestIsSameOrigin(request, port) {
  const expectedHosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
  const host = request.headers.host?.toLocaleLowerCase("en-US");
  if (!host || !expectedHosts.has(host)) return false;
  const origin = request.headers.origin;
  return !origin || expectedHosts.has(new URL(origin).host.toLocaleLowerCase("en-US"));
}

async function readJsonBody(request) {
  const chunks = [];
  let total = 0;
  for await (const chunk of request) {
    total += chunk.length;
    if (total > MAX_BODY_BYTES) throw new Error("Request body is too large.");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function recycleFile(filePath) {
  const powerShell = path.join(
    process.env.SystemRoot || "C:\\Windows",
    "System32",
    "WindowsPowerShell",
    "v1.0",
    "powershell.exe",
  );
  const script = [
    "Add-Type -AssemblyName Microsoft.VisualBasic",
    "$target = $env:SCICON_GALLERY_DELETE_TARGET",
    "if (-not (Test-Path -LiteralPath $target -PathType Leaf)) { throw 'Asset file was not found.' }",
    "[Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile($target, [Microsoft.VisualBasic.FileIO.UIOption]::OnlyErrorDialogs, [Microsoft.VisualBasic.FileIO.RecycleOption]::SendToRecycleBin)",
  ].join("; ");
  execFileSync(powerShell, ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", script], {
    env: { ...process.env, SCICON_GALLERY_DELETE_TARGET: filePath },
    stdio: "pipe",
    windowsHide: true,
  });
}

export function removeAssetFromGalleryCatalog(galleryPath, absolutePath) {
  const { html, assets } = readGalleryCatalog(galleryPath);
  const filteredAssets = assets.filter((item) => normalizeCase(item.absolutePath) !== normalizeCase(absolutePath));
  if (filteredAssets.length === assets.length) throw new Error("The deleted asset was not present in the gallery catalog.");
  const updatedHtml = html.replace(/const assets = \[[^\n]*\];/, `const assets = ${JSON.stringify(filteredAssets)};`);
  const temporaryPath = `${galleryPath}.delete-update.tmp`;
  fs.writeFileSync(temporaryPath, updatedHtml, "utf8");
  fs.renameSync(temporaryPath, galleryPath);
}

export function createGalleryServer(options = {}) {
  const host = options.host || DEFAULT_HOST;
  const port = options.port === undefined ? DEFAULT_PORT : Number(options.port);
  const galleryPath = path.resolve(options.galleryPath || DEFAULT_GALLERY_PATH);
  const projectArtRoot = path.resolve(options.projectArtRoot || DEFAULT_PROJECT_ART_ROOT);
  const projectPrototypeArtRoot = path.resolve(options.projectPrototypeArtRoot || DEFAULT_PROJECT_PROTOTYPE_ART_ROOT);
  const projectSourceArtRoot = path.resolve(options.projectSourceArtRoot || DEFAULT_PROJECT_SOURCE_ART_ROOT);
  const projectArchiveArtRoot = path.resolve(options.projectArchiveArtRoot || DEFAULT_PROJECT_ARCHIVE_ART_ROOT);
  const projectAppArtRoot = path.resolve(options.projectAppArtRoot || DEFAULT_PROJECT_APP_ART_ROOT);
  const projectMarketingArtRoot = path.resolve(options.projectMarketingArtRoot || DEFAULT_PROJECT_MARKETING_ART_ROOT);
  const projectDocumentationArtRoot = path.resolve(options.projectDocumentationArtRoot || DEFAULT_PROJECT_DOCUMENTATION_ART_ROOT);
  const projectDesignConceptArtRoot = path.resolve(
    options.projectDesignConceptArtRoot || DEFAULT_PROJECT_DESIGN_CONCEPT_ART_ROOT,
  );
  const projectAudioRoot = path.resolve(options.projectAudioRoot || DEFAULT_PROJECT_AUDIO_ROOT);
  const legacyRoot = path.resolve(options.legacyRoot || DEFAULT_LEGACY_ROOT);
  const deleteFile = options.deleteFile || recycleFile;

  const readableRoots = [
    projectArtRoot,
    projectPrototypeArtRoot,
    projectSourceArtRoot,
    projectArchiveArtRoot,
    projectAppArtRoot,
    projectMarketingArtRoot,
    projectDocumentationArtRoot,
    projectDesignConceptArtRoot,
    projectAudioRoot,
    legacyRoot,
  ];
  const deletableAssetRoots = [projectArtRoot, legacyRoot];
  const isAllowedCatalogPath = (candidate) =>
    ALLOWED_EXTENSIONS.has(path.extname(candidate).toLocaleLowerCase("en-US")) &&
    deletableAssetRoots.some((root) => isPathInside(root, candidate));

  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url || "/", `http://${request.headers.host || `${host}:${port}`}`);

      if (request.method === "GET" && url.pathname === "/api/health") {
        sendJson(response, 200, { ok: true, service: "scicon-sprite-gallery", version: 1 });
        return;
      }

      if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
        const html = fs.readFileSync(galleryPath);
        response.writeHead(200, {
          "Cache-Control": "no-store",
          "Content-Type": "text/html; charset=utf-8",
          "Content-Length": html.length,
        });
        response.end(html);
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/file") {
        const candidate = path.resolve(url.searchParams.get("path") || "");
        const { assets, sounds } = readGalleryCatalog(galleryPath);
        const catalogPaths = new Set([
          ...assets.map((item) => item.absolutePath),
          ...assets.map((item) => item.audioPreviewAbsolutePath).filter(Boolean),
          ...sounds.map((item) => item.absolutePath),
        ].map(normalizeCase));
        const isInsideAllowedRoot = readableRoots.some((root) => isPathInside(root, candidate));
        if (!isInsideAllowedRoot || !mimeTypes.has(path.extname(candidate).toLocaleLowerCase("en-US")) || !catalogPaths.has(normalizeCase(candidate))) {
          sendText(response, 403, "This file is not an allowed gallery asset.");
          return;
        }
        if (!fs.existsSync(candidate) || !fs.statSync(candidate).isFile()) {
          sendText(response, 404, "Asset file was not found.");
          return;
        }
        const stat = fs.statSync(candidate);
        response.writeHead(200, {
          "Cache-Control": "no-cache",
          "Content-Type": mimeTypes.get(path.extname(candidate).toLocaleLowerCase("en-US")) || "application/octet-stream",
          "Content-Length": stat.size,
        });
        fs.createReadStream(candidate).pipe(response);
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/delete") {
        const address = server.address();
        const activePort = typeof address === "object" && address ? address.port : port;
        if (!requestIsSameOrigin(request, activePort)) {
          sendJson(response, 403, { ok: false, error: "Deletion is only allowed from the local gallery." });
          return;
        }
        if (!String(request.headers["content-type"] || "").startsWith("application/json")) {
          sendJson(response, 415, { ok: false, error: "Deletion requires a JSON request." });
          return;
        }

        const body = await readJsonBody(request);
        const candidate = path.resolve(String(body.absolutePath || ""));
        const { assets } = readGalleryCatalog(galleryPath);
        const item = assets.find((asset) => normalizeCase(asset.absolutePath) === normalizeCase(candidate));
        if (!item || !isAllowedCatalogPath(candidate)) {
          sendJson(response, 403, { ok: false, error: "This file is not an allowed gallery asset." });
          return;
        }
        if (item.inGame && body.confirmInGame !== true) {
          sendJson(response, 409, {
            ok: false,
            requiresConfirmation: true,
            error: "This sprite is used in the game.",
            usageLocations: item.usageLocations || [],
          });
          return;
        }
        if (!fs.existsSync(candidate) || !fs.statSync(candidate).isFile()) {
          sendJson(response, 404, { ok: false, error: "The asset file no longer exists." });
          return;
        }

        deleteFile(candidate);
        removeAssetFromGalleryCatalog(galleryPath, candidate);
        sendJson(response, 200, { ok: true, recycled: true, absolutePath: candidate });
        return;
      }

      sendText(response, 404, "Not found.");
    } catch (error) {
      sendJson(response, 500, { ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  });

  return {
    server,
    host,
    port,
    galleryPath,
    projectArtRoot,
    projectPrototypeArtRoot,
    projectSourceArtRoot,
    projectArchiveArtRoot,
    projectAppArtRoot,
    projectMarketingArtRoot,
    projectDocumentationArtRoot,
    projectDesignConceptArtRoot,
    projectAudioRoot,
    legacyRoot,
  };
}

function parseArguments(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--port") parsed.port = Number(argv[++index]);
    else if (argument === "--gallery") parsed.galleryPath = argv[++index];
    else if (argument === "--project-art") parsed.projectArtRoot = argv[++index];
    else if (argument === "--project-prototype-art") parsed.projectPrototypeArtRoot = argv[++index];
    else if (argument === "--project-source-art") parsed.projectSourceArtRoot = argv[++index];
    else if (argument === "--project-archive-art") parsed.projectArchiveArtRoot = argv[++index];
    else if (argument === "--project-app-art") parsed.projectAppArtRoot = argv[++index];
    else if (argument === "--project-marketing-art") parsed.projectMarketingArtRoot = argv[++index];
    else if (argument === "--project-documentation-art") parsed.projectDocumentationArtRoot = argv[++index];
    else if (argument === "--project-design-concept-art") parsed.projectDesignConceptArtRoot = argv[++index];
    else if (argument === "--legacy-root") parsed.legacyRoot = argv[++index];
  }
  return parsed;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(SCRIPT_PATH)) {
  const service = createGalleryServer(parseArguments(process.argv.slice(2)));
  service.server.listen(service.port, service.host, () => {
    console.log(`Scicon Sprite Gallery: http://${service.host}:${service.port}/`);
  });
}
