export interface CompressionOptions {
  format: 'png' | 'webp' | 'avif' | 'jpeg';
  quality: number; // 0-100
  resize?: {
    width?: number;
    height?: number;
    fit?: 'cover' | 'contain' | 'fill' | 'inside' | 'outside';
  };
}

export interface CompressionResult {
  inputPath: string;
  outputPath: string;
  inputSize: number;
  outputSize: number;
  format: string;
  quality: number;
  savings: number; // percentage 0-100
}

export interface ImageMetadata {
  width: number;
  height: number;
  format: string;
  size: number;
  channels: number;
}
