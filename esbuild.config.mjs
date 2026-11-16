import { fileURLToPath } from "node:url";
import { runPluginBuild } from "./esbuild.shared.mjs";

const alias = { "chart.js": fileURLToPath(import.meta.resolve("chart.js")) };

await runPluginBuild({ alias });
