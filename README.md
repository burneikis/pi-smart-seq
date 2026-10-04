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

## Extensions that own `bash`

Two extensions cannot both register `bash`. If another extension owns it, that extension
applies the parameter through the API published on `globalThis` (see `src/api.ts`):

```ts
pi.on("session_start", () => {
  const seq = (globalThis as any)[Symbol.for("pi-smart-seq")];
  if (seq) pi.registerTool(myBashWrapper(seq.decorateTool(createBashToolDefinition(cwd))));
});
```

Read it in `session_start`: extensions load in order, so it may not exist at load time.
If bash is still the built-in, pi-smart-seq replaces it itself on `session_start`.
If another extension owns bash without the parameter, a warning is shown.

pi-nolo does this; the wait happens after its confirmation prompt.

## Install

```sh
pi install ~/Code/pi-smart-seq
```

## Tests

```sh
npm test                       # unit tests
node --test tests/e2e.test.ts  # SDK + faux provider, needs pi packages in node_modules
```
