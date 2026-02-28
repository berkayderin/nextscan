import type { RoutesResult } from "../analyzers/routes.js";
import type { ApiResult, ApiEndpoint } from "../analyzers/api.js";
import type { SchemaResult } from "../analyzers/schema.js";
import type { SecurityResult, SecurityIssue } from "../analyzers/security.js";
import type { ProjectInfo } from "../utils/detect.js";

const MAX_API_ENDPOINTS = 8;
const MAX_SECURITY_ISSUES = 10;
const MAX_RELATION_CHAINS = 6;

interface FormatInput {
  project: ProjectInfo;
  routes: RoutesResult | null;
  api: ApiResult | null;
  schema: SchemaResult | null;
  security: SecurityResult | null;
  focus?: string;
}

export function formatCompact(input: FormatInput): string {
  const { project, routes, api, schema, security, focus } = input;
  const lines: string[] = [];

  // Header
  lines.push(`📦 nextscan — ${projectName(project)}`);
  lines.push(`${"─".repeat(40)}`);

  // Project overview
  lines.push(`📁 Root: ${project.rootDir}`);
  lines.push(`   src/ : ${project.hasSrcDir ? "✓" : "✗"}  app/ : ${project.appDir ? "✓" : "✗"}  middleware: ${project.hasMiddleware ? "✓" : "✗"}`);
  if (project.orm.length > 0) {
    lines.push(`   ORM  : ${project.orm.join(", ")}`);
  }
  lines.push("");

  // Routes section
  if (routes && (!focus || focus === "routes")) {
    lines.push("🗺️  Routes");
    lines.push(`   Pages: ${routes.totalPages}  Layouts: ${routes.totalLayouts}  API: ${routes.totalApiRoutes}`);
    lines.push(`   Dynamic: ${routes.dynamicRoutes}  Static: ${routes.staticRoutes}`);
    lines.push(`   Client: ${routes.clientComponents}  Server: ${routes.serverComponents}`);

    if (routes.parallelRoutes.length > 0) {
      lines.push(`   Parallel: ${routes.parallelRoutes.join(", ")}`);
    }
    if (routes.routeGroups.length > 0) {
      lines.push(`   Groups: ${routes.routeGroups.join(", ")}`);
    }
    if (routes.middlewareMatchers.length > 0) {
      lines.push(`   Matchers: ${routes.middlewareMatchers.join(", ")}`);
    }

    // Route tree (compact)
    const pages = routes.routes.filter((r) => r.type === "page");
    if (pages.length > 0) {
      lines.push("   ┌─ Pages");
      const displayPages = pages.slice(0, 12);
      for (let i = 0; i < displayPages.length; i++) {
        const r = displayPages[i];
        const prefix = i === displayPages.length - 1 && pages.length <= 12 ? "└" : "├";
        const flags: string[] = [];
        if (r.isDynamic) flags.push("dyn");
        if (r.isClientComponent) flags.push("client");
        if (r.hasGenerateStaticParams) flags.push("SSG");
        const flagStr = flags.length > 0 ? ` [${flags.join(",")}]` : "";
        lines.push(`   ${prefix}─ ${r.path}${flagStr}`);
      }
      if (pages.length > 12) {
        lines.push(`   └─ ...and ${pages.length - 12} more`);
      }
    }
    lines.push("");
  }

  // API section
  if (api && (!focus || focus === "api")) {
    lines.push("🔌 API Endpoints");
    lines.push(`   Total: ${api.totalEndpoints}  Unprotected: ${api.unprotectedEndpoints.length}`);

    if (api.publicPathExceptions.length > 0) {
      lines.push(`   Public exceptions: ${api.publicPathExceptions.join(", ")}`);
    }

    // Prioritize endpoints with issues
    const sorted = [...api.endpoints].sort(
      (a, b) => b.issues.length - a.issues.length,
    );
    const display = sorted.slice(0, MAX_API_ENDPOINTS);

    for (let i = 0; i < display.length; i++) {
      const ep = display[i];
      const prefix = i === display.length - 1 && api.endpoints.length <= MAX_API_ENDPOINTS ? "└" : "├";
      const methods = ep.methods.join(",");
      const flags: string[] = [];
      if (ep.hasAuth) flags.push(`auth:${ep.authPattern}`);
      if (ep.hasValidation) flags.push(`val:${ep.validationLib}`);
      if (ep.issues.length > 0) flags.push(`⚠ ${ep.issues.join(",")}`);
      const flagStr = flags.length > 0 ? ` [${flags.join(" | ")}]` : "";
      lines.push(`   ${prefix}─ ${methods} ${ep.path}${flagStr}`);
    }

    if (api.endpoints.length > MAX_API_ENDPOINTS) {
      lines.push(`   └─ ...and ${api.endpoints.length - MAX_API_ENDPOINTS} more`);
    }
    lines.push("");
  }

  // Schema section
  if (schema && (schema.prisma || schema.drizzle) && (!focus || focus === "schema")) {
    lines.push("🗄️  Schema");
    lines.push(`   Models: ${schema.totalModels}  Relations: ${schema.totalRelations}`);

    if (schema.prisma) {
      const p = schema.prisma;
      if (p.orphanModels.length > 0) {
        lines.push(`   ⚠ Orphans: ${p.orphanModels.join(", ")}`);
      }
      if (p.missingIndexFields.length > 0) {
        lines.push(`   ⚠ Missing indexes: ${p.missingIndexFields.join(", ")}`);
      }

      // Relation chains
      const displayRels = p.relations.slice(0, MAX_RELATION_CHAINS);
      for (const rel of displayRels) {
        const arrow = rel.type === "1:1" ? "─" : rel.type === "1:N" ? "─<" : ">─<";
        lines.push(`   ${rel.from} ${arrow} ${rel.to} (${rel.type})`);
      }
      if (p.relations.length > MAX_RELATION_CHAINS) {
        lines.push(`   ...and ${p.relations.length - MAX_RELATION_CHAINS} more relations`);
      }
    }

    if (schema.drizzle) {
      const d = schema.drizzle;
      for (const rel of d.relations.slice(0, MAX_RELATION_CHAINS)) {
        lines.push(`   ${rel.from}.${rel.fieldName} → ${rel.to}`);
      }
    }
    lines.push("");
  }

  // Security section
  if (security && (!focus || focus === "security")) {
    lines.push("🔒 Security");
    lines.push(`   Score: ${security.score}/100  Headers: ${security.hasSecurityHeaders ? "✓" : "✗"}  Middleware: ${security.hasMiddleware ? "✓" : "✗"}`);

    if (security.issues.length > 0) {
      const display = security.issues.slice(0, MAX_SECURITY_ISSUES);
      for (const issue of display) {
        const icon = severityIcon(issue.severity);
        const loc = issue.file ? ` (${issue.file}${issue.line ? `:${issue.line}` : ""})` : "";
        lines.push(`   ${icon} ${issue.message}${loc}`);
      }
      if (security.issues.length > MAX_SECURITY_ISSUES) {
        lines.push(`   ...and ${security.issues.length - MAX_SECURITY_ISSUES} more issues`);
      }
    } else {
      lines.push("   ✅ No issues found");
    }
    lines.push("");
  }

  return lines.join("\n");
}

function projectName(project: ProjectInfo): string {
  const pkg = project.packageJson;
  if (typeof pkg.name === "string") return pkg.name;
  const parts = project.rootDir.split("/");
  return parts[parts.length - 1] || "unknown";
}

function severityIcon(severity: SecurityIssue["severity"]): string {
  switch (severity) {
    case "critical":
      return "🔴";
    case "high":
      return "🟠";
    case "medium":
      return "🟡";
    case "low":
      return "🔵";
  }
}
