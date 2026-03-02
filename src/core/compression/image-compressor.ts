import sharp from 'sharp';
import { statSync } from 'fs';
import { join, basename, extname, dirname } from 'path';
import { CompressionOptions, CompressionResult, ImageMetadata } from './types';

export async function compressImage(
  inputPath: string,
  options: CompressionOptions,
  outputDir?: string,
): Promise<CompressionResult> {
  const inputSize = statSync(inputPath).size;

  const inputBasename = basename(inputPath, extname(inputPath));
  const outputExt = options.format === 'jpeg' ? '.jpeg' : `.${options.format}`;
  const outputFilename = `${inputBasename}${outputExt}`;
  const outputDirectory = outputDir ?? dirname(inputPath);
  const outputPath = join(outputDirectory, outputFilename);

  let pipeline = sharp(inputPath);

  if (options.resize) {
    pipeline = pipeline.resize({
      width: options.resize.width,
      height: options.resize.height,
      fit: options.resize.fit,
    });
  }

  switch (options.format) {
    case 'webp':
      pipeline = pipeline.webp({ quality: options.quality });
      break;
    case 'avif':
      pipeline = pipeline.avif({ quality: options.quality });
      break;
    case 'jpeg':
      pipeline = pipeline.jpeg({ quality: options.quality });
      break;
    case 'png':
      // sharp png quality maps to compressionLevel 0-9 (inverted: quality 100 = level 0)
      pipeline = pipeline.png({ compressionLevel: Math.round((100 - options.quality) / 11) });
      break;
  }

  await pipeline.toFile(outputPath);

  const outputSize = statSync(outputPath).size;
  const savings = ((inputSize - outputSize) / inputSize) * 100;

  return {
    inputPath,
    outputPath,
    inputSize,
    outputSize,
    format: options.format,
    quality: options.quality,
    savings,
  };
}

export async function getImageMetadata(inputPath: string): Promise<ImageMetadata> {
  const meta = await sharp(inputPath).metadata();
  const size = statSync(inputPath).size;

  return {
    width: meta.width ?? 0,
    height: meta.height ?? 0,
    format: meta.format ?? 'unknown',
    size,
    channels: meta.channels ?? 0,
  };
}

export async function compressImageToBuffer(
  inputPath: string,
  options: CompressionOptions,
): Promise<{ buffer: Buffer; metadata: CompressionResult }> {
  const inputSize = statSync(inputPath).size;

  let pipeline = sharp(inputPath);

  if (options.resize) {
    pipeline = pipeline.resize({
      width: options.resize.width,
      height: options.resize.height,
      fit: options.resize.fit,
    });
  }

  switch (options.format) {
    case 'webp':
      pipeline = pipeline.webp({ quality: options.quality });
      break;
    case 'avif':
      pipeline = pipeline.avif({ quality: options.quality });
      break;
    case 'jpeg':
      pipeline = pipeline.jpeg({ quality: options.quality });
      break;
    case 'png':
      pipeline = pipeline.png({ compressionLevel: Math.round((100 - options.quality) / 11) });
      break;
  }

  const buffer = await pipeline.toBuffer();
  const outputSize = buffer.length;
  const savings = ((inputSize - outputSize) / inputSize) * 100;

  const metadata: CompressionResult = {
    inputPath,
    outputPath: '',
    inputSize,
    outputSize,
    format: options.format,
    quality: options.quality,
    savings,
  };

  return { buffer, metadata };
}
