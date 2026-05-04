import { describe, it, expect, vi } from 'vitest';

// `@qvac/sdk` pulls in bare-runtime side-effects at import time which can't
// run under Node's native test environment. Vitest requires every named
// export the production code destructures to be enumerated explicitly, so we
// build the mock module from the union of constant names ModelConfig.ts
// imports.
vi.mock('@qvac/sdk', () => {
  const langs = [
    'AR', 'AZ', 'BE', 'BG', 'BN', 'BS', 'CA', 'CS', 'DA', 'DE', 'EL', 'ES',
    'ET', 'FA', 'FI', 'FR', 'GU', 'HE', 'HI', 'HR', 'HU', 'ID', 'IS', 'IT',
    'JA', 'KN', 'KO', 'LT', 'LV', 'ML', 'MS', 'MT', 'NB', 'NL', 'NN', 'PL',
    'PT', 'RO', 'RU', 'SK', 'SL', 'SQ', 'SR', 'SV', 'TA', 'TE', 'TR', 'UK',
    'VI', 'ZH',
  ];
  const out: Record<string, { src: string; modelId: string }> = {};
  const stub = (name: string) => ({ src: `mock://${name}`, modelId: name });
  for (const lang of langs) {
    // toEn always exists in the SDK registry; fromEn is missing for source-
    // only languages (be, bs, mt, nb, nn, sr, vi). We export both names
    // unconditionally — ModelConfig destructures both at module top, and
    // BERGAMOT_LANG_MAP picks fromEn = null for source-only langs.
    out[`BERGAMOT_${lang}_EN`] = stub(`BERGAMOT_${lang}_EN`);
    out[`BERGAMOT_EN_${lang}`] = stub(`BERGAMOT_EN_${lang}`);
  }
  const others = [
    'WHISPER_BASE_Q8_0', 'WHISPER_TINY_Q8_0', 'WHISPER_SMALL_Q8_0',
    'WHISPER_LARGE_V3_TURBO',
    'QWEN3_1_7B_INST_Q4', 'QWEN3_4B_INST_Q4_K_M',
    'TTS_SUPERTONIC2_OFFICIAL_TEXT_ENCODER_SUPERTONE_FP32',
    'TTS_SUPERTONIC2_OFFICIAL_DURATION_PREDICTOR_SUPERTONE_FP32',
    'TTS_SUPERTONIC2_OFFICIAL_VECTOR_ESTIMATOR_SUPERTONE_FP32',
    'TTS_SUPERTONIC2_OFFICIAL_VOCODER_SUPERTONE_FP32',
    'TTS_SUPERTONIC2_OFFICIAL_UNICODE_INDEXER_SUPERTONE_FP32',
    'TTS_SUPERTONIC2_OFFICIAL_TTS_CONFIG_SUPERTONE',
    'TTS_SUPERTONIC2_OFFICIAL_VOICE_STYLE_SUPERTONE',
    'PARAKEET_TDT_ENCODER_INT8', 'PARAKEET_TDT_DECODER_INT8',
    'PARAKEET_TDT_PREPROCESSOR_INT8', 'PARAKEET_TDT_ENCODER_FP32',
    'PARAKEET_TDT_ENCODER_DATA_FP32', 'PARAKEET_TDT_DECODER_FP32',
    'PARAKEET_TDT_PREPROCESSOR_FP32', 'PARAKEET_TDT_VOCAB',
  ];
  for (const name of others) out[name] = stub(name);
  return out;
});

import {
  resolveTranslatorPair,
  TRANSLATOR_PROFILES,
  BERGAMOT_SOURCE_LANGS,
  BERGAMOT_TARGET_LANGS,
} from '../ModelConfig';

describe('resolveTranslatorPair', () => {
  it('returns the direct profile when an EN<->X model exists', () => {
    const result = resolveTranslatorPair('en', 'it');
    expect(result.kind).toBe('direct');
    if (result.kind === 'direct') {
      expect(result.profile.from).toBe('en');
      expect(result.profile.to).toBe('it');
      expect(result.profile.id).toBe('en-it');
    }
  });

  it('returns the direct profile when an X->EN model exists', () => {
    const result = resolveTranslatorPair('it', 'en');
    expect(result.kind).toBe('direct');
    if (result.kind === 'direct') {
      expect(result.profile.id).toBe('it-en');
    }
  });

  it('pivots through English when no direct model exists', () => {
    const result = resolveTranslatorPair('it', 'de');
    expect(result.kind).toBe('pivot');
    if (result.kind === 'pivot') {
      expect(result.leg1.from).toBe('it');
      expect(result.leg1.to).toBe('en');
      expect(result.leg2.from).toBe('en');
      expect(result.leg2.to).toBe('de');
    }
  });

  it('returns unsupported for from === to', () => {
    expect(resolveTranslatorPair('en', 'en').kind).toBe('unsupported');
    expect(resolveTranslatorPair('it', 'it').kind).toBe('unsupported');
  });

  it.each(['be', 'bs', 'mt', 'nb', 'nn', 'sr', 'vi'])(
    'returns unsupported when target is %s (no EN->X model)',
    (target) => {
      // Direct hop EN -> target is missing for these languages, and pivot is
      // also unreachable because leg2 (en -> target) does not exist.
      expect(resolveTranslatorPair('en', target).kind).toBe('unsupported');
      expect(resolveTranslatorPair('it', target).kind).toBe('unsupported');
    },
  );

  it('treats languages with only X->EN as valid sources but invalid targets', () => {
    // be has toEn but no fromEn: usable as source, never as target.
    expect(resolveTranslatorPair('be', 'en').kind).toBe('direct');
    expect(resolveTranslatorPair('be', 'it').kind).toBe('pivot');
    expect(resolveTranslatorPair('en', 'be').kind).toBe('unsupported');
  });
});

describe('Bergamot language catalogs', () => {
  it('lists English plus every mapped language as a source', () => {
    expect(BERGAMOT_SOURCE_LANGS).toContain('en');
    expect(BERGAMOT_SOURCE_LANGS).toContain('it');
    expect(BERGAMOT_SOURCE_LANGS).toContain('be');
    expect(BERGAMOT_SOURCE_LANGS).toContain('vi');
  });

  it('omits source-only languages from valid targets', () => {
    expect(BERGAMOT_TARGET_LANGS).toContain('en');
    expect(BERGAMOT_TARGET_LANGS).toContain('it');
    expect(BERGAMOT_TARGET_LANGS).not.toContain('be');
    expect(BERGAMOT_TARGET_LANGS).not.toContain('vi');
    expect(BERGAMOT_TARGET_LANGS).not.toContain('mt');
  });

  it('exposes both directions in TRANSLATOR_PROFILES for symmetric pairs', () => {
    expect(TRANSLATOR_PROFILES['en-it']).toBeDefined();
    expect(TRANSLATOR_PROFILES['it-en']).toBeDefined();
  });

  it('only exposes the X->EN direction for source-only languages', () => {
    expect(TRANSLATOR_PROFILES['be-en']).toBeDefined();
    expect(TRANSLATOR_PROFILES['en-be']).toBeUndefined();
  });
});
