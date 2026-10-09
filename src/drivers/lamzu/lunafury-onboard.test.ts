import assert from "node:assert/strict";
import test from "node:test";
import { LamzuHidClient } from "./hid.ts";

(globalThis as { window?: { setTimeout: typeof setTimeout } }).window ??= { setTimeout };

function fixture(productId = 0x0033, options: { ignore?: string; stale?: string; unsupported?: boolean; truncate?: boolean } = {}) {
  let activeProfile = 1;
  const banks = Array.from({ length: 3 }, (_, index) => ({
    count: 3, active: 2, axes: true, scan: 1, usb: 1,
    table: [400 + index * 50, 800, 800 + index * 50, 1600, 1600 + index * 50, 3200, 3200, 6400, 6400, 6400, 30000, 30000],
  }));
  const sent: Uint8Array[] = [];
  let attempts = 0;
  const device = {
    vendorId: 0x373e, productId, productName: "LunaFury", opened: true,
    collections: [], open: async () => {}, close: async () => {},
    sendFeatureReport: async (_id: number, packet: Uint8Array) => {
      const copy = new Uint8Array(packet); sent.push(copy); attempts = 0;
      const key = `${copy[4]}:${copy[5]}`;
      if (options.ignore === key) return;
      const bank = banks[copy[6] - 1];
      if (key === "0:5") activeProfile = copy[6];
      if (!bank) return;
      if (key === "0:31") bank.scan = copy[7];
      if (key === "1:0") bank.usb = copy[7];
      if (key === "1:2") bank.active = copy[7];
      if (key === "1:13") bank.axes = copy[7] === 1;
      if (key === "1:1") {
        bank.count = copy[7];
        bank.table = Array.from({ length: 12 }, (_, index) => (copy[8 + index * 2] << 8) | copy[9 + index * 2]);
      }
    },
    receiveFeatureReport: async () => {
      const packet = sent.at(-1)!;
      const key = `${packet[4]}:${packet[5]}`;
      const profile = packet[6];
      const bank = banks[profile - 1] ?? banks[activeProfile - 1];
      let payload = [profile, 0];
      if (key === "0:129") payload = [0, 0, 26, 0];
      if (key === "0:131") payload = [0, 90];
      if (key === "0:133") payload = [activeProfile];
      if (key === "0:159") payload = [profile, bank.scan];
      if (key === "1:129") payload = [profile, bank.count, ...bank.table.flatMap((value) => [value >> 8, value & 255])];
      if (key === "1:130") payload = [profile, bank.active];
      if (key === "1:141") payload = [profile, +bank.axes];
      if (key === "1:128") payload = [profile, bank.usb];
      if (key === "1:136") payload = [profile, 1];
      if (key === "0:135") payload = [profile, 1, 44];
      const reply = new Uint8Array(64);
      reply[0] = options.unsupported && ["0:159", "1:141"].includes(key) ? 0xa2 : 0xa1;
      reply[4] = packet[4]; reply[5] = packet[5]; reply[3] = payload.length;
      reply.set(payload, 6);
      if (options.stale === key && attempts++ === 0) reply[6] = profile === 1 ? 2 : 1;
      if (options.truncate && key === "1:129") return new DataView(reply.slice(0, 10).buffer);
      const buffer = new Uint8Array(70); buffer.set(reply, 3);
      return new DataView(buffer.buffer, 3, 64);
    },
  } as unknown as HIDDevice;
  return { client: new LamzuHidClient(device), sent, banks, device };
}

test("LunaFury no longer exposes custom colors or sends color-table reads", async () => {
  const { client, sent } = fixture();
  assert.equal("setDpiStageColor" in client, false);
  assert.equal((await client.readStatus()).dpiStageColors, undefined);
  await client.setDpiStageCount(4);
  assert.equal(sent.some((packet) => packet[4] === 2 && [1, 0x81].includes(packet[5])), false);
});

