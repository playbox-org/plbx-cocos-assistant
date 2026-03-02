import { CompressionOptions } from './types';

export const PRESETS: Record<string, Omit<CompressionOptions, 'format'>> = {
  WEB_OPTIMIZED: { quality: 75 },
  MAX_QUALITY: { quality: 95 },
  FAST: { quality: 60 },
  HIGH_COMPRESSION: { quality: 40 },
};
