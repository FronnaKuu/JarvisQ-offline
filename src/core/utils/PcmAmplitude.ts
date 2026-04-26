// ---- PCM Amplitude Helper ------------------------------------------------
// Computes the RMS level of a 16-bit little-endian PCM chunk in dBFS. The
// dictation pipeline needs this because the parakeet streaming addon shipped
// in node_modules does not yet emit mid-segment partials — without partials
// there is no JS-visible signal that the user is still speaking between
// VAD-final segments. The PCM chunk stream itself is the only continuous
// voice-activity proxy we have.

const INT16_MAX = 32_768;
// Floor so a fully silent chunk maps to a finite, very-low dBFS rather than
// -Infinity. Mirrors the convention expo-av's metering uses for empty audio.
const SILENCE_FLOOR_DB = -160;

export function dbFsFromPcm16(chunk: Uint8Array): number {
  const samples = chunk.byteLength >>> 1;
  if (samples === 0) return SILENCE_FLOOR_DB;
  const view = new DataView(
    chunk.buffer,
    chunk.byteOffset,
    samples * 2,
  );
  let sumSquares = 0;
  for (let i = 0; i < samples; i++) {
    const s = view.getInt16(i * 2, true) / INT16_MAX;
    sumSquares += s * s;
  }
  const rms = Math.sqrt(sumSquares / samples);
  if (rms <= 0) return SILENCE_FLOOR_DB;
  return 20 * Math.log10(rms);
}
