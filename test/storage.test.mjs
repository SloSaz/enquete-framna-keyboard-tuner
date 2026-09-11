import test, { describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { STORAGE_KEY, loadDraft, saveDraft, clearDraft } from "../lib/storage.ts";

// Simple in-memory mock for localStorage
function createMockLocalStorage() {
  const store = new Map();
  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
    get length() {
      return store.size;
    },
    key(index) {
      return Array.from(store.keys())[index] ?? null;
    },
  };
}

describe("lib/storage", () => {
  describe("SSR environment (window === undefined)", () => {
    beforeEach(() => {
      delete globalThis.window;
    });

    test("loadDraft returns null when window is undefined", () => {
      assert.equal(loadDraft(), null);
    });

    test("saveDraft does not throw when window is undefined", () => {
      assert.doesNotThrow(() => {
        saveDraft({
          index: 1,
          answers: { "1": "test" },
          others: {},
          otherOpen: {},
          startedAt: Date.now(),
        });
      });
    });

    test("clearDraft does not throw when window is undefined", () => {
      assert.doesNotThrow(() => {
        clearDraft();
      });
    });
  });

  describe("Browser environment (mocked window.localStorage)", () => {
    let mockStorage;

    beforeEach(() => {
      mockStorage = createMockLocalStorage();
      globalThis.window = {
        localStorage: mockStorage,
      };
    });

    test("loadDraft returns null when localStorage is empty", () => {
      assert.equal(loadDraft(), null);
    });

    test("saveDraft writes expected structure and loadDraft reads it back", () => {
      const now = Date.now() - 5000;
      saveDraft({
        index: 3,
        answers: {
          "1": "Enthusiast",
          "2": ["YouTube sound tests / build streams"],
          "3": 4,
          "7": { "Live visual feedback": 5 },
        },
        others: { "2": "Custom source" },
        otherOpen: { "2": true },
        startedAt: now,
      });

      const loaded = loadDraft();
      assert.ok(loaded !== null);
      assert.equal(loaded.version, 1);
      assert.equal(loaded.index, 3);
      assert.equal(loaded.answers["1"], "Enthusiast");
      assert.deepEqual(loaded.answers["2"], ["YouTube sound tests / build streams"]);
      assert.equal(loaded.answers["3"], 4);
      assert.deepEqual(loaded.answers["7"], { "Live visual feedback": 5 });
      assert.equal(loaded.others["2"], "Custom source");
      assert.equal(loaded.otherOpen["2"], true);
      assert.equal(loaded.startedAt, now);
      assert.ok(loaded.updatedAt >= now);
    });

    test("clearDraft removes the item from localStorage", () => {
      saveDraft({
        index: 2,
        answers: { "1": "Enthusiast" },
        others: {},
        otherOpen: {},
        startedAt: Date.now(),
      });

      assert.ok(mockStorage.getItem(STORAGE_KEY) !== null);

      clearDraft();

      assert.equal(mockStorage.getItem(STORAGE_KEY), null);
      assert.equal(loadDraft(), null);
    });

    test("handles corrupted JSON in localStorage gracefully", () => {
      const origWarn = console.warn;
      console.warn = () => {};
      try {
        mockStorage.setItem(STORAGE_KEY, "{ invalid json ... ");
        assert.equal(loadDraft(), null);
      } finally {
        console.warn = origWarn;
      }
    });

    test("handles non-object JSON values gracefully", () => {
      mockStorage.setItem(STORAGE_KEY, JSON.stringify("hello"));
      assert.equal(loadDraft(), null);

      mockStorage.setItem(STORAGE_KEY, JSON.stringify([1, 2, 3]));
      assert.equal(loadDraft(), null);

      mockStorage.setItem(STORAGE_KEY, JSON.stringify(42));
      assert.equal(loadDraft(), null);
    });

    test("sanitizes negative or float indices", () => {
      mockStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          version: 1,
          index: -5,
          answers: {},
          others: {},
          otherOpen: {},
          startedAt: 1000,
          updatedAt: 1000,
        }),
      );

      const loaded = loadDraft();
      assert.ok(loaded !== null);
      assert.equal(loaded.index, 0);

      saveDraft({
        index: -10,
        answers: {},
        others: {},
        otherOpen: {},
        startedAt: 1000,
      });

      const loaded2 = loadDraft();
      assert.ok(loaded2 !== null);
      assert.equal(loaded2.index, 0);
    });

    test("handles localStorage.setItem throwing QuotaExceededError", () => {
      globalThis.window.localStorage.setItem = () => {
        throw new Error("QuotaExceededError");
      };

      const origWarn = console.warn;
      console.warn = () => {};
      try {
        assert.doesNotThrow(() => {
          saveDraft({
            index: 1,
            answers: {},
            others: {},
            otherOpen: {},
            startedAt: 1000,
          });
        });
      } finally {
        console.warn = origWarn;
      }
    });

    test("handles localStorage.removeItem throwing error", () => {
      globalThis.window.localStorage.removeItem = () => {
        throw new Error("SecurityError");
      };

      const origWarn = console.warn;
      console.warn = () => {};
      try {
        assert.doesNotThrow(() => {
          clearDraft();
        });
      } finally {
        console.warn = origWarn;
      }
    });

    test("rejects drafts with incompatible version", () => {
      mockStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          version: 2,
          index: 3,
          answers: { "1": "test" },
          others: {},
          otherOpen: {},
          startedAt: 1000,
          updatedAt: 1000,
        }),
      );
      assert.equal(loadDraft(), null);
    });

    test("protects against prototype pollution keys", () => {
      mockStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          version: 1,
          index: 1,
          answers: JSON.parse('{"__proto__": {"polluted": true}, "1": "safe"}'),
          others: JSON.parse('{"constructor": "bad", "1": "other text"}'),
          otherOpen: JSON.parse('{"prototype": true, "1": true}'),
          startedAt: 1000,
          updatedAt: 1000,
        }),
      );

      const loaded = loadDraft();
      assert.ok(loaded !== null);
      assert.equal(loaded.answers["1"], "safe");
      assert.equal(Object.hasOwn(loaded.answers, "__proto__"), false);
      assert.equal(({}).polluted, undefined);
      assert.equal(loaded.others["1"], "other text");
      assert.equal(Object.hasOwn(loaded.others, "constructor"), false);
      assert.equal(loaded.otherOpen["1"], true);
      assert.equal(Object.hasOwn(loaded.otherOpen, "prototype"), false);
    });

    test("preserves startedAt of 0 without forcing Date.now()", () => {
      saveDraft({
        index: 0,
        answers: {},
        others: {},
        otherOpen: {},
        startedAt: 0,
      });

      const loaded = loadDraft();
      assert.ok(loaded !== null);
      assert.equal(loaded.startedAt, 0);
    });

    test("sanitizes NaN and Infinity index in saveDraft", () => {
      saveDraft({
        index: Number.NaN,
        answers: {},
        others: {},
        otherOpen: {},
        startedAt: 1000,
      });

      let loaded = loadDraft();
      assert.ok(loaded !== null);
      assert.equal(loaded.index, 0);

      saveDraft({
        index: Number.POSITIVE_INFINITY,
        answers: {},
        others: {},
        otherOpen: {},
        startedAt: 1000,
      });

      loaded = loadDraft();
      assert.ok(loaded !== null);
      assert.equal(loaded.index, 0);
    });

    test("handles null window.localStorage safely", () => {
      globalThis.window.localStorage = null;
      assert.equal(loadDraft(), null);
      assert.doesNotThrow(() => {
        saveDraft({
          index: 1,
          answers: {},
          others: {},
          startedAt: 1000,
        });
      });
      assert.doesNotThrow(() => {
        clearDraft();
      });
    });
  });
});
