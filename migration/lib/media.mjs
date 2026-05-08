import fs from "node:fs/promises";
import path from "node:path";

const IMAGE_EXTENSIONS = new Set([
  ".jpg", ".jpeg", ".png", ".gif", ".webp", ".avif", ".svg", ".bmp", ".tiff", ".ico",
]);
const MEDIA_EXTENSIONS = new Set([
  ...IMAGE_EXTENSIONS,
  ".mp4", ".webm", ".mov", ".m4a", ".mp3", ".ogg", ".wav", ".flac",
]);

/**
 * Find local media references in a markdown body.
 * Returns absolute-from-site-root paths (e.g. ["/assets/foo.png"]).
 * Skips remote URLs (http/https/data).
 */
export function extractMediaRefs(body) {
  const refs = new Set();
  const patterns = [
    /!\[[^\]]*\]\(([^)]+)\)/g,                       // ![alt](url)
    /<img[^>]+src=["']([^"']+)["']/gi,               // <img src="...">
    /<(?:video|audio|source)[^>]+src=["']([^"']+)["']/gi, // <video|audio|source src="...">
  ];
  for (const re of patterns) {
    for (const match of body.matchAll(re)) {
      const url = (match[1] || "").trim();
      if (!url) continue;
      if (/^https?:\/\//i.test(url) || url.startsWith("data:")) continue;
      const ext = path.extname(url.split(/[?#]/)[0]).toLowerCase();
      if (!MEDIA_EXTENSIONS.has(ext)) continue;
      refs.add(url);
    }
  }
  return [...refs];
}

/**
 * Resolve a media reference (as written in markdown) to an absolute filesystem
 * path inside the input tree. Tries common SSG layouts in order.
 */
export async function resolveMediaSource(mediaRef, { inputDir, postSourceDir }) {
  const cleaned = mediaRef.split(/[?#]/)[0];
  const candidates = [];

  if (postSourceDir && !cleaned.startsWith("/")) {
    // Page-bundle style (Hugo): media co-located with the post
    candidates.push(path.join(postSourceDir, cleaned));
  }
  if (cleaned.startsWith("/")) {
    candidates.push(path.join(inputDir, cleaned));
    candidates.push(path.join(inputDir, "static", cleaned));        // Hugo /static
    candidates.push(path.join(inputDir, cleaned.replace(/^\//, ""))); // Jekyll /assets
  } else {
    candidates.push(path.join(inputDir, cleaned));
  }

  for (const c of candidates) {
    try {
      const stat = await fs.stat(c);
      if (stat.isFile()) return c;
    } catch (err) {
      if (err.code !== "ENOENT" && err.code !== "ENOTDIR") throw err;
    }
  }
  return null;
}

/**
 * Stage a media file into staged/uploads/<destPath>.
 * Preserves the original web path so unchanged markdown references resolve
 * once Caddy serves the uploads volume.
 */
export async function stageMediaFile(sourcePath, destPath, stagedRoot) {
  const finalDest = path.join(stagedRoot, "uploads", destPath.replace(/^\/+/, ""));
  await fs.mkdir(path.dirname(finalDest), { recursive: true });
  await fs.copyFile(sourcePath, finalDest);
  return finalDest;
}

export { IMAGE_EXTENSIONS, MEDIA_EXTENSIONS };
