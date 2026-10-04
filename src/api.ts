import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import type { CallOrderCoordinator } from "./coordinator.ts";
import { withWaitParam } from "./wait-param.ts";

export const API_KEY = Symbol.for("pi-smart-seq");

/**
 * Published on globalThis so an extension that owns a tool (for example pi-nolo
 * owning `bash`) can add the `wait` parameter without importing this package:
 *
 *   const seq = globalThis[Symbol.for("pi-smart-seq")];
 *   const base = seq ? seq.decorateTool(createBashToolDefinition(cwd)) : createBashToolDefinition(cwd);
 *
 * Extensions load in order, so read it in `session_start`, not at load time.
 */
export interface SmartSeqApi {
  decorateTool<T extends ToolDefinition<any, any, any>>(definition: T): T;
}

export function publishApi(coordinator: CallOrderCoordinator): SmartSeqApi {
  const api: SmartSeqApi = {
    decorateTool: (definition) => withWaitParam(definition, coordinator) as typeof definition,
  };
  (globalThis as Record<symbol, unknown>)[API_KEY] = api;
  return api;
}
