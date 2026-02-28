import { Project, SourceFile, SyntaxKind } from "ts-morph";
import { readFileContent } from "../utils/fs.js";

let cachedProject: Project | null = null;

export function createProject(): Project {
  if (!cachedProject) {
    cachedProject = new Project({
      compilerOptions: {
        allowJs: true,
        noEmit: true,
      },
      skipAddingFilesFromTsConfig: true,
    });
  }
  return cachedProject;
}

export function parseFile(project: Project, filePath: string, content: string): SourceFile {
  const existing = project.getSourceFile(filePath);
  if (existing) {
    existing.replaceWithText(content);
    return existing;
  }
  return project.createSourceFile(filePath, content, { overwrite: true });
}

export async function hasUseClientDirective(filePath: string): Promise<boolean> {
  const content = await readFileContent(filePath);
  if (!content) return false;
  const head = content.slice(0, 512);
  return /^['"]use client['"];?/m.test(head);
}

export function getExportedFunctionNames(sourceFile: SourceFile): string[] {
  const names: string[] = [];

  for (const fn of sourceFile.getFunctions()) {
    if (fn.isExported()) {
      const name = fn.getName();
      if (name) names.push(name);
    }
  }

  for (const varStmt of sourceFile.getVariableStatements()) {
    if (varStmt.isExported()) {
      for (const decl of varStmt.getDeclarations()) {
        names.push(decl.getName());
      }
    }
  }

  for (const exportDecl of sourceFile.getExportDeclarations()) {
    for (const named of exportDecl.getNamedExports()) {
      names.push(named.getName());
    }
  }

  const defaultExport = sourceFile.getDefaultExportSymbol();
  if (defaultExport) {
    names.push("default");
  }

  return names;
}

export function containsPatterns(content: string, patterns: RegExp[]): string[] {
  const matched: string[] = [];
  for (const p of patterns) {
    if (p.test(content)) {
      matched.push(p.source);
    }
  }
  return matched;
}

export function getCallExpressionNames(sourceFile: SourceFile): string[] {
  const names: string[] = [];
  sourceFile.forEachDescendant((node) => {
    if (node.getKind() === SyntaxKind.CallExpression) {
      const expr = node.getFirstChild();
      if (expr) {
        names.push(expr.getText());
      }
    }
  });
  return names;
}
