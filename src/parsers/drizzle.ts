import { Project, SyntaxKind, type CallExpression } from "ts-morph";
import { createProject, parseFile } from "./typescript.js";

export interface DrizzleTable {
  name: string;
  tableName: string;
  columns: DrizzleColumn[];
  dialect: "pg" | "mysql" | "sqlite";
  hasIndex: boolean;
}

export interface DrizzleColumn {
  name: string;
  type: string;
  isReference: boolean;
  referencesTable?: string;
}

export interface DrizzleRelation {
  from: string;
  to: string;
  fieldName: string;
}

export interface DrizzleSchemaResult {
  tables: DrizzleTable[];
  relations: DrizzleRelation[];
}

const TABLE_CREATORS: Record<string, "pg" | "mysql" | "sqlite"> = {
  pgTable: "pg",
  mysqlTable: "mysql",
  sqliteTable: "sqlite",
};

export function parseDrizzleSchema(filePaths: string[], contents: Map<string, string>): DrizzleSchemaResult {
  const project = createProject();
  const tables: DrizzleTable[] = [];
  const relations: DrizzleRelation[] = [];

  for (const filePath of filePaths) {
    const content = contents.get(filePath);
    if (!content) continue;

    const sourceFile = parseFile(project, filePath, content);

    // Find table definitions
    sourceFile.forEachDescendant((node) => {
      if (node.getKind() !== SyntaxKind.CallExpression) return;

      const call = node as CallExpression;
      const fnName = call.getExpression().getText();

      const dialect = TABLE_CREATORS[fnName];
      if (!dialect) return;

      const args = call.getArguments();
      if (args.length < 2) return;

      const tableName = args[0].getText().replace(/['"]/g, "");
      const columnsArg = args[1];

      const columns: DrizzleColumn[] = [];
      let hasIndex = false;

      // Parse object literal columns
      if (columnsArg.getKind() === SyntaxKind.ObjectLiteralExpression) {
        for (const prop of columnsArg.getChildrenOfKind(SyntaxKind.PropertyAssignment)) {
          const colName = prop.getName();
          const initializer = prop.getInitializer();
          if (!initializer) continue;

          const initText = initializer.getText();
          const colType = extractColumnType(initText);
          const isReference = /\.references\(/.test(initText);
          let referencesTable: string | undefined;

          if (isReference) {
            const refMatch = initText.match(/\.references\(\s*\(\)\s*=>\s*(\w+)/);
            if (refMatch) {
              referencesTable = refMatch[1];
            }
          }

          columns.push({ name: colName, type: colType, isReference, referencesTable });
        }
      }

      // Check for index in third argument
      if (args.length >= 3) {
        const thirdArg = args[2].getText();
        if (/index\(/.test(thirdArg) || /uniqueIndex\(/.test(thirdArg)) {
          hasIndex = true;
        }
      }

      // Derive a variable name for the table
      const parent = call.getParent();
      let varName = tableName;
      if (parent?.getKind() === SyntaxKind.VariableDeclaration) {
        const nameNode = parent.getFirstChildByKind(SyntaxKind.Identifier);
        if (nameNode) varName = nameNode.getText();
      }

      tables.push({ name: varName, tableName, columns, dialect, hasIndex });
    });
  }

  // Build relations from references
  for (const table of tables) {
    for (const col of table.columns) {
      if (col.isReference && col.referencesTable) {
        const targetTable = tables.find(
          (t) => t.name === col.referencesTable || t.tableName === col.referencesTable,
        );
        if (targetTable) {
          relations.push({
            from: table.name,
            to: targetTable.name,
            fieldName: col.name,
          });
        }
      }
    }
  }

  return { tables, relations };
}

function extractColumnType(initText: string): string {
  const typeMatch = initText.match(/(\w+)\(/);
  return typeMatch ? typeMatch[1] : "unknown";
}
