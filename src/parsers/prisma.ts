export interface PrismaModel {
  name: string;
  fields: PrismaField[];
  hasIndex: boolean;
  hasUniqueConstraint: boolean;
}

export interface PrismaField {
  name: string;
  type: string;
  isRelation: boolean;
  isOptional: boolean;
  isList: boolean;
  attributes: string[];
}

export interface PrismaRelation {
  from: string;
  to: string;
  type: "1:1" | "1:N" | "N:N";
  fieldName: string;
}

export interface PrismaSchemaResult {
  models: PrismaModel[];
  relations: PrismaRelation[];
  orphanModels: string[];
  missingIndexFields: string[];
}

export function parsePrismaSchema(content: string): PrismaSchemaResult {
  const models: PrismaModel[] = [];
  const relations: PrismaRelation[] = [];
  const modelNames = new Set<string>();

  // Extract model blocks
  const modelRegex = /model\s+(\w+)\s*\{([^}]+)\}/g;
  let match;

  while ((match = modelRegex.exec(content)) !== null) {
    const modelName = match[1];
    modelNames.add(modelName);

    const body = match[2];
    const fields = parseModelFields(body);

    const hasIndex =
      /@@index/.test(body) || fields.some((f) => f.attributes.some((a) => a.includes("@unique")));
    const hasUniqueConstraint = /@@unique/.test(body) || /@@id/.test(body);

    models.push({
      name: modelName,
      fields,
      hasIndex,
      hasUniqueConstraint,
    });
  }

  // Detect relations
  for (const model of models) {
    for (const field of model.fields) {
      if (modelNames.has(field.type)) {
        field.isRelation = true;

        const reverseModel = models.find((m) => m.name === field.type);
        const reverseField = reverseModel?.fields.find(
          (f) => f.type === model.name,
        );

        let relType: "1:1" | "1:N" | "N:N";
        if (field.isList && reverseField?.isList) {
          relType = "N:N";
        } else if (field.isList || reverseField?.isList) {
          relType = "1:N";
        } else {
          relType = "1:1";
        }

        // Avoid duplicate relations (A→B and B→A)
        const existing = relations.find(
          (r) =>
            (r.from === model.name && r.to === field.type) ||
            (r.from === field.type && r.to === model.name),
        );
        if (!existing) {
          relations.push({
            from: model.name,
            to: field.type,
            type: relType,
            fieldName: field.name,
          });
        }
      }
    }
  }

  // Detect orphan models (no relations)
  const relatedModels = new Set<string>();
  for (const rel of relations) {
    relatedModels.add(rel.from);
    relatedModels.add(rel.to);
  }
  const orphanModels = models
    .map((m) => m.name)
    .filter((name) => !relatedModels.has(name));

  // Detect missing indexes on foreign key fields
  const missingIndexFields: string[] = [];
  for (const model of models) {
    for (const field of model.fields) {
      if (
        field.name.endsWith("Id") &&
        !field.attributes.some(
          (a) => a.includes("@id") || a.includes("@unique"),
        ) &&
        !model.hasIndex
      ) {
        missingIndexFields.push(`${model.name}.${field.name}`);
      }
    }
  }

  return { models, relations, orphanModels, missingIndexFields };
}

function parseModelFields(body: string): PrismaField[] {
  const fields: PrismaField[] = [];
  const lines = body.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("@@")) continue;

    const fieldMatch = trimmed.match(/^(\w+)\s+(\w+)(\[\])?\??(.*)$/);
    if (!fieldMatch) continue;

    const [, name, type, listMarker, rest] = fieldMatch;
    const attributes = rest
      ? (rest.match(/@\w+[^@]*/g) || []).map((a) => a.trim())
      : [];

    fields.push({
      name,
      type,
      isRelation: false,
      isOptional: trimmed.includes("?"),
      isList: !!listMarker,
      attributes,
    });
  }

  return fields;
}
