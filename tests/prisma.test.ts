import { describe, it, expect } from "vitest";
import { parsePrismaSchema } from "../src/parsers/prisma.js";
import { readFileSync } from "fs";
import { join } from "path";

const FIXTURES = join(import.meta.dirname, "..", "fixtures");

describe("parsePrismaSchema", () => {
  const schema = readFileSync(
    join(FIXTURES, "prisma-app", "prisma", "schema.prisma"),
    "utf-8",
  );

  it("parses all models", () => {
    const result = parsePrismaSchema(schema);
    expect(result.models.length).toBe(5);
    const modelNames = result.models.map((m) => m.name);
    expect(modelNames).toContain("User");
    expect(modelNames).toContain("Post");
    expect(modelNames).toContain("Profile");
    expect(modelNames).toContain("Tag");
    expect(modelNames).toContain("AuditLog");
  });

  it("parses model fields", () => {
    const result = parsePrismaSchema(schema);
    const user = result.models.find((m) => m.name === "User");
    expect(user).toBeDefined();
    expect(user!.fields.length).toBeGreaterThanOrEqual(4);
    const emailField = user!.fields.find((f) => f.name === "email");
    expect(emailField?.type).toBe("String");
  });

  it("detects 1:N relations", () => {
    const result = parsePrismaSchema(schema);
    const userPostRel = result.relations.find(
      (r) =>
        (r.from === "User" && r.to === "Post") ||
        (r.from === "Post" && r.to === "User"),
    );
    expect(userPostRel).toBeDefined();
    expect(userPostRel!.type).toBe("1:N");
  });

  it("detects 1:1 relations", () => {
    const result = parsePrismaSchema(schema);
    const userProfileRel = result.relations.find(
      (r) =>
        (r.from === "User" && r.to === "Profile") ||
        (r.from === "Profile" && r.to === "User"),
    );
    expect(userProfileRel).toBeDefined();
    expect(userProfileRel!.type).toBe("1:1");
  });

  it("detects N:N relations", () => {
    const result = parsePrismaSchema(schema);
    const postTagRel = result.relations.find(
      (r) =>
        (r.from === "Post" && r.to === "Tag") ||
        (r.from === "Tag" && r.to === "Post"),
    );
    expect(postTagRel).toBeDefined();
    expect(postTagRel!.type).toBe("N:N");
  });

  it("detects orphan models", () => {
    const result = parsePrismaSchema(schema);
    expect(result.orphanModels).toContain("AuditLog");
    expect(result.orphanModels).not.toContain("User");
  });

  it("detects missing indexes on foreign keys", () => {
    const result = parsePrismaSchema(schema);
    expect(result.missingIndexFields).toContain("Post.authorId");
  });
});
