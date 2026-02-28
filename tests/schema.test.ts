import { describe, it, expect } from "vitest";
import { join } from "path";
import { analyzeSchema } from "../src/analyzers/schema.js";
import { detectProject } from "../src/utils/detect.js";

const FIXTURES = join(import.meta.dirname, "..", "fixtures");

describe("analyzeSchema", () => {
  it("analyzes Prisma schema", async () => {
    const project = await detectProject(join(FIXTURES, "prisma-app"));
    const result = await analyzeSchema(project);

    expect(result.prisma).not.toBeNull();
    expect(result.prisma!.models.length).toBe(5);
    expect(result.prisma!.relations.length).toBeGreaterThanOrEqual(3);
    expect(result.totalModels).toBe(5);
  });

  it("detects Prisma orphan models", async () => {
    const project = await detectProject(join(FIXTURES, "prisma-app"));
    const result = await analyzeSchema(project);

    expect(result.prisma!.orphanModels).toContain("AuditLog");
  });

  it("detects Prisma missing indexes", async () => {
    const project = await detectProject(join(FIXTURES, "prisma-app"));
    const result = await analyzeSchema(project);

    expect(result.prisma!.missingIndexFields.length).toBeGreaterThanOrEqual(1);
    expect(result.prisma!.missingIndexFields).toContain("Post.authorId");
  });

  it("analyzes Drizzle schema", async () => {
    const project = await detectProject(join(FIXTURES, "drizzle-app"));
    const result = await analyzeSchema(project);

    expect(result.drizzle).not.toBeNull();
    expect(result.drizzle!.tables.length).toBe(3);
    expect(result.drizzle!.relations.length).toBeGreaterThanOrEqual(2);
  });

  it("returns summary string", async () => {
    const project = await detectProject(join(FIXTURES, "prisma-app"));
    const result = await analyzeSchema(project);

    expect(result.summary).toContain("Prisma");
    expect(result.summary).toContain("models");
  });
});
