import { describe, it, expect } from "vitest";
import { join } from "path";
import { analyzeSecurity } from "../src/analyzers/security.js";
import { analyzeApi } from "../src/analyzers/api.js";

const FIXTURES = join(import.meta.dirname, "..", "fixtures");

describe("analyzeSecurity", () => {
  it("detects hardcoded secrets in insecure-app", async () => {
    const rootDir = join(FIXTURES, "insecure-app");
    const appDir = join(rootDir, "app");
    const apiResult = await analyzeApi(appDir);
    const result = await analyzeSecurity(rootDir, apiResult, false);

    const secretIssues = result.issues.filter((i) => i.type === "hardcoded-secret");
    expect(secretIssues.length).toBeGreaterThanOrEqual(2);
  });

  it("detects env leaks", async () => {
    const rootDir = join(FIXTURES, "insecure-app");
    const result = await analyzeSecurity(rootDir, null, false);

    const envIssues = result.issues.filter((i) => i.type === "env-leak");
    expect(envIssues.length).toBeGreaterThanOrEqual(1);
    expect(envIssues[0].message).toContain("NEXT_PUBLIC_SECRET_KEY");
  });

  it("detects unprotected API routes", async () => {
    const rootDir = join(FIXTURES, "insecure-app");
    const appDir = join(rootDir, "app");
    const apiResult = await analyzeApi(appDir);
    const result = await analyzeSecurity(rootDir, apiResult, false);

    const apiIssues = result.issues.filter((i) => i.type === "unprotected-api");
    expect(apiIssues.length).toBeGreaterThanOrEqual(2);
  });

  it("detects missing middleware", async () => {
    const rootDir = join(FIXTURES, "insecure-app");
    const result = await analyzeSecurity(rootDir, null, false);

    const middlewareIssue = result.issues.find((i) => i.type === "no-middleware");
    expect(middlewareIssue).toBeDefined();
  });

  it("calculates security score", async () => {
    const rootDir = join(FIXTURES, "insecure-app");
    const appDir = join(rootDir, "app");
    const apiResult = await analyzeApi(appDir);
    const result = await analyzeSecurity(rootDir, apiResult, false);

    expect(result.score).toBeLessThan(50);
  });

  it("reports good score for basic-app", async () => {
    const rootDir = join(FIXTURES, "basic-app");
    const appDir = join(rootDir, "app");
    const apiResult = await analyzeApi(appDir);
    const result = await analyzeSecurity(rootDir, apiResult, true);

    expect(result.score).toBeGreaterThanOrEqual(70);
  });

  it("detects no-gitignore for .env", async () => {
    const rootDir = join(FIXTURES, "insecure-app");
    const result = await analyzeSecurity(rootDir, null, false);

    // insecure-app has no .gitignore
    const gitignoreIssue = result.issues.find(
      (i) => i.type === "no-gitignore" || i.type === "gitignore-missing",
    );
    expect(gitignoreIssue).toBeDefined();
  });
});
