import { describe, it, expect } from "vitest";
import { join } from "path";
import { scan } from "../src/tools/scan.js";

const FIXTURES = join(import.meta.dirname, "..", "fixtures");

describe("formatCompact (via scan)", () => {
  it("produces compact output for basic-app", async () => {
    const result = await scan({ path: join(FIXTURES, "basic-app") });

    expect(result).toContain("nextscan");
    expect(result).toContain("basic-app");
    expect(result).toContain("Routes");
    expect(result).toContain("API Endpoints");
    expect(result).toContain("Security");
  });

  it("output is under 3KB for basic-app", async () => {
    const result = await scan({ path: join(FIXTURES, "basic-app") });
    expect(Buffer.byteLength(result, "utf-8")).toBeLessThan(3072);
  });

  it("respects focus=routes", async () => {
    const result = await scan({
      path: join(FIXTURES, "basic-app"),
      focus: "routes",
    });

    expect(result).toContain("Routes");
    expect(result).not.toContain("API Endpoints");
    expect(result).not.toContain("Schema");
  });

  it("respects focus=security", async () => {
    const result = await scan({
      path: join(FIXTURES, "insecure-app"),
      focus: "security",
    });

    expect(result).toContain("Security");
    expect(result).toContain("Score:");
  });

  it("shows security issues for insecure-app", async () => {
    const result = await scan({ path: join(FIXTURES, "insecure-app") });

    expect(result).toContain("🔴");
    expect(result).toContain("Security");
  });

  it("shows schema info for prisma-app", async () => {
    const result = await scan({
      path: join(FIXTURES, "prisma-app"),
      focus: "schema",
    });

    expect(result).toContain("Schema");
    expect(result).toContain("Models:");
    expect(result).toContain("Relations:");
  });

  it("throws for non-nextjs project", async () => {
    await expect(scan({ path: "/tmp" })).rejects.toThrow();
  });
});
