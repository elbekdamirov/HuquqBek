// Loads game/.env (if present) before any other server module reads process.env.
// Existing environment variables always win. The file is git-ignored.
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
const file = fileURLToPath(new URL("../.env", import.meta.url));
if (existsSync(file)) {
  try {
    process.loadEnvFile(file);
  } catch (e) {
    console.warn("HuquqBek: .env could not be read:", e.message);
  }
}
