import { readFileSync, writeFileSync } from "fs";

const file = "dist/index.js";
const content = readFileSync(file, "utf-8");
if (!content.startsWith("#!/")) {
  writeFileSync(file, `#!/usr/bin/env node\n${content}`);
}
