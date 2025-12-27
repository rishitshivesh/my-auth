#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

/**
 * Code Consolidator Script
 * Recursively scans directories and consolidates all code files into a single text file
 */

class CodeConsolidator {
  constructor() {
    // Common code file extensions
    this.codeExtensions = new Set([
      ".js",
      ".jsx",
      ".ts",
      ".tsx",
      ".py",
      ".java",
      ".c",
      ".cpp",
      ".cc",
      ".cxx",
      ".cs",
      ".php",
      ".rb",
      ".go",
      ".rs",
      ".swift",
      ".kt",
      ".scala",
      ".r",
      ".m",
      ".mm",
      ".html",
      ".htm",
      ".css",
      ".scss",
      ".sass",
      ".less",
      ".xml",
      ".json",
      ".yaml",
      ".yml",
      ".toml",
      ".sh",
      ".bash",
      ".zsh",
      ".fish",
      ".ps1",
      ".bat",
      ".sql",
      ".graphql",
      ".proto",
      ".thrift",
      ".dockerfile",
      ".makefile",
      ".cmake",
      ".vue",
      ".svelte",
      ".dart",
      ".lua",
      ".pl",
      ".pm",
    ]);

    // Files to exclude
    this.excludeFiles = new Set([
      "package-lock.json",
      "yarn.lock",
      ".DS_Store",
      "Thumbs.db",
      ".env",
      ".env.local",
      ".env.production",
      ".env.development",
    ]);

    // Directories to exclude
    this.excludeDirs = new Set([
      "node_modules",
      ".git",
      ".svn",
      ".hg",
      "dist",
      "build",
      "target",
      "bin",
      "obj",
      "__pycache__",
      ".pytest_cache",
      "venv",
      "env",
      ".venv",
      ".env",
      "vendor",
      ".idea",
      ".vscode",
      ".vs",
      "coverage",
      ".nyc_output",
      ".cache",
    ]);

    this.stats = {
      filesProcessed: 0,
      totalLines: 0,
      skippedFiles: 0,
      errors: 0,
    };
  }

  /**
   * Check if file should be processed based on extension
   */
  isCodeFile(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const basename = path.basename(filePath).toLowerCase();

    // Special files without extensions
    const specialFiles = [
      "dockerfile",
      "makefile",
      "jenkinsfile",
      "readme",
      "license",
      "changelog",
    ];
    if (specialFiles.some((name) => basename.includes(name))) {
      return true;
    }

    return this.codeExtensions.has(ext);
  }

  /**
   * Check if file/directory should be excluded
   */
  shouldExclude(itemPath, isDirectory = false) {
    const basename = path.basename(itemPath);

    if (isDirectory) {
      return this.excludeDirs.has(basename) || basename.startsWith(".");
    }

    return (
      this.excludeFiles.has(basename) ||
      (basename.startsWith(".") && !this.isCodeFile(itemPath))
    );
  }

  /**
   * Get file size in a readable format
   */
  getFileSize(filePath) {
    try {
      const stats = fs.statSync(filePath);
      const bytes = stats.size;

      if (bytes === 0) return "0 B";
      const k = 1024;
      const sizes = ["B", "KB", "MB", "GB"];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
    } catch (error) {
      return "Unknown";
    }
  }

  /**
   * Process a single file and add its content to the output
   */
  processFile(filePath, outputStream) {
    try {
      const relativePath = path.relative(process.cwd(), filePath);
      const fileSize = this.getFileSize(filePath);
      const content = fs.readFileSync(filePath, "utf-8");
      const lineCount = content.split("\n").length;

      // Write file header
      outputStream.write("\n" + "=".repeat(80) + "\n");
      outputStream.write(`FILE: ${relativePath}\n`);
      outputStream.write(`SIZE: ${fileSize} | LINES: ${lineCount}\n`);
      outputStream.write("=".repeat(80) + "\n\n");

      // Write file content
      outputStream.write(content);
      outputStream.write("\n\n");

      this.stats.filesProcessed++;
      this.stats.totalLines += lineCount;

      console.log(`✓ Processed: ${relativePath} (${lineCount} lines)`);
    } catch (error) {
      console.error(`✗ Error processing ${filePath}: ${error.message}`);
      this.stats.errors++;
    }
  }

  /**
   * Recursively scan directory and process all code files
   */
  scanDirectory(dirPath, outputStream) {
    try {
      const items = fs.readdirSync(dirPath);

      for (const item of items) {
        const itemPath = path.join(dirPath, item);
        const stats = fs.statSync(itemPath);

        if (stats.isDirectory()) {
          if (!this.shouldExclude(itemPath, true)) {
            this.scanDirectory(itemPath, outputStream);
          } else {
            console.log(
              `⏭ Skipping directory: ${path.relative(process.cwd(), itemPath)}`,
            );
          }
        } else if (stats.isFile()) {
          if (
            this.isCodeFile(itemPath) &&
            !this.shouldExclude(itemPath, false)
          ) {
            this.processFile(itemPath, outputStream);
          } else {
            this.stats.skippedFiles++;
          }
        }
      }
    } catch (error) {
      console.error(`✗ Error scanning directory ${dirPath}: ${error.message}`);
      this.stats.errors++;
    }
  }

