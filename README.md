# pi-smart-seq

Per-call ordering for pi's parallel tool batches.

pi runs all tool calls of one assistant message in parallel. This breaks batches like
"write a file" + "read the file". pi's built-in `executionMode: "sequential"` is per tool
name, so it serializes the whole batch.

This extension re-registers `bash` with an optional `wait` parameter:

- `wait` unset: the call runs in parallel, as before.
- `wait: true`: the call starts only after every earlier tool call (any tool) in the same
  message has finished.

A prompt guideline tells the model when to set it.

## How it works

In the parallel path pi emits `tool_execution_start` for every call of a batch, in message
order, before any `execute()` runs. The extension records that order and resolves each call
on `tool_execution_end`. A `wait: true` call awaits all earlier pending calls (abortable).
The "Took" timer is corrected to exclude the wait time.

The coordinator is a `globalThis` singleton (`Symbol.for("pi-smart-seq.coordinator")`), so
another extension that owns `bash` can reuse it.

## Install

```sh
pi install ~/Code/pi-smart-seq
```

## Tests

```sh
npm test                       # unit tests
node --test tests/e2e.test.ts  # SDK + faux provider, needs pi packages in node_modules
```
