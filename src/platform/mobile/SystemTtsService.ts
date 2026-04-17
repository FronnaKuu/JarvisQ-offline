// ---- System TTS Service (Android/iOS native) ----------------------------
// Uses the device's native TTS engine through expo-speech. On Android this
// is Google TTS by default (or whatever the user has selected in system
// settings), on iOS it is AVSpeechSynthesizer. The engine runs in a
// separate native thread and plays audio directly, so it cannot stall the
// JS thread the way PCM-streaming engines (Supertonic) do.

import * as Speech from 'expo-speech';
import type { IAudioPlayer } from '@core/ports/IAudioPlayer';
import type { ITtsService, TtsRuntimeOptions } from '@core/inference/types';

class SystemTtsServiceClass implements ITtsService {
  private _isLoaded = true;
  private active = false;
  /** Empty string ⇒ use device default locale. */
  private language = '';

  get isLoaded(): boolean {
    return this._isLoaded;
  }

  /**
   * Initializes the engine. System TTS has nothing to download, so this is
   * essentially configuration only — exposed to keep the bootstrap symmetric
   * with network engines.
   */
  configure(options: { language?: string }): void {
    if (options.language) this.language = options.language;
  }

  async speak(
    text: string,
    _audioPlayer: IAudioPlayer,
    options?: TtsRuntimeOptions,
  ): Promise<void> {
    if (!text.trim()) return;
    // When no language override is provided, omit the field entirely so
    // expo-speech falls back to the device's default TTS locale.
    const lang = (options?.language ?? this.language).trim();
    this.active = true;
    return new Promise<void>((resolve, reject) => {
      Speech.speak(text, {
        ...(lang ? { language: lang } : {}),
        rate: options?.speed ?? 1,
        pitch: options?.pitch ?? 1,
        onDone: () => {
          this.active = false;
          resolve();
        },
        onStopped: () => {
          this.active = false;
          resolve();
        },
        onError: (err) => {
          this.active = false;
          reject(err instanceof Error ? err : new Error(String(err)));
        },
      });
    });
  }

  async stop(): Promise<void> {
    if (!this.active) return;
    this.active = false;
    await Speech.stop().catch(() => {});
  }
}

export const SystemTtsService = new SystemTtsServiceClass();