  /**
   * Main consolidation function
   */
  consolidate(inputPath = ".", outputPath = "consolidated-code.txt") {
    console.log("🚀 Starting code consolidation...\n");
    console.log(`Input: ${path.resolve(inputPath)}`);
    console.log(`Output: ${path.resolve(outputPath)}\n`);

    const outputStream = fs.createWriteStream(outputPath);

    // Write header
    const timestamp = new Date().toISOString();
    outputStream.write(`CODE CONSOLIDATION REPORT\n`);
    outputStream.write(`Generated: ${timestamp}\n`);
    outputStream.write(`Input Directory: ${path.resolve(inputPath)}\n`);
    outputStream.write(`${"=".repeat(80)}\n\n`);

    try {
      const inputStats = fs.statSync(inputPath);

      if (inputStats.isDirectory()) {
        this.scanDirectory(inputPath, outputStream);
      } else if (inputStats.isFile()) {
        this.processFile(inputPath, outputStream);
      } else {
        throw new Error("Input path is neither a file nor a directory");
      }

      // Write footer with statistics
      outputStream.write("\n" + "=".repeat(80) + "\n");
      outputStream.write("CONSOLIDATION SUMMARY\n");
      outputStream.write("=".repeat(80) + "\n");
      outputStream.write(`Files Processed: ${this.stats.filesProcessed}\n`);
      outputStream.write(
        `Total Lines: ${this.stats.totalLines.toLocaleString()}\n`,
      );
      outputStream.write(`Files Skipped: ${this.stats.skippedFiles}\n`);
      outputStream.write(`Errors: ${this.stats.errors}\n`);
      outputStream.write(`Generated: ${timestamp}\n`);

      outputStream.end();

      console.log("\n✅ Consolidation completed successfully!");
      console.log(`📊 Statistics:`);
      console.log(`   • Files processed: ${this.stats.filesProcessed}`);
      console.log(
        `   • Total lines: ${this.stats.totalLines.toLocaleString()}`,
      );
      console.log(`   • Files skipped: ${this.stats.skippedFiles}`);
      console.log(`   • Errors: ${this.stats.errors}`);
      console.log(`📁 Output saved to: ${path.resolve(outputPath)}`);
    } catch (error) {
      console.error(`💥 Fatal error: ${error.message}`);
      outputStream.destroy();
    }
  }

  /**
   * Add custom file extensions
   */
  addExtensions(extensions) {
    extensions.forEach((ext) => {
      if (!ext.startsWith(".")) ext = "." + ext;
      this.codeExtensions.add(ext.toLowerCase());
    });
  }

  /**
   * Add custom exclude patterns
   */
  addExcludes(files = [], dirs = []) {
    files.forEach((file) => this.excludeFiles.add(file));
    dirs.forEach((dir) => this.excludeDirs.add(dir));
  }
}

// CLI Usage
if (require.main === module) {
  const args = process.argv.slice(2);
  const consolidator = new CodeConsolidator();

  // Parse command line arguments
  let inputPath = ".";
  let outputPath = "consolidated-code.txt";
  let customExtensions = [];
  let excludeFiles = [];
  let excludeDirs = [];

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--input":
      case "-i":
        inputPath = args[++i];
        break;
      case "--output":
      case "-o":
        outputPath = args[++i];
        break;
      case "--extensions":
      case "-e":
        customExtensions = args[++i].split(",");
        break;
      case "--exclude-files":
        excludeFiles = args[++i].split(",");
        break;
      case "--exclude-dirs":
        excludeDirs = args[++i].split(",");
        break;
      case "--help":
      case "-h":
        console.log(`
Code Consolidator - Merge all code files into one text file

Usage: node consolidate.js [options]

Options:
  -i, --input <path>          Input directory or file (default: current directory)
  -o, --output <path>         Output file path (default: consolidated-code.txt)
  -e, --extensions <list>     Additional file extensions (comma-separated)
  --exclude-files <list>      Additional files to exclude (comma-separated)
  --exclude-dirs <list>       Additional directories to exclude (comma-separated)
  -h, --help                  Show this help

Examples:
  node consolidate.js
  node consolidate.js -i ./src -o output.txt
  node consolidate.js -e "md,txt" --exclude-dirs "temp,cache"
                `);
        process.exit(0);
    }
  }

  // Apply custom settings
  if (customExtensions.length) consolidator.addExtensions(customExtensions);
  if (excludeFiles.length || excludeDirs.length)
    consolidator.addExcludes(excludeFiles, excludeDirs);

  // Run consolidation
  consolidator.consolidate(inputPath, outputPath);
}

module.exports = CodeConsolidator;