for (const [pid, target, max] of [[0x32, 0, 6], [0x33, 2, 6], [0x54, 0, 5], [0x84, 2, 5]] as const) {
  test(`LunaFury ${pid.toString(16)} exposes model-specific onboard limits`, async () => {
    const { client } = fixture(pid);
    const status = await client.readStatus();
    assert.equal(status.profileCount, 3);
    assert.equal(status.ui?.dpiStageEditor?.maxStages, max);
    assert.equal(status.ui?.dpiStageEditor?.countEditable, true);
    assert.deepEqual(status.dpiStages, [400, 800, 1600]);
    assert.deepEqual(status.dpiStagesY, [800, 1600, 3200]);
    assert.equal(status.activeDpiStage, 1);
    assert.equal(status.supportsSeparateDpiAxes, true);
    assert.equal(status.lunafury?.separateDpiAxes, true);
    assert.deepEqual(status.lunafury?.supportedButtonPollingRates, pid === 0x32 ? [1000] : [1000, 2000, 4000, 8000]);
  });

  test(`LunaFury ${pid.toString(16)} edits both axes without touching other stages`, async () => {
    const { client, banks, sent } = fixture(pid);
    await client.readStatus();
    const previous = [...banks[0].table];
    assert.equal(await client.setDpiStageValue(0, 1200), 1200);
    assert.deepEqual(banks[0].table, [1200, previous[1], ...previous.slice(2)]);
    await client.setLunaFuryDpiStageAxes(0, 1200, 2400);
    assert.equal(banks[0].table[1], 2400);
    await client.setActiveDpiStage(0);
    const status = await client.readStatus(true);
    assert.equal(status.dpi, 1200); assert.equal(status.dpiY, 2400);
    const writes = sent.filter((packet) => packet[5] < 0x80);
    assert.ok(writes.every((packet) => packet[2] === target && packet[6] === 1));
    assert.equal(writes.find((packet) => packet[5] === 1)?.[3], 26);
  });

  test(`LunaFury ${pid.toString(16)} changes count and clamps active stage before shrinking`, async () => {
    const { client, banks, sent } = fixture(pid);
    await client.setActiveDpiStage(2);
    const previous = [...banks[0].table];
    await client.setDpiStageCount(1);
    assert.equal(banks[0].active, 1); assert.equal(banks[0].count, 1);
    assert.deepEqual(banks[0].table, previous, "dormant stage values survive shrinking");
    await client.setDpiStageCount(max);
    assert.equal(banks[0].count, max);
    assert.deepEqual(banks[0].table, previous);
    const writes = sent.filter((packet) => packet[4] === 1 && packet[5] < 0x80);
    assert.deepEqual(writes.map((packet) => packet[5]), [2, 2, 1, 1]);
  });

  test(`LunaFury ${pid.toString(16)} switches banks and discards old live cache`, async () => {
    const { client, banks, sent } = fixture(pid);
    await client.readStatus();
    assert.equal(await client.setProfile(3), 3);
    const status = await client.readStatus(true);
    assert.equal(status.activeProfile, 3); assert.equal(status.dpi, 900);
    await client.setDpiStageValue(1, 2000);
    assert.equal(banks[0].table[2], 800); assert.equal(banks[2].table[2], 2000);
    assert.ok(sent.filter((packet) => packet[5] === 5 || packet[5] === 1).every((packet) => packet[2] === target && packet[6] === 3));
  });
}

test("independent button polling does not change USB report frequency", async () => {
  const { client, banks } = fixture();
  await client.readStatus();
  for (const hz of [1000, 2000, 4000, 8000] as const) assert.equal(await client.setLunaFuryButtonPollingRate(hz), hz);
  assert.equal(banks[0].usb, 1);
  assert.equal((await client.readStatus(true)).lunafury?.buttonPollingRateHz, 8000);
  const wired = fixture(0x32);
  await assert.rejects(wired.client.setLunaFuryButtonPollingRate(8000), /does not support/);
  assert.equal(wired.sent.length, 0);
});

