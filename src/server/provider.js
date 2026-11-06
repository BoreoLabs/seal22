import { applyPrompt } from "../lib/generate.js";
import { PROVIDER_ID } from "./limits.js";

export async function runProvider({ project, prompt }) {
  const started = Date.now();
  const result = applyPrompt(project, prompt);
  return {
    provider: PROVIDER_ID,
    result,
    durationMs: Date.now() - started,
  };
}
