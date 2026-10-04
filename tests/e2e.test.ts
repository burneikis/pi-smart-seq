import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fauxAssistantMessage, fauxProvider, fauxToolCall } from "@earendil-works/pi-ai";
import {
  createAgentSession,
  DefaultResourceLoader,
  ModelRuntime,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import smartSeq from "../index.ts";

async function runBatch(dir: string, calls: { command: string; wait?: boolean }[]) {
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
    extensionFactories: [smartSeq],
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
