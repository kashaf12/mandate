// Post-build script to add .js extensions to ES module imports
import { readdir, readFile, writeFile } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const distDir = join(__dirname, "..", "dist");

async function fixImportsInFile(filePath) {
  const content = await readFile(filePath, "utf-8");

  // Replace imports like: from "./module" with from "./module.js"
  // But only for relative imports, not node_modules
  const fixed = content.replace(
    /from\s+['"](\.\/[^'"]+)['"]/g,
    (match, importPath) => {
      // Don't add .js if it already has an extension
      if (importPath.endsWith(".js") || importPath.endsWith(".json")) {
        return match;
      }
      return `from "${importPath}.js"`;
    }
  );

  if (fixed !== content) {
    await writeFile(filePath, fixed, "utf-8");
    console.log(`Fixed imports in ${filePath}`);
  }
}

async function fixImports(dir) {
  const files = await readdir(dir, { withFileTypes: true });

  for (const file of files) {
    const filePath = join(dir, file.name);

    if (file.isDirectory()) {
      await fixImports(filePath);
    } else if (file.name.endsWith(".js")) {
      await fixImportsInFile(filePath);
    }
  }
}

fixImports(distDir).catch(console.error);
