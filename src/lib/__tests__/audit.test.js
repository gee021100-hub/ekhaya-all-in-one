import { describe, it, expect } from "vitest";
import { appendEntry, verifyChain, smartLog } from "../audit.js";

describe("audit chain", () => {
  it("appendEntry produces valid single-entry chain", () => {
    const log = appendEntry([], { action: "test", by: "EKH-001" });
    expect(log).toHaveLength(1);
    expect(log[0].hash).toBeDefined();
    expect(log[0].hash).toMatch(/^[0-9a-f]{64}$/);
    expect(verifyChain(log).valid).toBe(true);
  });

  it("appendEntry chains correctly", () => {
    let log = [];
    log = appendEntry(log, { a: 1 });
    log = appendEntry(log, { a: 2 });
    log = appendEntry(log, { a: 3 });
    expect(log).toHaveLength(3);
    expect(verifyChain(log).valid).toBe(true);
    // entries are immutable (hash differs from prev hash)
    expect(log[0].hash).not.toBe(log[1].hash);
  });

  it("verifyChain detects tampered entry", () => {
    let log = [];
    log = appendEntry(log, { a: 1 });
    log = appendEntry(log, { a: 2 });
    log = appendEntry(log, { a: 3 });
    // tamper
    log[1].a = 999;
    const result = verifyChain(log);
    expect(result.valid).toBe(false);
    expect(result.brokenAt).toBe(1);
  });

  it("verifyChain detects inserted entry", () => {
    let log = [];
    log = appendEntry(log, { a: 1 });
    log = appendEntry(log, { a: 2 });
    log.splice(1, 0, { a: "sneaky", hash: "0000000000000000000000000000000000000000000000000000000000000000" });
    expect(verifyChain(log).valid).toBe(false);
  });

  it("empty chain is valid", () => {
    expect(verifyChain([]).valid).toBe(true);
  });

  it("smartLog enriches entry with actor info", () => {
    const log = smartLog([], { action: "test", entityType: "item", entityCode: "I-001", details: "added" }, "EKH-001", "Brian");
    expect(log[0].by).toBe("EKH-001");
    expect(log[0].byName).toBe("Brian");
    expect(log[0].at).toBeDefined();
    expect(log[0].hash).toBeDefined();
    expect(verifyChain(log).valid).toBe(true);
  });
});