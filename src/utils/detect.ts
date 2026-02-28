import { join } from "path";
import { fileExists, readFileContent } from "./fs.js";

export interface ProjectInfo {
  rootDir: string;
  appDir: string | null;
  orm: ("prisma" | "drizzle")[];
  hasMiddleware: boolean;
  hasSrcDir: boolean;
  packageJson: Record<string, unknown>;
}

export async function detectProject(rootDir: string): Promise<ProjectInfo> {
  const pkgPath = join(rootDir, "package.json");
  const pkgContent = await readFileContent(pkgPath);
  if (!pkgContent) {
    throw new Error(`No package.json found in ${rootDir}`);
  }

  const packageJson = JSON.parse(pkgContent) as Record<string, unknown>;
  const allDeps = {
    ...(packageJson.dependencies as Record<string, string> | undefined),
    ...(packageJson.devDependencies as Record<string, string> | undefined),
  };

  if (!allDeps["next"]) {
    throw new Error("Not a Next.js project (next not found in dependencies)");
  }

  const hasSrcDir = await fileExists(join(rootDir, "src"));

  const appDirCandidates = hasSrcDir
    ? [join(rootDir, "src", "app"), join(rootDir, "app")]
    : [join(rootDir, "app"), join(rootDir, "src", "app")];

  let appDir: string | null = null;
  for (const candidate of appDirCandidates) {
    if (await fileExists(candidate)) {
      appDir = candidate;
      break;
    }
  }

  const orm: ("prisma" | "drizzle")[] = [];
  if (allDeps["prisma"] || allDeps["@prisma/client"]) {
    orm.push("prisma");
  }
  if (allDeps["drizzle-orm"]) {
    orm.push("drizzle");
  }

  const middlewareLocations = hasSrcDir
    ? [join(rootDir, "src", "middleware.ts"), join(rootDir, "src", "middleware.js")]
    : [join(rootDir, "middleware.ts"), join(rootDir, "middleware.js")];

  let hasMiddleware = false;
  for (const loc of middlewareLocations) {
    if (await fileExists(loc)) {
      hasMiddleware = true;
      break;
    }
  }

  return { rootDir, appDir, orm, hasMiddleware, hasSrcDir, packageJson };
}
