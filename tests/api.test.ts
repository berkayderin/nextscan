import { describe, it, expect } from "vitest";
import { join } from "path";
import { analyzeApi } from "../src/analyzers/api.js";

const FIXTURES = join(import.meta.dirname, "..", "fixtures");

describe("analyzeApi", () => {
  it("detects API endpoints in basic-app", async () => {
    const appDir = join(FIXTURES, "basic-app", "app");
    const result = await analyzeApi(appDir);

    expect(result.totalEndpoints).toBe(2);
    const usersEndpoint = result.endpoints.find((e) => e.path === "/api/users");
    expect(usersEndpoint).toBeDefined();
    expect(usersEndpoint!.methods).toContain("GET");
    expect(usersEndpoint!.methods).toContain("POST");
  });

  it("detects auth in protected endpoints", async () => {
    const appDir = join(FIXTURES, "basic-app", "app");
    const result = await analyzeApi(appDir);

    const usersEndpoint = result.endpoints.find((e) => e.path === "/api/users");
    expect(usersEndpoint!.hasAuth).toBe(true);
    expect(usersEndpoint!.authPattern).toBe("next-auth");
  });

  it("detects validation", async () => {
    const appDir = join(FIXTURES, "basic-app", "app");
    const result = await analyzeApi(appDir);

    const usersEndpoint = result.endpoints.find((e) => e.path === "/api/users");
    expect(usersEndpoint!.hasValidation).toBe(true);
    expect(usersEndpoint!.validationLib).toBe("zod");
  });

  it("detects public path exceptions", async () => {
    const appDir = join(FIXTURES, "basic-app", "app");
    const result = await analyzeApi(appDir);

    expect(result.publicPathExceptions).toContain("/api/health");
  });

  it("detects unprotected endpoints in insecure-app", async () => {
    const appDir = join(FIXTURES, "insecure-app", "app");
    const result = await analyzeApi(appDir);

    expect(result.unprotectedEndpoints.length).toBeGreaterThanOrEqual(2);
  });

  it("detects HTTP methods in insecure-app", async () => {
    const appDir = join(FIXTURES, "insecure-app", "app");
    const result = await analyzeApi(appDir);

    const adminEndpoint = result.endpoints.find((e) => e.path === "/api/admin");
    expect(adminEndpoint).toBeDefined();
    expect(adminEndpoint!.methods).toContain("GET");
    expect(adminEndpoint!.methods).toContain("POST");
    expect(adminEndpoint!.methods).toContain("DELETE");
  });

  it("flags missing validation on POST/PUT/PATCH", async () => {
    const appDir = join(FIXTURES, "insecure-app", "app");
    const result = await analyzeApi(appDir);

    const adminEndpoint = result.endpoints.find((e) => e.path === "/api/admin");
    expect(adminEndpoint!.issues).toContain("no-validation");
  });
});
