import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { scan } from "./tools/scan.js";

const server = new McpServer({
  name: "nextscan",
  version: "1.0.0",
});

server.tool(
  "scan",
  "Scan a Next.js project and return a compact summary of routes, API endpoints, schema, and security issues",
  {
    path: z.string().describe("Absolute path to the Next.js project root"),
    focus: z
      .enum(["routes", "api", "schema", "security"])
      .optional()
      .describe("Focus on a specific area (omit for full scan)"),
  },
  async ({ path, focus }) => {
    try {
      const result = await scan({ path, focus });
      return {
        content: [{ type: "text" as const, text: result }],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: "text" as const, text: `Error: ${message}` }],
        isError: true,
      };
    }
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
