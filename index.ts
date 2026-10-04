/**
 * pi-smart-seq: per-call ordering for parallel tool batches.
 *
 * Adds an optional `wait` parameter to `bash`. A bash call with `wait: true`
 * starts only after every earlier tool call (any tool) in the same assistant
 * message has finished. Calls without it keep pi's parallel behavior.
 *
 * If another extension owns `bash` (for example pi-nolo), that extension applies
 * the parameter through the API published on globalThis (see src/api.ts).
 * Otherwise this extension replaces the built-in bash on session_start.
 */
import { createBashToolDefinition, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { publishApi } from "./src/api.ts";
import { CallOrderCoordinator } from "./src/coordinator.ts";

const isTopLevel = (event: { parentToolCallId?: string }) => !event.parentToolCallId;

export default function (pi: ExtensionAPI) {
  const coordinator = new CallOrderCoordinator();
  const api = publishApi(coordinator);

  pi.on("tool_execution_start", (event) => {
    if (isTopLevel(event)) coordinator.started(event.toolCallId);
  });
  pi.on("tool_execution_end", (event) => {
    if (isTopLevel(event)) coordinator.finished(event.toolCallId);
  });
  pi.on("agent_end", () => coordinator.reset());

  const findBash = () => pi.getAllTools().find((tool) => tool.name === "bash");
  const hasWaitParam = (bash: ReturnType<typeof findBash>) => bash?.parameters?.properties?.wait !== undefined;

  pi.on("session_start", (_event, ctx) => {
    const bash = findBash();
    if (bash && !hasWaitParam(bash) && bash.sourceInfo.path.startsWith("builtin:")) {
      pi.registerTool(api.decorateTool(createBashToolDefinition(ctx.cwd)));
    }
  });

  // session_start handler order across extensions is not guaranteed, so the owner of
  // bash may apply the decorator after us. Check once all of them have run.
  let checked = false;
  pi.on("session_start", () => {
    checked = false;
  });
  pi.on("before_agent_start", (_event, ctx) => {
    if (checked) return;
    checked = true;
    const bash = findBash();
    if (bash && !hasWaitParam(bash) && ctx.hasUI) {
      ctx.ui.notify(
        `pi-smart-seq: bash is owned by ${bash.sourceInfo.path}, which does not apply the wait parameter.`,
        "warning",
      );
    }
  });
}
