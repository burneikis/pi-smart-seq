/**
 * pi-smart-seq: per-call ordering for parallel tool batches.
 *
 * Re-registers `bash` with an optional `wait` parameter. A bash call with
 * `wait: true` starts only after every earlier tool call (any tool) in the same
 * assistant message has finished. Calls without it keep pi's parallel behavior.
 */
import { createBashToolDefinition, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { sharedCoordinator } from "./src/coordinator.ts";
import { withWaitParam } from "./src/wait-param.ts";

const isTopLevel = (event: { parentToolCallId?: string }) => !event.parentToolCallId;

export default function (pi: ExtensionAPI) {
  const coordinator = sharedCoordinator();

  pi.on("tool_execution_start", (event) => {
    if (isTopLevel(event)) coordinator.started(event.toolCallId);
  });
  pi.on("tool_execution_end", (event) => {
    if (isTopLevel(event)) coordinator.finished(event.toolCallId);
  });
  pi.on("agent_end", () => coordinator.reset());

  pi.registerTool(withWaitParam(createBashToolDefinition(process.cwd()), coordinator));

  pi.on("session_start", (_event, ctx) => {
    const bash = pi.getAllTools().find((tool) => tool.name === "bash");
    const ownsBash = bash?.parameters?.properties?.wait !== undefined;
    if (!ownsBash && ctx.hasUI) {
      ctx.ui.notify(
        `pi-smart-seq: bash is registered by ${bash?.sourceInfo.source ?? "another extension"}; ` +
          "the `wait` parameter is inactive.",
        "warning",
      );
    }
  });
}
