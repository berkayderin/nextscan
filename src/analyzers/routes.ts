import { readdir, stat } from "fs/promises";
import { join, relative, basename, dirname } from "path";
import { hasUseClientDirective } from "../parsers/typescript.js";
import { readFileContent } from "../utils/fs.js";

export interface RouteInfo {
  path: string;
  type: "page" | "layout" | "loading" | "error" | "not-found" | "template" | "route" | "default";
  isDynamic: boolean;
  isParallelRoute: boolean;
  isRouteGroup: boolean;
  isClientComponent: boolean;
  isServerComponent: boolean;
  hasGenerateStaticParams: boolean;
}

export interface RoutesResult {
  routes: RouteInfo[];
  totalPages: number;
  totalApiRoutes: number;
  totalLayouts: number;
  dynamicRoutes: number;
  staticRoutes: number;
  clientComponents: number;
  serverComponents: number;
  parallelRoutes: string[];
  routeGroups: string[];
  middlewareMatchers: string[];
}

const ROUTE_FILES = new Set([
  "page.tsx", "page.ts", "page.jsx", "page.js",
  "layout.tsx", "layout.ts", "layout.jsx", "layout.js",
  "loading.tsx", "loading.ts", "loading.jsx", "loading.js",
  "error.tsx", "error.ts", "error.jsx", "error.js",
  "not-found.tsx", "not-found.ts", "not-found.jsx", "not-found.js",
  "template.tsx", "template.ts", "template.jsx", "template.js",
  "route.tsx", "route.ts", "route.jsx", "route.js",
  "default.tsx", "default.ts", "default.jsx", "default.js",
]);

function getRouteType(fileName: string): RouteInfo["type"] {
  const base = fileName.replace(/\.(tsx?|jsx?|js)$/, "");
  if (base === "page") return "page";
  if (base === "layout") return "layout";
  if (base === "loading") return "loading";
  if (base === "error") return "error";
  if (base === "not-found") return "not-found";
  if (base === "template") return "template";
  if (base === "route") return "route";
  if (base === "default") return "default";
  return "page";
}

export async function analyzeRoutes(appDir: string, rootDir: string): Promise<RoutesResult> {
  const routes: RouteInfo[] = [];
  const parallelRoutes = new Set<string>();
  const routeGroups = new Set<string>();

  await walkAppDir(appDir, appDir, routes, parallelRoutes, routeGroups);

  // Parse middleware matchers
  const middlewareMatchers = await parseMiddlewareMatchers(rootDir);

  const totalPages = routes.filter((r) => r.type === "page").length;
  const totalApiRoutes = routes.filter((r) => r.type === "route").length;
  const totalLayouts = routes.filter((r) => r.type === "layout").length;
  const dynamicRoutes = routes.filter((r) => r.isDynamic).length;
  const staticRoutes = routes.filter((r) => r.type === "page" && !r.isDynamic).length;
  const clientComponents = routes.filter((r) => r.isClientComponent).length;
  const serverComponents = routes.filter((r) => r.isServerComponent).length;

  return {
    routes,
    totalPages,
    totalApiRoutes,
    totalLayouts,
    dynamicRoutes,
    staticRoutes,
    clientComponents,
    serverComponents,
    parallelRoutes: [...parallelRoutes],
    routeGroups: [...routeGroups],
    middlewareMatchers,
  };
}

async function walkAppDir(
  dir: string,
  appDir: string,
  routes: RouteInfo[],
  parallelRoutes: Set<string>,
  routeGroups: Set<string>,
): Promise<void> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      // Detect parallel routes (@folder)
      if (entry.name.startsWith("@")) {
        parallelRoutes.add(entry.name);
      }
      // Detect route groups ((folder))
      if (entry.name.startsWith("(") && entry.name.endsWith(")")) {
        routeGroups.add(entry.name);
      }

      await walkAppDir(fullPath, appDir, routes, parallelRoutes, routeGroups);
    } else if (entry.isFile() && ROUTE_FILES.has(entry.name)) {
      const routePath = "/" + relative(appDir, dirname(fullPath)).replace(/\\/g, "/");
      const normalizedPath = routePath === "/." ? "/" : routePath;

      const isDynamic = /\[.*\]/.test(normalizedPath);
      const isParallelRoute = normalizedPath.includes("@");
      const isRouteGroup = /\(.*\)/.test(normalizedPath);

      const isClient = await hasUseClientDirective(fullPath);
      const content = await readFileContent(fullPath);
      const hasGenerateStaticParams = content
        ? /export\s+(async\s+)?function\s+generateStaticParams/.test(content)
        : false;

      routes.push({
        path: normalizedPath,
        type: getRouteType(entry.name),
        isDynamic,
        isParallelRoute,
        isRouteGroup,
        isClientComponent: isClient,
        isServerComponent: !isClient,
        hasGenerateStaticParams,
      });
    }
  }
}

async function parseMiddlewareMatchers(rootDir: string): Promise<string[]> {
  const candidates = [
    join(rootDir, "middleware.ts"),
    join(rootDir, "middleware.js"),
    join(rootDir, "src", "middleware.ts"),
    join(rootDir, "src", "middleware.js"),
  ];

  for (const candidate of candidates) {
    const content = await readFileContent(candidate);
    if (!content) continue;

    const matchers: string[] = [];

    // Match `source: '/path'` (object matcher syntax)
    const sourceRegex = /source:\s*['"]([^'"]+)['"]/g;
    let match;
    while ((match = sourceRegex.exec(content)) !== null) {
      matchers.push(match[1]);
    }

    // Match `matcher: ['/path1', '/path2']` or `matcher: '/path'` (array/string syntax)
    const arrayMatcherRegex = /matcher:\s*\[([^\]]+)\]/;
    const arrayMatch = content.match(arrayMatcherRegex);
    if (arrayMatch) {
      const items = arrayMatch[1].matchAll(/['"]([^'"]+)['"]/g);
      for (const item of items) {
        matchers.push(item[1]);
      }
    } else {
      const singleMatcherRegex = /matcher:\s*['"]([^'"]+)['"]/;
      const singleMatch = content.match(singleMatcherRegex);
      if (singleMatch) {
        matchers.push(singleMatch[1]);
      }
    }

    return matchers;
  }

  return [];
}
