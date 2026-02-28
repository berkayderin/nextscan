import { join } from "path";
import { fileExists, readFileContent, findFiles } from "../utils/fs.js";
import type { ApiResult } from "./api.js";

export interface SecurityIssue {
  severity: "critical" | "high" | "medium" | "low";
  type: string;
  message: string;
  file?: string;
  line?: number;
}

export interface SecurityResult {
  issues: SecurityIssue[];
  score: number; // 0-100
  hasSecurityHeaders: boolean;
  hasMiddleware: boolean;
  summary: string;
}

const SECRET_PATTERNS: [RegExp, string][] = [
  [/sk_live_[a-zA-Z0-9]{20,}/, "Stripe live secret key"],
  [/sk_test_[a-zA-Z0-9]{20,}/, "Stripe test secret key"],
  [/ghp_[a-zA-Z0-9]{36,}/, "GitHub personal access token"],
  [/AKIA[A-Z0-9]{16}/, "AWS access key"],
  [/xox[bpoas]-[a-zA-Z0-9-]{10,}/, "Slack token"],
  [/eyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*\./, "JWT token"],
  [/-----BEGIN (RSA |EC )?PRIVATE KEY-----/, "Private key"],
  [/mongodb\+srv:\/\/[^\s'"]+/, "MongoDB connection string"],
  [/postgres(ql)?:\/\/[^\s'"]+@/, "PostgreSQL connection string"],
];

const ENV_LEAK_PATTERN = /NEXT_PUBLIC_.*(?:SECRET|KEY|TOKEN|PASSWORD|PRIVATE|CREDENTIAL)/i;

const SECURITY_HEADER_PATTERNS = [
  /Content-Security-Policy/,
  /X-Frame-Options/,
  /X-Content-Type-Options/,
  /Strict-Transport-Security/,
  /Referrer-Policy/,
];

// File patterns to exclude from security scanning (test files, fixtures, etc.)
const EXCLUDED_FILE_PATTERNS = [
  /\.test\.(ts|js|tsx|jsx)$/,
  /\.spec\.(ts|js|tsx|jsx)$/,
  /__tests__\//,
  /\/tests?\//,
  /\/fixtures?\//,
  /\/test-utils?\//,
  /\.stories\.(ts|js|tsx|jsx)$/,
  /\.mock\.(ts|js|tsx|jsx)$/,
];

function isExcludedFile(filePath: string): boolean {
  return EXCLUDED_FILE_PATTERNS.some((p) => p.test(filePath));
}

export async function analyzeSecurity(
  rootDir: string,
  apiResult: ApiResult | null,
  hasMiddleware: boolean,
): Promise<SecurityResult> {
  const issues: SecurityIssue[] = [];

  // 1. Check for hardcoded secrets in source files
  const sourceFiles = await findFiles(rootDir, (rel) =>
    /\.(ts|js|tsx|jsx)$/.test(rel) && !isExcludedFile(rel),
  );

  for (const file of sourceFiles) {
    const content = await readFileContent(file);
    if (!content) continue;

    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Skip comments
      if (line.trim().startsWith("//") || line.trim().startsWith("*")) continue;

      for (const [pattern, description] of SECRET_PATTERNS) {
        if (pattern.test(line)) {
          issues.push({
            severity: "critical",
            type: "hardcoded-secret",
            message: `${description} found in source code`,
            file: file.replace(rootDir + "/", ""),
            line: i + 1,
          });
        }
      }
    }
  }

  // 2. Check for env variable leaks (NEXT_PUBLIC_ with secret-like names)
  const envFiles = [".env", ".env.local", ".env.development", ".env.production"];
  for (const envFile of envFiles) {
    const content = await readFileContent(join(rootDir, envFile));
    if (!content) continue;

    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line || line.startsWith("#")) continue;

      const keyMatch = line.match(/^([A-Z_][A-Z0-9_]*)=/);
      if (keyMatch && ENV_LEAK_PATTERN.test(keyMatch[1])) {
        issues.push({
          severity: "high",
          type: "env-leak",
          message: `${keyMatch[1]} is public but contains secret-like name`,
          file: envFile,
          line: i + 1,
        });
      }
    }
  }

  // 3. Check for unprotected API routes
  if (apiResult) {
    for (const endpoint of apiResult.unprotectedEndpoints) {
      issues.push({
        severity: "high",
        type: "unprotected-api",
        message: `API route ${endpoint.path} has no auth: [${endpoint.methods.join(", ")}]`,
        file: `app${endpoint.path}/route.ts`,
      });
    }
  }

  // 4. Check .gitignore
  const gitignoreContent = await readFileContent(join(rootDir, ".gitignore"));
  if (gitignoreContent) {
    if (!gitignoreContent.includes(".env")) {
      issues.push({
        severity: "high",
        type: "gitignore-missing",
        message: ".env files not in .gitignore",
        file: ".gitignore",
      });
    }
  } else {
    issues.push({
      severity: "medium",
      type: "no-gitignore",
      message: "No .gitignore file found",
    });
  }

  // 5. Check security headers in next.config
  const hasSecurityHeaders = await checkSecurityHeaders(rootDir);
  if (!hasSecurityHeaders) {
    issues.push({
      severity: "medium",
      type: "no-security-headers",
      message: "No security headers configured in next.config",
    });
  }

  // 6. Check middleware
  if (!hasMiddleware) {
    issues.push({
      severity: "low",
      type: "no-middleware",
      message: "No middleware.ts found (route protection may be missing)",
    });
  }

  // Calculate score (100 minus penalties)
  let score = 100;
  for (const issue of issues) {
    switch (issue.severity) {
      case "critical":
        score -= 25;
        break;
      case "high":
        score -= 15;
        break;
      case "medium":
        score -= 10;
        break;
      case "low":
        score -= 5;
        break;
    }
  }
  score = Math.max(0, score);

  const criticalCount = issues.filter((i) => i.severity === "critical").length;
  const highCount = issues.filter((i) => i.severity === "high").length;
  const summaryParts: string[] = [`Score: ${score}/100`];
  if (criticalCount > 0) summaryParts.push(`${criticalCount} critical`);
  if (highCount > 0) summaryParts.push(`${highCount} high`);

  return {
    issues,
    score,
    hasSecurityHeaders,
    hasMiddleware,
    summary: summaryParts.join(", "),
  };
}

async function checkSecurityHeaders(rootDir: string): Promise<boolean> {
  const configFiles = [
    "next.config.js",
    "next.config.mjs",
    "next.config.ts",
  ];

  for (const configFile of configFiles) {
    const content = await readFileContent(join(rootDir, configFile));
    if (!content) continue;

    return SECURITY_HEADER_PATTERNS.some((p) => p.test(content));
  }

  return false;
}
