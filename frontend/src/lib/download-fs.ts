import fs from "node:fs";
import path from "node:path";

export function getDownloadDir(): string {
  if (process.env.DOWNLOAD_DIR) return process.env.DOWNLOAD_DIR;
  if (fs.existsSync("/data/downloads")) return "/data/downloads";
  return path.join(process.cwd(), "..", "downloads");
}

export interface DownloadEntry {
  filename: string;
  size: number;
  mtime: string;
}

export function listZips(): DownloadEntry[] {
  const dir = getDownloadDir();
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.toLowerCase().endsWith(".zip"))
    .map((e) => {
      const st = fs.statSync(path.join(dir, e.name));
      return {
        filename: e.name,
        size: st.size,
        mtime: st.mtime.toISOString(),
      };
    })
    .sort((a, b) => b.mtime.localeCompare(a.mtime));
}

export function resolveSafe(rawFilename: string): string | null {
  if (!rawFilename || rawFilename.includes("\0")) return null;
  const base = path.basename(rawFilename);
  if (base !== rawFilename) return null;
  if (!base.toLowerCase().endsWith(".zip")) return null;

  const dir = getDownloadDir();
  const full = path.resolve(dir, base);
  const dirResolved = path.resolve(dir);
  if (!full.startsWith(dirResolved + path.sep)) return null;
  if (!fs.existsSync(full)) return null;

  try {
    const real = fs.realpathSync(full);
    const realDir = fs.realpathSync(dirResolved);
    if (!real.startsWith(realDir + path.sep) && real !== path.join(realDir, base)) {
      return null;
    }
  } catch {
    return null;
  }
  return full;
}
