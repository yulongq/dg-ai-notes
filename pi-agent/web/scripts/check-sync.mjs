import { synchronizeContent } from "../../scripts/sync-content.mjs";

try {
  synchronizeContent({ check: true });
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
