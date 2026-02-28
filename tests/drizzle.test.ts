import { describe, it, expect } from "vitest";
import { parseDrizzleSchema } from "../src/parsers/drizzle.js";
import { readFileSync } from "fs";
import { join } from "path";

const FIXTURES = join(import.meta.dirname, "..", "fixtures");

describe("parseDrizzleSchema", () => {
  const schemaPath = join(FIXTURES, "drizzle-app", "drizzle", "schema.ts");
  const schemaContent = readFileSync(schemaPath, "utf-8");

  it("parses all tables", () => {
    const contents = new Map([[schemaPath, schemaContent]]);
    const result = parseDrizzleSchema([schemaPath], contents);

    expect(result.tables.length).toBe(3);
    const tableNames = result.tables.map((t) => t.tableName);
    expect(tableNames).toContain("users");
    expect(tableNames).toContain("posts");
    expect(tableNames).toContain("comments");
  });

  it("detects table columns", () => {
    const contents = new Map([[schemaPath, schemaContent]]);
    const result = parseDrizzleSchema([schemaPath], contents);

    const usersTable = result.tables.find((t) => t.tableName === "users");
    expect(usersTable).toBeDefined();
    expect(usersTable!.columns.length).toBeGreaterThanOrEqual(3);
  });

  it("detects references", () => {
    const contents = new Map([[schemaPath, schemaContent]]);
    const result = parseDrizzleSchema([schemaPath], contents);

    const postsTable = result.tables.find((t) => t.tableName === "posts");
    const authorCol = postsTable?.columns.find((c) => c.name === "authorId");
    expect(authorCol?.isReference).toBe(true);
  });

  it("builds relations from references", () => {
    const contents = new Map([[schemaPath, schemaContent]]);
    const result = parseDrizzleSchema([schemaPath], contents);

    expect(result.relations.length).toBeGreaterThanOrEqual(2);
    const postToUser = result.relations.find(
      (r) => r.from === "posts" && r.to === "users",
    );
    expect(postToUser).toBeDefined();
  });

  it("detects pg dialect", () => {
    const contents = new Map([[schemaPath, schemaContent]]);
    const result = parseDrizzleSchema([schemaPath], contents);

    for (const table of result.tables) {
      expect(table.dialect).toBe("pg");
    }
  });
});
