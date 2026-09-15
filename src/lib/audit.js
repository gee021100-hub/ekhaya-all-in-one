// Tamper-evident audit chain — pure logic, testable.

import { sha256 } from "./sha256.js";

function canonicalJSON(obj) {
  return JSON.stringify(obj, Object.keys(obj).sort());
}

export function hashEntry(entry, prevHash) {
  return sha256((prevHash || "") + canonicalJSON(entry));
}

export function appendEntry(prevLog, entry) {
  const prevHash = prevLog.length > 0 ? prevLog[prevLog.length - 1].hash : "";
  return [...prevLog, { ...entry, hash: hashEntry(entry, prevHash) }];
}

export function verifyChain(log) {
  let prev = "";
  for (let i = 0; i < log.length; i++) {
    const { hash, ...fields } = log[i];
    const expected = hashEntry(fields, prev);
    if (hash !== expected) return { valid: false, brokenAt: i, expected };
    prev = hash;
  }
  return { valid: true, brokenAt: -1, expected: "" };
}

export function smartLog(prevLog, entry, actorCode, actorName) {
  const enriched = {
    at: new Date().toLocaleString(),
    by: actorCode,
    byName: actorName,
    ...entry,
  };
  return appendEntry(prevLog, enriched);
}