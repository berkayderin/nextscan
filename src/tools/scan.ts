import { detectProject } from "../utils/detect.js";
import { analyzeRoutes, type RoutesResult } from "../analyzers/routes.js";
import { analyzeApi, type ApiResult } from "../analyzers/api.js";
import { analyzeSchema, type SchemaResult } from "../analyzers/schema.js";
import { analyzeSecurity, type SecurityResult } from "../analyzers/security.js";
import { formatCompact } from "../formatters/compact.js";

export interface ScanParams {
  path: string;
  focus?: "routes" | "api" | "schema" | "security";
}

export async function scan(params: ScanParams): Promise<string> {
  const { path, focus } = params;

  // Detect project
  const project = await detectProject(path);

  let routes: RoutesResult | null = null;
  let api: ApiResult | null = null;
  let schema: SchemaResult | null = null;
  let security: SecurityResult | null = null;

  if (project.appDir) {
    // Run routes + api + schema in parallel
    const parallel = await Promise.all([
      (!focus || focus === "routes" || focus === "security")
        ? analyzeRoutes(project.appDir, project.rootDir)
        : null,
      (!focus || focus === "api" || focus === "security")
        ? analyzeApi(project.appDir)
        : null,
      (!focus || focus === "schema")
        ? analyzeSchema(project)
        : null,
    ]);

    routes = parallel[0];
    api = parallel[1];
    schema = parallel[2];
  } else {
    // No app dir — only schema analysis
    if (!focus || focus === "schema") {
      schema = await analyzeSchema(project);
    }
  }

  // Security runs after api (needs cross-ref)
  if (!focus || focus === "security") {
    security = await analyzeSecurity(project.rootDir, api, project.hasMiddleware);
  }

  return formatCompact({ project, routes, api, schema, security, focus });
}
