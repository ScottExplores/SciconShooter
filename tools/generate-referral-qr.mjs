/**
 * Regenerates the ResearchHub referral QR code asset.
 *
 * The referral link lives in constants.ts, so the QR is generated from that
 * single source rather than hand-exported, and can be re-run whenever the
 * referral code changes:
 *
 *   npm install --no-save qrcode && node tools/generate-referral-qr.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import QRCode from 'qrcode';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const constantsPath = path.join(root, 'constants.ts');
const outputPath = path.join(
  root,
  'public/game-art/generated/ui/scicon-desktop-mobile-launch-v1/researchhub-referral-qr.png'
);

const source = fs.readFileSync(constantsPath, 'utf8');
const match = /REFERRAL_LINK:\s*"([^"]+)"/.exec(source);
if (!match) throw new Error('REFERRAL_LINK was not found in constants.ts');
const referralLink = match[1];

await QRCode.toFile(outputPath, referralLink, {
  errorCorrectionLevel: 'M',
  margin: 2,
  width: 512,
  // Matches the neon-on-dark treatment the launch shell already uses so the
  // code sits inside the pixel frame instead of punching a white hole in it.
  color: { dark: '#67e8f9ff', light: '#020817ff' }
});

console.log(`Wrote ${path.relative(root, outputPath)}`);
console.log(`Encoded: ${referralLink}`);
