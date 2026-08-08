import { mkdirSync, readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

const DATA_DIR = join(process.cwd(), ".data");

function ensureDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

export function readJson<T>(name: string, fallback: T): T {
  try {
    ensureDir();
    const path = join(DATA_DIR, name);
    if (!existsSync(path)) return fallback;
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return fallback;
  }
}

export function writeJson(name: string, value: unknown) {
  try {
    ensureDir();
    writeFileSync(join(DATA_DIR, name), JSON.stringify(value, null, 2));
  } catch {
    /* ephemeral environments may not allow writes */
  }
}
