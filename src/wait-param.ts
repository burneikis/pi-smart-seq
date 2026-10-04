import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import type { CallOrderCoordinator } from "./coordinator.ts";

export const WAIT_PARAM_DESCRIPTION =
  "Set true if this call depends on the effects of earlier tool calls in the same message " +
  "(for example reading a file an earlier call writes). It then starts only after all " +
  "earlier calls in the message have finished. Omit for independent calls so they run in parallel.";

export const WAIT_GUIDELINE =
  "Tool calls in one message run in parallel. When a bash call depends on an earlier call in the " +
  "same message, set `wait: true` on it; otherwise leave `wait` unset.";

/**
 * Adds an optional `wait` boolean to a tool. A call with `wait: true` waits for
 * every earlier call of the same assistant message before it executes.
 */
export function withWaitParam(base: ToolDefinition<any, any, any>, coordinator: CallOrderCoordinator) {
  const actualStartTimes = new Map<string, number>();

  const fixStartedAt = (context: any) => {
    const actualStart = actualStartTimes.get(context?.toolCallId);
    if (actualStart !== undefined && context.state) context.state.startedAt = actualStart;
  };

  return {
    ...base,
    parameters: Type.Object({
      ...base.parameters.properties,
      wait: Type.Optional(Type.Boolean({ description: WAIT_PARAM_DESCRIPTION })),
    }),
    promptGuidelines: [...(base.promptGuidelines ?? []), WAIT_GUIDELINE],
    async execute(toolCallId: string, params: any, signal: any, onUpdate: any, ctx: any) {
      const { wait, ...baseParams } = params ?? {};
      if (wait === true && coordinator.pendingBefore(toolCallId) > 0) {
        try {
          await coordinator.waitForEarlierCalls(toolCallId, signal);
        } finally {
          actualStartTimes.set(toolCallId, Date.now());
          setTimeout(() => actualStartTimes.delete(toolCallId), 60_000).unref?.();
        }
      }
      return base.execute(toolCallId, baseParams, signal, onUpdate, ctx);
    },
    renderCall(args: any, theme: any, context: any) {
      fixStartedAt(context);
      return base.renderCall!(args, theme, context);
    },
    renderResult(result: any, options: any, theme: any, context: any) {
      fixStartedAt(context);
      return base.renderResult!(result, options, theme, context);
    },
  } as ToolDefinition<any, any, any>;
}
