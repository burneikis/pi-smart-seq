interface PendingCall {
  seq: number;
  done: Promise<void>;
  finish: () => void;
}

export class AbortedError extends Error {
  constructor() {
    super("Operation aborted");
  }
}

/**
 * Tracks top-level tool calls in the order pi starts them. pi emits
 * tool_execution_start for every call of a batch, in message order, before any
 * execute() runs, so "earlier" here means "earlier in the assistant message".
 */
export class CallOrderCoordinator {
  private pending = new Map<string, PendingCall>();
  private nextSeq = 0;

  started(toolCallId: string): void {
    if (this.pending.has(toolCallId)) return;
    let finish!: () => void;
    const done = new Promise<void>((resolve) => (finish = resolve));
    this.pending.set(toolCallId, { seq: this.nextSeq++, done, finish });
  }

  finished(toolCallId: string): void {
    this.pending.get(toolCallId)?.finish();
    this.pending.delete(toolCallId);
  }

  reset(): void {
    for (const call of this.pending.values()) call.finish();
    this.pending.clear();
  }

  pendingBefore(toolCallId: string): number {
    return this.earlierCalls(toolCallId).length;
  }

  async waitForEarlierCalls(toolCallId: string, signal?: AbortSignal): Promise<void> {
    const earlier = this.earlierCalls(toolCallId);
    if (earlier.length === 0) return;
    await untilAborted(Promise.all(earlier.map((call) => call.done)), signal);
  }

  private earlierCalls(toolCallId: string): PendingCall[] {
    const own = this.pending.get(toolCallId);
    if (!own) return [];
    return [...this.pending.values()].filter((call) => call.seq < own.seq);
  }
}

function untilAborted<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(new AbortedError());
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new AbortedError());
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}
