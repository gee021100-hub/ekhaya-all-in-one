import { describe, it, expect } from "vitest";
import { sha256, pbkdf2Sha256, toHex } from "../sha256.js";

describe("sha256", () => {
  it("matches known vectors", () => {
    expect(sha256("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(sha256("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256("hello world")).toBe("b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9");
  });

  it("handles unicode", () => {
    const r = sha256("é");
    expect(r).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("pbkdf2Sha256", () => {
  it("matches RFC 7914 test vectors", () => {
    const p1 = pbkdf2Sha256("password", "salt", 1, 32);
    expect(p1).toBe("120fb6cffcf8b32c43e7225256c4f837a86548c92ccc35480805987cb70be17b");
    const p4096 = pbkdf2Sha256("password", "salt", 4096, 32);
    expect(p4096).toBe("c5e478d59288c841aa530db6845c4c8d962893a001ce4e11a4963873aa98134a");
  });

  it("produces correct length keys", () => {
    const k = pbkdf2Sha256("test", "vector", 100, 64);
    expect(k).toHaveLength(128); // 64 bytes = 128 hex chars
  });

  it("is deterministic", () => {
    const a = pbkdf2Sha256("pw", "salt", 1000, 32);
    const b = pbkdf2Sha256("pw", "salt", 1000, 32);
    expect(a).toBe(b);
  });

  it("different passwords produce different hashes", () => {
    const a = pbkdf2Sha256("password1", "salt", 100, 32);
    const b = pbkdf2Sha256("password2", "salt", 100, 32);
    expect(a).not.toBe(b);
  });

  it("different salts produce different hashes", () => {
    const a = pbkdf2Sha256("password", "salt1", 100, 32);
    const b = pbkdf2Sha256("password", "salt2", 100, 32);
    expect(a).not.toBe(b);
  });
});

describe("toHex", () => {
  it("converts bytes to hex", () => {
    expect(toHex(new Uint8Array([0, 15, 255]))).toBe("000fff");
  });
});