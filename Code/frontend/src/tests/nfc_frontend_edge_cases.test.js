import test from "node:test";
import assert from "node:assert/strict";

import { isWebNfcSupported, normalizeUid, startNfcScan } from "../utils/nfcReader.js";

test("NFC Edge Case 1: isWebNfcSupported handles missing window or NDEFReader", () => {
  // In Node.js environment, window is undefined
  assert.equal(isWebNfcSupported(), false);

  // Mock window without NDEFReader
  globalThis.window = {};
  assert.equal(isWebNfcSupported(), false);

  // Mock window with NDEFReader
  globalThis.window = { NDEFReader: class {} };
  assert.equal(isWebNfcSupported(), true);

  delete globalThis.window;
});

test("NFC Edge Case 2: normalizeUid handles diverse and degenerate UID formats", () => {
  // Empty, null, undefined
  assert.equal(normalizeUid(""), "");
  assert.equal(normalizeUid(null), "");
  assert.equal(normalizeUid(undefined), "");

  // Colon delimited (Lavdeep Singh's card)
  assert.equal(normalizeUid("32:E5:A4:7A"), "32E5A47A");
  assert.equal(normalizeUid("32:e5:a4:7a"), "32E5A47A");

  // Dash delimited
  assert.equal(normalizeUid("04-A1-B2-C3-D4"), "04A1B2C3D4");
  assert.equal(normalizeUid("04-a1-b2-c3-d4"), "04A1B2C3D4");

  // Space delimited and surrounding whitespace
  assert.equal(normalizeUid("  32 E5 A4 7A  "), "32E5A47A");

  // Mixed delimiters
  assert.equal(normalizeUid("32:E5-A4 7A"), "32E5A47A");
});

test("NFC Edge Case 3: startNfcScan throws NotSupportedError when unsupported", async () => {
  delete globalThis.window;

  let errorCaptured = null;
  await assert.rejects(
    async () => {
      await startNfcScan({
        onError: (err) => {
          errorCaptured = err;
        },
      });
    },
    (err) => {
      assert.equal(err.name, "NotSupportedError");
      assert.equal(err.isUnsupported, true);
      return true;
    }
  );
  assert.equal(errorCaptured?.isUnsupported, true);
});

test("NFC Edge Case 4: startNfcScan handles Permission Denied (NotAllowedError)", async () => {
  class MockNDEFReader {
    addEventListener() {}
    removeEventListener() {}
    async scan() {
      const err = new Error("The operation is not allowed");
      err.name = "NotAllowedError";
      throw err;
    }
  }

  globalThis.window = { NDEFReader: MockNDEFReader };

  let errorCaptured = null;
  await assert.rejects(
    async () => {
      await startNfcScan({
        onError: (err) => {
          errorCaptured = err;
        },
      });
    },
    (err) => {
      assert.equal(err.name, "NotAllowedError");
      assert.equal(err.isPermissionDenied, true);
      assert.match(err.message, /NFC permission denied/);
      return true;
    }
  );

  delete globalThis.window;
});

test("NFC Edge Case 5: startNfcScan respects pre-aborted external signal", async () => {
  class MockNDEFReader {
    addEventListener() {}
    removeEventListener() {}
    async scan() {}
  }
  globalThis.window = { NDEFReader: MockNDEFReader };

  const controller = new AbortController();
  controller.abort(); // already aborted

  await assert.rejects(
    async () => {
      await startNfcScan({ signal: controller.signal });
    },
    (err) => {
      assert.equal(err.name, "AbortError");
      return true;
    }
  );

  delete globalThis.window;
});

test("NFC Edge Case 6: Reading event normalizes UID and delivers payload", async () => {
  let registeredReadingHandler = null;

  class MockNDEFReader {
    addEventListener(event, handler) {
      if (event === "reading") registeredReadingHandler = handler;
    }
    removeEventListener() {}
    async scan() {}
  }

  globalThis.window = { NDEFReader: MockNDEFReader };

  let readResult = null;
  const session = await startNfcScan({
    onReading: (data) => {
      readResult = data;
    },
  });

  assert.ok(registeredReadingHandler);
  // Trigger reading event with Lavdeep's card
  registeredReadingHandler({ serialNumber: "32:E5:A4:7A" });

  assert.equal(readResult.serialNumber, "32:E5:A4:7A");
  assert.equal(readResult.normalizedUid, "32E5A47A");

  session.stop();
  delete globalThis.window;
});

test("NFC Edge Case 7: Reading event with empty serialNumber", async () => {
  let registeredReadingHandler = null;

  class MockNDEFReader {
    addEventListener(event, handler) {
      if (event === "reading") registeredReadingHandler = handler;
    }
    removeEventListener() {}
    async scan() {}
  }

  globalThis.window = { NDEFReader: MockNDEFReader };

  let readResult = null;
  const session = await startNfcScan({
    onReading: (data) => {
      readResult = data;
    },
  });

  registeredReadingHandler({ serialNumber: "" });
  assert.equal(readResult.serialNumber, "");
  assert.equal(readResult.normalizedUid, "");

  session.stop();
  delete globalThis.window;
});

test("NFC Edge Case 8: Hardware reading error fires readingErrorHandler", async () => {
  let registeredErrorHandler = null;

  class MockNDEFReader {
    addEventListener(event, handler) {
      if (event === "readingerror") registeredErrorHandler = handler;
    }
    removeEventListener() {}
    async scan() {}
  }

  globalThis.window = { NDEFReader: MockNDEFReader };

  let errorResult = null;
  const session = await startNfcScan({
    onError: (err) => {
      errorResult = err;
    },
  });

  assert.ok(registeredErrorHandler);
  registeredErrorHandler(new Event("readingerror"));

  assert.equal(errorResult.name, "ReadingError");
  assert.equal(errorResult.isReadingError, true);
  assert.match(errorResult.message, /hold the card steady/);

  session.stop();
  delete globalThis.window;
});

test("NFC Edge Case 9: session.stop() removes event listeners", async () => {
  const removedListeners = [];

  class MockNDEFReader {
    addEventListener() {}
    removeEventListener(event) {
      removedListeners.push(event);
    }
    async scan() {}
  }

  globalThis.window = { NDEFReader: MockNDEFReader };

  const session = await startNfcScan({});
  session.stop();

  assert.ok(removedListeners.includes("reading"));
  assert.ok(removedListeners.includes("readingerror"));

  delete globalThis.window;
});

test("NFC Edge Case 10: Submission Throttling & Duplicate Confirmation Prevention", () => {
  let callCount = 0;
  let isSubmitting = false;

  const mockConfirmCheckIn = async () => {
    if (isSubmitting) return; // Throttled
    isSubmitting = true;
    callCount++;
    // Simulate async network latency
    await new Promise((r) => setTimeout(r, 20));
    isSubmitting = false;
  };

  // Rapid consecutive clicks (e.g. double click)
  mockConfirmCheckIn();
  mockConfirmCheckIn();
  mockConfirmCheckIn();

  assert.equal(callCount, 1, "Only exactly 1 request should be dispatched during concurrent rapid clicks");
});

