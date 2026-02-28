import { readdir } from "fs/promises";
import { join, relative, dirname } from "path";
import { readFileContent } from "../utils/fs.js";

export interface ApiEndpoint {
  path: string;
  methods: string[];
  hasAuth: boolean;
  authPattern: string | null;
  hasValidation: boolean;
  validationLib: string | null;
  hasRateLimit: boolean;
  issues: string[];
}

export interface ApiResult {
  endpoints: ApiEndpoint[];
  totalEndpoints: number;
  unprotectedEndpoints: ApiEndpoint[];
  publicPathExceptions: string[];
}

const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

const AUTH_PATTERNS: [RegExp, string][] = [
  [/getServerSession|auth\(\)|getSession/, "next-auth"],
  [/currentUser|auth\(\)|clerkClient/, "clerk"],
  [/createServerComponentClient|createRouteHandlerClient/, "supabase"],
  [/getAuth|withAuth|requireAuth/, "custom-auth"],
  [/verifyToken|verifyJwt|jwt\.verify/, "jwt"],
  [/cookies\(\)\.get\(['"].*token/, "cookie-auth"],
];

const VALIDATION_PATTERNS: [RegExp, string][] = [
  [/z\.\w+|zod/i, "zod"],
  [/yup\./, "yup"],
  [/joi\./, "joi"],
];

const PUBLIC_PATH_PATTERNS = [
  /\/api\/webhook/,
  /\/api\/health/,
  /\/api\/public/,
  /\/api\/cron/,
  /\/api\/og/,
  /\/api\/revalidate/,
];

export async function analyzeApi(appDir: string): Promise<ApiResult> {
  const endpoints: ApiEndpoint[] = [];

  await findRouteFiles(appDir, appDir, endpoints);

  const publicPathExceptions = endpoints
    .filter((e) => PUBLIC_PATH_PATTERNS.some((p) => p.test(e.path)))
    .map((e) => e.path);

  const unprotectedEndpoints = endpoints.filter(
    (e) => !e.hasAuth && !PUBLIC_PATH_PATTERNS.some((p) => p.test(e.path)),
  );

  return {
    endpoints,
    totalEndpoints: endpoints.length,
    unprotectedEndpoints,
    publicPathExceptions,
  };
}

async function findRouteFiles(
  dir: string,
  appDir: string,
  endpoints: ApiEndpoint[],
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
      await findRouteFiles(fullPath, appDir, endpoints);
    } else if (
      entry.isFile() &&
      /^route\.(ts|js|tsx|jsx)$/.test(entry.name)
    ) {
      const content = await readFileContent(fullPath);
      if (!content) continue;

      const routePath = "/" + relative(appDir, dirname(fullPath)).replace(/\\/g, "/");
      const normalizedPath = routePath === "/." ? "/" : routePath;

      const methods = detectHttpMethods(content);
      const { hasAuth, authPattern } = detectAuth(content);
      const { hasValidation, validationLib } = detectValidation(content);
      const hasRateLimit = /rateLimit|rateLimiter|upstash.*ratelimit/i.test(content);

      const issues: string[] = [];
      if (!hasAuth && !PUBLIC_PATH_PATTERNS.some((p) => p.test(normalizedPath))) {
        issues.push("no-auth");
      }
      if (!hasValidation && methods.some((m) => ["POST", "PUT", "PATCH"].includes(m))) {
        issues.push("no-validation");
      }
      if (!hasRateLimit) {
        issues.push("no-rate-limit");
      }

      endpoints.push({
        path: normalizedPath,
        methods,
        hasAuth,
        authPattern,
        hasValidation,
        validationLib,
        hasRateLimit,
        issues,
      });
    }
  }
}

function detectHttpMethods(content: string): string[] {
  const methods: string[] = [];
  for (const method of HTTP_METHODS) {
    const exportRegex = new RegExp(
      `export\\s+(async\\s+)?function\\s+${method}\\b|export\\s+const\\s+${method}\\s*=`,
    );
    if (exportRegex.test(content)) {
      methods.push(method);
    }
  }
  return methods;
}

function detectAuth(content: string): { hasAuth: boolean; authPattern: string | null } {
  for (const [pattern, name] of AUTH_PATTERNS) {
    if (pattern.test(content)) {
      return { hasAuth: true, authPattern: name };
    }
  }
  return { hasAuth: false, authPattern: null };
}

function detectValidation(content: string): { hasValidation: boolean; validationLib: string | null } {
  for (const [pattern, name] of VALIDATION_PATTERNS) {
    if (pattern.test(content)) {
      return { hasValidation: true, validationLib: name };
    }
  }
  return { hasValidation: false, validationLib: null };
}
