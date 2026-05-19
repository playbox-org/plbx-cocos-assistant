'use strict';
const path = require('path');
const sharp = require(path.join(__dirname, 'node_modules', 'sharp'));
const { statSync, renameSync } = require('fs');
let input = '';
process.stdin.setEncoding('utf-8');
process.stdin.on('data', d => { input += d; });
process.stdin.on('end', async () => {
  try {
    const cmd = JSON.parse(input);
    if (cmd.type === 'metadata') {
      const meta = await sharp(cmd.inputPath).metadata();
      const size = statSync(cmd.inputPath).size;
      respond({ width: meta.width || 0, height: meta.height || 0, format: meta.format || 'unknown', size, channels: meta.channels || 0 });
    } else if (cmd.type === 'compress') {
      const { inputPath, options, outputDir } = cmd;
      const inputSize = statSync(inputPath).size;
      const ext = options.format === 'jpeg' ? '.jpeg' : '.' + options.format;
      const outputFilename = path.basename(inputPath, path.extname(inputPath)) + ext;
      const outputDirectory = outputDir || path.dirname(inputPath);
      const outputPath = path.join(outputDirectory, outputFilename);
      const sameFile = outputPath === inputPath;
      const writePath = sameFile ? outputPath + '.tmp' : outputPath;
      await buildPipeline(sharp(inputPath), options).toFile(writePath);
      if (sameFile) renameSync(writePath, outputPath);
      const outputSize = statSync(outputPath).size;
      respond({ inputPath, outputPath, inputSize, outputSize, format: options.format, quality: options.quality, savings: ((inputSize - outputSize) / inputSize) * 100 });
    } else if (cmd.type === 'compressToBuffer') {
      const { inputPath, options } = cmd;
      const inputSize = statSync(inputPath).size;
      const buffer = await buildPipeline(sharp(inputPath), options).toBuffer();
      const outputSize = buffer.length;
      respond({ bufferBase64: buffer.toString('base64'), metadata: { inputPath, outputPath: '', inputSize, outputSize, format: options.format, quality: options.quality, savings: ((inputSize - outputSize) / inputSize) * 100 } });
    } else { throw new Error('Unknown command: ' + cmd.type); }
  } catch (e) { process.stderr.write(e.message + '\n'); process.exit(1); }
});
function respond(result) { process.stdout.write(JSON.stringify(result)); }
function buildPipeline(pipeline, options) {
  if (options.resize) pipeline = pipeline.resize({ width: options.resize.width, height: options.resize.height, fit: options.resize.fit });
  switch (options.format) {
    case 'webp': return pipeline.webp({ quality: options.quality });
    case 'avif': return pipeline.avif({ quality: options.quality });
    case 'jpeg': return pipeline.jpeg({ quality: options.quality });
    case 'png':  return pipeline.png({ compressionLevel: Math.round((100 - options.quality) / 11) });
    default:     return pipeline;
  }
}
