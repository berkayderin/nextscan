import { join } from "path";
import { fileExists, readFileContent, findFiles } from "../utils/fs.js";
import { parsePrismaSchema, type PrismaSchemaResult } from "../parsers/prisma.js";
import { parseDrizzleSchema, type DrizzleSchemaResult } from "../parsers/drizzle.js";
import type { ProjectInfo } from "../utils/detect.js";

export interface SchemaResult {
  prisma: PrismaSchemaResult | null;
  drizzle: DrizzleSchemaResult | null;
  totalModels: number;
  totalRelations: number;
  summary: string;
}

export async function analyzeSchema(project: ProjectInfo): Promise<SchemaResult> {
  let prisma: PrismaSchemaResult | null = null;
  let drizzle: DrizzleSchemaResult | null = null;

  if (project.orm.includes("prisma")) {
    prisma = await analyzePrisma(project.rootDir);
  }

  if (project.orm.includes("drizzle")) {
    drizzle = await analyzeDrizzle(project.rootDir);
  }

  const totalModels =
    (prisma?.models.length ?? 0) + (drizzle?.tables.length ?? 0);
  const totalRelations =
    (prisma?.relations.length ?? 0) + (drizzle?.relations.length ?? 0);

  const parts: string[] = [];
  if (prisma) {
    parts.push(`Prisma: ${prisma.models.length} models, ${prisma.relations.length} relations`);
    if (prisma.orphanModels.length > 0) {
      parts.push(`orphans: ${prisma.orphanModels.join(", ")}`);
    }
    if (prisma.missingIndexFields.length > 0) {
      parts.push(`missing indexes: ${prisma.missingIndexFields.join(", ")}`);
    }
  }
  if (drizzle) {
    parts.push(`Drizzle: ${drizzle.tables.length} tables, ${drizzle.relations.length} relations`);
  }

  return {
    prisma,
    drizzle,
    totalModels,
    totalRelations,
    summary: parts.join(" | "),
  };
}

async function analyzePrisma(rootDir: string): Promise<PrismaSchemaResult | null> {
  const candidates = [
    join(rootDir, "prisma", "schema.prisma"),
    join(rootDir, "schema.prisma"),
  ];

  for (const candidate of candidates) {
    const content = await readFileContent(candidate);
    if (content) {
      return parsePrismaSchema(content);
    }
  }

  return null;
}

async function analyzeDrizzle(rootDir: string): Promise<DrizzleSchemaResult | null> {
  const schemaFiles = await findFiles(rootDir, (rel) =>
    /schema\.(ts|js)$/.test(rel) || /\.schema\.(ts|js)$/.test(rel) || rel.includes("drizzle"),
  );

  if (schemaFiles.length === 0) return null;

  const contents = new Map<string, string>();
  for (const file of schemaFiles) {
    const content = await readFileContent(file);
    if (content) {
      contents.set(file, content);
    }
  }

  if (contents.size === 0) return null;

  return parseDrizzleSchema(schemaFiles, contents);
}
