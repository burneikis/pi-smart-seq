import { test } from "node:test";
import assert from "node:assert/strict";
import { AbortedError, CallOrderCoordinator } from "../src/coordinator.ts";

const tick = () => new Promise((resolve) => setImmediate(resolve));

test("first call does not wait", async () => {
  const c = new CallOrderCoordinator();
  c.started("a");
  c.started("b");
  await c.waitForEarlierCalls("a");
  assert.equal(c.pendingBefore("a"), 0);
});

test("later call waits for all earlier calls", async () => {
  const c = new CallOrderCoordinator();
  c.started("a");
  c.started("b");
  c.started("c");
  let released = false;
  const waiting = c.waitForEarlierCalls("c").then(() => (released = true));

  c.finished("a");
  await tick();
  assert.equal(released, false);

  c.finished("b");
  await waiting;
  assert.equal(released, true);
});

test("does not wait for calls started later", async () => {
  const c = new CallOrderCoordinator();
  c.started("a");
  c.started("b");
  c.finished("a");
  await c.waitForEarlierCalls("b");
});

test("unknown call id does not wait", async () => {
  const c = new CallOrderCoordinator();
  c.started("a");
  await c.waitForEarlierCalls("zzz");
});

test("abort stops waiting", async () => {
  const c = new CallOrderCoordinator();
  c.started("a");
  c.started("b");
  const controller = new AbortController();
  const waiting = c.waitForEarlierCalls("b", controller.signal);
  controller.abort();
  await assert.rejects(waiting, AbortedError);
});

test("reset releases waiters", async () => {
  const c = new CallOrderCoordinator();
  c.started("a");
  c.started("b");
  const waiting = c.waitForEarlierCalls("b");
  c.reset();
  await waiting;
});
