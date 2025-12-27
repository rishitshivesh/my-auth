import fs from "fs";
import path from "path";

const UI_DIR = path.resolve("./src/components/ui");
const INDEX_FILE = path.join(UI_DIR, "../index.ts");

// Get all .ts/.tsx files except index.ts
const files = fs
  .readdirSync(UI_DIR)
  .filter(
    (file) =>
      file !== "index.ts" && (file.endsWith(".ts") || file.endsWith(".tsx")),
  );

// Generate export lines
const exports =
  files
    .map((file) => {
      const name = file.replace(/\.tsx?$/, "");
      return `export * from "./ui/${name}";`;
    })
    .join("\n") + "\n";

// Write to index.ts
fs.writeFileSync(INDEX_FILE, exports);

console.log(`✅ UI barrel generated: components/ui/index.ts`);
