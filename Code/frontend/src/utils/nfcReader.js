/**
 * Reusable Web NFC Reader Utility for CampusCare (Phase NFC-4)
 *
 * Provides a resilient, cancellation-aware interface for scanning NFC/RFID
 * physical student cards on supported Web NFC environments (e.g. Android Chrome).
 */

/**
 * Checks whether the current browser supports the Web NFC NDEFReader API.
 * @returns {boolean}
 */
export function isWebNfcSupported() {
  return typeof window !== "undefined" && "NDEFReader" in window;
}

/**
 * Consistently normalizes a raw UID:
 * - Trims whitespace
 * - Strips separators (':', '-', ' ')
 * - Converts to uppercase hexadecimal
 *
 * Example: '04:a2:b3:c4:d5:e6:f7' -> '04A2B3C4D5E6F7'
 *
 * @param {string} raw
 * @returns {string}
 */
export function normalizeUid(raw) {
  if (!raw) return "";
  return String(raw).trim().replace(/[:\-\s]/g, "").toUpperCase();
}

/**
 * Starts an NFC scan session.
 *
 * @param {Object} options
 * @param {(data: { serialNumber: string, normalizedUid: string, rawEvent: any }) => void} options.onReading
 * @param {(error: Error & { isUnsupported?: boolean, isPermissionDenied?: boolean, isReadingError?: boolean }) => void} [options.onError]
 * @param {AbortSignal} [options.signal] - External AbortSignal to cancel the scan
 * @returns {Promise<{ stop: () => void }>}
 */
export async function startNfcScan({ onReading, onError, signal } = {}) {
  if (!isWebNfcSupported()) {
    const err = new Error(
      "Web NFC is not supported in this browser environment. Web NFC requires Chrome on Android with HTTPS. On desktop counters, use a standard USB RFID reader."
    );
    err.name = "NotSupportedError";
    err.isUnsupported = true;
    if (onError) onError(err);
    throw err;
  }

  const ndef = new window.NDEFReader();
  const internalController = new AbortController();

  const handleExternalAbort = () => {
    internalController.abort();
  };

  if (signal) {
    if (signal.aborted) {
      const err = new Error("Scan request was cancelled prior to starting.");
      err.name = "AbortError";
      throw err;
    }
    signal.addEventListener("abort", handleExternalAbort, { once: true });
  }

  const readingHandler = (event) => {
    const serialNumber = event.serialNumber || "";
    const normalizedUid = normalizeUid(serialNumber);

    if (onReading) {
      onReading({
        serialNumber,
        normalizedUid,
        rawEvent: event,
      });
    }
  };

  const readingErrorHandler = (event) => {
    const err = new Error("NFC reading error. Please hold the card steady and tap again.");
    err.name = "ReadingError";
    err.isReadingError = true;
    if (onError) onError(err);
  };

  ndef.addEventListener("reading", readingHandler);
  ndef.addEventListener("readingerror", readingErrorHandler);

  try {
    await ndef.scan({ signal: internalController.signal });
  } catch (scanErr) {
    if (signal) signal.removeEventListener("abort", handleExternalAbort);
    ndef.removeEventListener("reading", readingHandler);
    ndef.removeEventListener("readingerror", readingErrorHandler);

    if (scanErr.name === "NotAllowedError") {
      scanErr.message = "NFC permission denied. Please allow NFC access in your browser or device settings.";
      scanErr.isPermissionDenied = true;
    } else if (scanErr.name === "NotSupportedError") {
      scanErr.message = "NFC feature is disabled or unavailable on this device.";
      scanErr.isUnsupported = true;
    }

    if (onError) onError(scanErr);
    throw scanErr;
  }

  const stop = () => {
    try {
      internalController.abort();
    } catch (_) {}
    if (signal) signal.removeEventListener("abort", handleExternalAbort);
    ndef.removeEventListener("reading", readingHandler);
    ndef.removeEventListener("readingerror", readingErrorHandler);
  };

  return { stop };
}

