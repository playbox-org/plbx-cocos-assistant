import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// Text-level guards for the "plbx events" preview UI section — every network
// shows the calls the game makes on the plbx_html bridge (kit 0.3.16 emits
// `plbx:preview` / `plbx_call`). No jsdom: preview.js/index.html are static
// assets served by src/core/preview/server.ts, not modules — assert their
// text content directly, same approach the platform's preview-harness test
// uses to guard its markup.

const previewJs = readFileSync(join(__dirname, '../../static/preview/preview.js'), 'utf8');
const indexHtml = readFileSync(join(__dirname, '../../static/preview/index.html'), 'utf8');

describe('preview.js — plbx events', () => {
  it('handles the plbx_call event', () => {
    expect(previewJs).toContain("case 'plbx_call':");
  });

  it('defines a renderPlbxEvents function', () => {
    expect(previewJs).toMatch(/function renderPlbxEvents\s*\(/);
  });

  it('renders methods in the fixed spec order', () => {
    expect(previewJs).toContain(
      "['game_ready', 'tap', 'download', 'game_end', 'game_retry', 'expose', 'log_event', 'report']"
    );
  });
});

describe('index.html — plbx events markup', () => {
  it('has the plbx-section container and its children', () => {
    expect(indexHtml).toContain('id="plbx-section"');
    expect(indexHtml).toContain('id="plbx-events"');
    expect(indexHtml).toContain('id="plbx-empty"');
  });

  it('places plbx-section before axon-section, so it renders first on every network', () => {
    const plbxIdx = indexHtml.indexOf('id="plbx-section"');
    const axonIdx = indexHtml.indexOf('id="axon-section"');
    expect(plbxIdx).toBeGreaterThan(-1);
    expect(axonIdx).toBeGreaterThan(-1);
    expect(plbxIdx).toBeLessThan(axonIdx);
  });
});
