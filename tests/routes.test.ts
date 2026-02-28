import { describe, it, expect } from "vitest";
import { join } from "path";
import { analyzeRoutes } from "../src/analyzers/routes.js";

const FIXTURES = join(import.meta.dirname, "..", "fixtures");

describe("analyzeRoutes", () => {
  it("detects all pages in basic-app", async () => {
    const appDir = join(FIXTURES, "basic-app", "app");
    const rootDir = join(FIXTURES, "basic-app");
    const result = await analyzeRoutes(appDir, rootDir);

    expect(result.totalPages).toBeGreaterThanOrEqual(4);
    expect(result.totalLayouts).toBeGreaterThanOrEqual(2);
    expect(result.totalApiRoutes).toBeGreaterThanOrEqual(2);
  });

  it("detects dynamic routes", async () => {
    const appDir = join(FIXTURES, "basic-app", "app");
    const rootDir = join(FIXTURES, "basic-app");
    const result = await analyzeRoutes(appDir, rootDir);

    expect(result.dynamicRoutes).toBeGreaterThanOrEqual(1);
    const dynamicRoute = result.routes.find((r) => r.path.includes("[slug]"));
    expect(dynamicRoute).toBeDefined();
    expect(dynamicRoute!.isDynamic).toBe(true);
    expect(dynamicRoute!.hasGenerateStaticParams).toBe(true);
  });

  it("detects client components", async () => {
    const appDir = join(FIXTURES, "basic-app", "app");
    const rootDir = join(FIXTURES, "basic-app");
    const result = await analyzeRoutes(appDir, rootDir);

    expect(result.clientComponents).toBeGreaterThanOrEqual(1);
    const clientPage = result.routes.find(
      (r) => r.path.includes("dashboard") && r.type === "page",
    );
    expect(clientPage?.isClientComponent).toBe(true);
  });

  it("detects route groups", async () => {
    const appDir = join(FIXTURES, "basic-app", "app");
    const rootDir = join(FIXTURES, "basic-app");
    const result = await analyzeRoutes(appDir, rootDir);

    expect(result.routeGroups.length).toBeGreaterThanOrEqual(1);
    expect(result.routeGroups).toContain("(marketing)");
  });

  it("detects middleware matchers", async () => {
    const appDir = join(FIXTURES, "basic-app", "app");
    const rootDir = join(FIXTURES, "basic-app");
    const result = await analyzeRoutes(appDir, rootDir);

    expect(result.middlewareMatchers.length).toBeGreaterThanOrEqual(1);
    expect(result.middlewareMatchers).toContain("/dashboard/:path*");
  });

  it("detects loading files", async () => {
    const appDir = join(FIXTURES, "basic-app", "app");
    const rootDir = join(FIXTURES, "basic-app");
    const result = await analyzeRoutes(appDir, rootDir);

    const loadingRoute = result.routes.find((r) => r.type === "loading");
    expect(loadingRoute).toBeDefined();
  });
});
