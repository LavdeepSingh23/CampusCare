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
 * Returns comprehensive diagnostic status of NFC environment on this device.
 * Helps detect insecure HTTP contexts over Wi-Fi, missing hardware, or permission state.
 *
 * @returns {{
 *   supported: boolean,
 *   isSecureContext: boolean,
 *   hasNdefReader: boolean,
 *   isLocalhost: boolean,
 *   protocol: string,
 *   message: string,
 *   httpsUrl: string | null
 * }}
 */
export function getNfcEnvironmentStatus() {
  if (typeof window === "undefined") {
    return {
      supported: false,
      isSecureContext: false,
      hasNdefReader: false,
      isLocalhost: false,
      protocol: "unknown",
      message: "Browser window is not available.",
      httpsUrl: null,
    };
  }

  const hasNdefReader = "NDEFReader" in window;
  const isSecure = window.isSecureContext === true;
  const isLocalhost =
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1" ||
    window.location.hostname === "::1";
  const protocol = window.location.protocol;
  const httpsUrl =
    protocol !== "https:"
      ? `https://${window.location.host}${window.location.pathname}${window.location.search}`
      : null;

  if (hasNdefReader) {
    return {
      supported: true,
      isSecureContext: isSecure,
      hasNdefReader: true,
      isLocalhost,
      protocol,
      message: "Web NFC is natively supported and ready on this device.",
      httpsUrl: null,
    };
  }

  if (!isSecure && protocol !== "https:" && !isLocalhost) {
    return {
      supported: false,
      isSecureContext: false,
      hasNdefReader: false,
      isLocalhost,
      protocol,
      message:
        "Web NFC requires a Secure Context (HTTPS). When opening over Wi-Fi, you must use https://. Android Chrome completely blocks NFC hardware over plain http://.",
      httpsUrl,
    };
  }

  return {
    supported: false,
    isSecureContext: isSecure,
    hasNdefReader: false,
    isLocalhost,
    protocol,
    message:
      "Web NFC (NDEFReader) is not supported in this browser. Please use Google Chrome on an Android device with NFC enabled.",
    httpsUrl: null,
  };
}

/**
 * Plays a contactless POS / RFID card tap audio tone using Web Audio API.
 * Provides physical, tactile-like confirmation without requiring external audio files.
 *
 * @param {"success" | "error" | "arm"} type
 */
export function playNfcBeep(type = "success") {
  if (typeof window === "undefined") return;
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();

    if (type === "success") {
      // 2-tone melodic contactless chime (1760Hz -> 2640Hz)
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(1760, now);
      osc.frequency.setValueAtTime(2640, now + 0.08);

      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.25);
    } else if (type === "arm") {
      // Short rising blip when reader arms
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.exponentialRampToValueAtTime(1320, now + 0.12);

      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.12);
    } else {
      // Low buzz for errors or unregistered cards
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(260, now);

      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.35);
    }
  } catch (_) {
    // Non-blocking if audio context is restricted
  }
}

/**
 * Triggers haptic vibration feedback on mobile devices.
 *
 * @param {"success" | "error"} type
 */
export function triggerNfcHaptic(type = "success") {
  if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
    try {
      if (type === "success") {
        navigator.vibrate([60, 40, 60]);
      } else {
        navigator.vibrate([180, 80, 180]);
      }
    } catch (_) {}
  }
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
 * @param {(data: { serialNumber: string, normalizedUid: string, rawText?: string, rawEvent: any }) => void} options.onReading
 * @param {(error: Error & { isUnsupported?: boolean, isPermissionDenied?: boolean, isReadingError?: boolean }) => void} [options.onError]
 * @param {AbortSignal} [options.signal] - External AbortSignal to cancel the scan
 * @returns {Promise<{ stop: () => void }>}
 */
export async function startNfcScan({ onReading, onError, signal } = {}) {
  if (!isWebNfcSupported()) {
    const env = getNfcEnvironmentStatus();
    const err = new Error(
      env.message ||
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
    let serialNumber = event.serialNumber || "";
    let rawText = "";

    // Inspect NDEF records in case student roll number or UID is encoded in payload
    if (event.message && Array.isArray(event.message.records)) {
      for (const record of event.message.records) {
        try {
          if (record.recordType === "text") {
            const textDecoder = new TextDecoder(record.encoding || "utf-8");
            const decoded = textDecoder.decode(record.data);
            if (decoded && !rawText) {
              rawText = decoded.trim();
            }
          }
        } catch (_) {}
      }
    }

    // Determine primary identifier: hardware serialNumber preferred, fallback to NDEF text record
    const identifier = serialNumber || rawText;
    const normalizedUid = normalizeUid(identifier);

    // Audio and haptic feedback
    playNfcBeep("success");
    triggerNfcHaptic("success");

    if (onReading) {
      onReading({
        serialNumber,
        normalizedUid,
        rawText,
        rawEvent: event,
      });
    }
  };

  const readingErrorHandler = (event) => {
    playNfcBeep("error");
    triggerNfcHaptic("error");
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