test("new setters fail on ignored writes and stale profile replies cannot confirm them", async () => {
  for (const [ignore, operation] of [
    ["0:5", (client: LamzuHidClient) => client.setProfile(3)],
    ["0:31", (client: LamzuHidClient) => client.setLunaFuryButtonPollingRate(8000)],
    ["1:2", (client: LamzuHidClient) => client.setActiveDpiStage(0)],
    ["1:13", (client: LamzuHidClient) => client.setLunaFurySeparateDpiAxes(false)],
    ["1:1", (client: LamzuHidClient) => client.setDpiStageValue(0, 1200)],
    ["1:1", (client: LamzuHidClient) => client.setDpiStageCount(4)],
  ] as const) {
    const { client } = fixture(0x33, { ignore, stale: ignore === "1:1" ? "1:129" : undefined });
    await assert.rejects(operation(client), /did not confirm/);
  }
});

test("axis lock, invalid values and disabled stages cannot write arbitrary data", async () => {
  const { client, sent, banks } = fixture();
  await client.setLunaFurySeparateDpiAxes(false);
  await client.setDpiStageValue(0, 1250);
  assert.deepEqual(banks[0].table.slice(0, 2), [1250, 1250]);
  const before = sent.filter((packet) => packet[5] < 0x80).length;
  for (const operation of [() => client.setProfile(4), () => client.setDpiStageCount(7),
    () => client.setDpiStageValue(0, 1234), () => client.setDpiStageValue(5, 800)]) await assert.rejects(operation());
  assert.equal(sent.filter((packet) => packet[5] < 0x80).length, before);
  await client.setLunaFuryDpiStageAxes(0, 800, 1600);
  assert.deepEqual(banks[0].table.slice(0, 2), [800, 1600], "axis lock must not prevent restoring dormant Y values");
});

test("multi-report stage edits and profile switches are serialized", async () => {
  const { client, banks } = fixture();
  await Promise.all([client.setDpiStageValue(0, 2000), client.setProfile(2), client.setDpiStageValue(0, 3000)]);
  assert.equal(banks[0].table[0], 2000); assert.equal(banks[1].table[0], 3000);
});

test("unsupported optional features stay absent and truncated DPI tables fail safely", async () => {
  const { client } = fixture(0x33, { unsupported: true });
  const status = await client.readStatus();
  assert.equal(status.lunafury?.buttonPollingRateHz, undefined);
  assert.equal(status.lunafury?.separateDpiAxes, undefined);
  assert.equal(status.supportsSeparateDpiAxes, false);
  await client.setDpi(1200);
  assert.equal((await client.readStatus()).dpi, 1200, "an unsupported axis toggle must not block the existing DPI control");
  await assert.rejects(fixture(0x33, { truncate: true }).client.setDpiStageValue(0, 1600), /Truncated/);
});

test("live status detects a profile switched outside this client", async () => {
  const { client, device } = fixture();
  await client.readStatus();
  const other = new LamzuHidClient(device);
  await other.setProfile(3);
  const status = await client.readStatus(true);
  assert.equal(status.activeProfile, 3);
  assert.deepEqual(status.dpiStages, [500, 900, 1700]);
});

test("new controls are gated to LunaFury and do not expose generic Lamzu banks", async () => {
  const { device, sent } = fixture();
  Object.defineProperty(device, "productId", { value: 0x001d });
  const client = new LamzuHidClient(device);
  await assert.rejects(client.setProfile(2), /only available on LunaFury/);
  await assert.rejects(client.setDpiStageCount(4), /only available on LunaFury/);
  await assert.rejects(client.setLunaFuryButtonPollingRate(8000), /only available on LunaFury/);
  assert.equal(sent.length, 0);
});
