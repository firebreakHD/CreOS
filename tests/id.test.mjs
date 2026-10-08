import test from "node:test";
import assert from "node:assert/strict";
import { createId } from "@/lib/id";

test("createId works when crypto.randomUUID is unavailable", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "crypto");
  try {
    Object.defineProperty(globalThis, "crypto", { configurable: true, value: { getRandomValues: (bytes) => bytes.fill(0x11) } });
    const id = createId();
    assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);

    Object.defineProperty(globalThis, "crypto", { configurable: true, value: undefined });
    assert.match(createId(), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  } finally {
    if (original) Object.defineProperty(globalThis, "crypto", original);
    else Reflect.deleteProperty(globalThis, "crypto");
  }
});
