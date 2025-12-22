// Copy Lua scripts to dist folder
import { copyFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const srcLuaPath = join(
  __dirname,
  "..",
  "src",
  "state",
  "lua",
  "check-and-commit.lua"
);
const distLuaDir = join(__dirname, "..", "dist", "state", "lua");
const distLuaPath = join(distLuaDir, "check-and-commit.lua");

try {
  // Create dist/state/lua directory if it doesn't exist
  mkdirSync(distLuaDir, { recursive: true });

  // Copy Lua file
  copyFileSync(srcLuaPath, distLuaPath);
  console.log(`Copied ${srcLuaPath} to ${distLuaPath}`);
} catch (error) {
  console.error("Error copying Lua script:", error);
  process.exit(1);
}
