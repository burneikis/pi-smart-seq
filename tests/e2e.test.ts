import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fauxAssistantMessage, fauxProvider, fauxToolCall } from "@earendil-works/pi-ai";
import {
  createAgentSession,
  createBashToolDefinition,
  DefaultResourceLoader,
  ModelRuntime,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import smartSeq from "../index.ts";

type Factory = (pi: any) => void;

/** Loads before smart-seq and owns bash, like pi-nolo. */
const bashOwner: Factory = (pi) => {
  const register = (decorate: (def: any) => any) => {
    const base = decorate(createBashToolDefinition(process.cwd()));
    pi.registerTool({ ...base, execute: (...args: any[]) => (base.execute as any)(...args) });
  };
  register((def) => def);
  pi.on("session_start", () => {
    const seq = (globalThis as any)[Symbol.for("pi-smart-seq")];
    if (seq) register(seq.decorateTool);
  });
};

async function runBatch(
  dir: string,
  calls: { command: string; wait?: boolean }[],
  extensionFactories: Factory[] = [smartSeq],
) {
  const faux = fauxProvider();
  const modelRuntime = await ModelRuntime.create({
    authPath: join(dir, "auth.json"),
    modelsPath: null,
    refreshOnCreate: false,
  });
  modelRuntime.registerNativeProvider(faux.provider);
  await modelRuntime.setRuntimeApiKey(faux.provider.id, "test");

  faux.setResponses([
    fauxAssistantMessage(
      calls.map((args, i) => fauxToolCall("bash", args, { id: `call${i}` })),
      { stopReason: "toolUse" },
    ),
    fauxAssistantMessage("done"),
  ]);

  const resourceLoader = new DefaultResourceLoader({
    cwd: dir,
    agentDir: dir,
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
    extensionFactories,
  } as any);
  await resourceLoader.reload();

  const { session } = await createAgentSession({
    cwd: dir,
    agentDir: dir,
    model: faux.getModel(),
    thinkingLevel: "off",
    modelRuntime,
    resourceLoader,
    tools: ["bash"],
    sessionManager: SessionManager.inMemory(dir),
    settingsManager: SettingsManager.inMemory({ compaction: { enabled: false } }),
  });

  await session.bindExtensions({});

  const results = new Map<string, { text: string; isError: boolean }>();
  session.subscribe((event: any) => {
    if (event.type === "tool_execution_end" && !event.parentToolCallId) {
      results.set(event.toolCallId, { text: event.result.content?.[0]?.text ?? "", isError: event.isError });
    }
  });
  try {
    await session.prompt("go");
  } finally {
    session.dispose();
  }
  return results;
}

test("wait: true reads the file written by an earlier slow call", async () => {
  const dir = mkdtempSync(join(tmpdir(), "smart-seq-"));
  try {
    const file = join(dir, "abc.txt");
    const results = await runBatch(dir, [
      { command: `sleep 0.5; echo abcdefg > ${file}` },
      { command: `cat ${file}`, wait: true },
    ]);
    assert.equal(results.get("call1")?.isError, false);
    assert.match(results.get("call1")!.text, /abcdefg/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("without wait the read races the write (parallel behavior kept)", async () => {
  const dir = mkdtempSync(join(tmpdir(), "smart-seq-"));
  try {
    const file = join(dir, "abc.txt");
    const results = await runBatch(dir, [
      { command: `sleep 0.5; echo abcdefg > ${file}` },
      { command: `cat ${file}` },
    ]);
    assert.equal(results.get("call1")?.isError, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("wait works when another extension owns bash and applies the decorator", async () => {
  const dir = mkdtempSync(join(tmpdir(), "smart-seq-"));
  try {
    const file = join(dir, "abc.txt");
    const results = await runBatch(
      dir,
      [{ command: `sleep 0.5; echo abcdefg > ${file}` }, { command: `cat ${file}`, wait: true }],
      [bashOwner, smartSeq],
    );
    assert.equal(results.get("call1")?.isError, false);
    assert.match(results.get("call1")!.text, /abcdefg/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
