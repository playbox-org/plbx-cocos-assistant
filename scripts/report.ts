/**
 * Standalone build report tool — runs without Cocos Creator.
 *
 * Usage:
 *   npx tsx scripts/report.ts <buildDir> [projectAssetsDir]
 *
 * Example:
 *   npx tsx scripts/report.ts \
 *     /path/to/project/build/web-mobile \
 *     /path/to/project/assets
 */

import { scanBuildDirectory } from '../src/core/build-report/build-scanner';
import { existsSync, readFileSync, statSync, readdirSync } from 'fs';
import { join, extname, relative, basename } from 'path';

// ── helpers ──────────────────────────────────────────────────────────────────

function fmt(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

function pad(s: string, n: number): string {
  return s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length);
}

// ── project asset scanning (reads .meta files) ────────────────────────────────

interface ProjectAsset {
  uuid: string;
  name: string;
  relativePath: string;
  sourceSize: number;
  importer: string;
}

function scanProjectAssets(assetsDir: string): ProjectAsset[] {
  const result: ProjectAsset[] = [];

  function walk(dir: string) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      // Only process .meta files (skip .meta for directories and sub-assets)
      if (!entry.name.endsWith('.meta')) continue;

      const assetPath = full.slice(0, -5); // strip .meta
      if (!existsSync(assetPath)) continue; // directory meta, skip

      try {
        const meta = JSON.parse(readFileSync(full, 'utf8'));
        if (!meta.uuid || meta.importer === 'directory') continue;

        result.push({
          uuid: meta.uuid,
          name: basename(assetPath),
          relativePath: relative(assetsDir, assetPath),
          sourceSize: statSync(assetPath).size,
          importer: meta.importer || 'unknown',
        });
      } catch {
        // skip unreadable metas
      }
    }
  }

  walk(assetsDir);
  return result;
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main() {
  const buildDir = process.argv[2];
  const assetsDir = process.argv[3];

  if (!buildDir) {
    console.error('Usage: npx tsx scripts/report.ts <buildDir> [projectAssetsDir]');
    console.error('');
    console.error('Example:');
    console.error('  npx tsx scripts/report.ts \\');
    console.error('    /path/to/project/build/web-mobile \\');
    console.error('    /path/to/project/assets');
    process.exit(1);
  }

  // ── scan build ──────────────────────────────────────────────────────────────
  console.log(`\n📦 Scanning build: ${buildDir}\n`);
  const buildScan = await scanBuildDirectory(buildDir);

  if (!buildScan) {
    console.error('❌ Build directory not found or missing src/settings.json');
    process.exit(1);
  }

  console.log(`Build timestamp : ${new Date(buildScan.buildTimestamp).toLocaleString()}`);
  console.log(`Total build size: ${fmt(buildScan.totalBuildSize)}`);
  const cats = buildScan.categories;
  console.log(`  └ Engine (cc.js) : ${fmt(cats.engine)}`);
  if (cats.plugins > 0)
    console.log(`  └ Plugins        : ${fmt(cats.plugins)}`);
  console.log(`  └ Assets         : ${fmt(cats.assets)}`);
  console.log(`    └ (pack files) : ${fmt(buildScan.packFileSize)}`);
  if (cats.scripts > 0)
    console.log(`  └ Scripts        : ${fmt(cats.scripts)}`);
  if (cats.other > 0)
    console.log(`  └ Other          : ${fmt(cats.other)}`);

  if (buildScan.packedHtmls.length > 0) {
    console.log('\n── Packed HTML per network ─────────────────────────────────────────────────');
    for (const h of buildScan.packedHtmls) {
      const warning = h.size > 5 * 1024 * 1024 ? ' ⚠ OVER 5MB' : '';
      console.log(`  ${pad(fmt(h.size), 10)} ${h.network}${warning}`);
    }
  }
  console.log(`Unique UUIDs    : ${buildScan.assetMap.size}`);
  console.log(`Bundled UUIDs   : ${buildScan.bundledUuids.size}`);

  // ── top build assets ────────────────────────────────────────────────────────
  const topBuild = [...buildScan.assetMap.entries()]
    .sort((a, b) => b[1].actualSize - a[1].actualSize)
    .slice(0, 20);

  console.log('\n── Top 20 assets in build (by size) ────────────────────────────────────────');
  console.log(pad('Size', 12) + pad('UUID', 38) + 'Path(s)');
  console.log('─'.repeat(100));
  for (const [uuid, data] of topBuild) {
    const paths = data.buildPaths.map(p => p.replace(/^(native|import)\/[0-9a-f]{2}\//, '')).join(', ');
    console.log(pad(fmt(data.actualSize), 12) + pad(uuid, 38) + paths);
  }

  // ── project asset matching (if assetsDir given) ──────────────────────────────
  if (!assetsDir) {
    console.log('\n💡 Pass projectAssetsDir as second argument to see source↔build matching.');
    return;
  }

  if (!existsSync(assetsDir)) {
    console.error(`\n❌ Assets directory not found: ${assetsDir}`);
    return;
  }

  console.log(`\n🗂  Scanning project assets: ${assetsDir}`);
  const projectAssets = scanProjectAssets(assetsDir);
  console.log(`Found ${projectAssets.length} project assets\n`);

  // Merge: match project assets against build scan
  type Status = 'confirmed' | 'bundled' | 'unused';

  const merged = projectAssets.map(a => {
    const buildData = buildScan.assetMap.get(a.uuid);
    const inBundle = buildScan.bundledUuids.has(a.uuid);
    const status: Status = buildData ? 'confirmed' : inBundle ? 'bundled' : 'unused';
    return {
      ...a,
      actualBuildSize: buildData?.actualSize,
      buildPaths: buildData?.buildPaths ?? [],
      status,
    };
  });

  const confirmed = merged.filter(a => a.status === 'confirmed');
  const bundled = merged.filter(a => a.status === 'bundled');
  const unused = merged.filter(a => a.status === 'unused');

  const totalSource = merged.reduce((s, a) => s + a.sourceSize, 0);
  const totalActual = confirmed.reduce((s, a) => s + (a.actualBuildSize ?? 0), 0);

  console.log('── Summary ──────────────────────────────────────────────────────────────────');
  console.log(`Total assets     : ${merged.length}`);
  console.log(`  ✓ confirmed    : ${confirmed.length}  (native files matched)`);
  console.log(`  ~ bundled only : ${bundled.length}  (in config.json but no native file)`);
  console.log(`  ○ unused       : ${unused.length}  (not in build)`);
  console.log(`Source total     : ${fmt(totalSource)}`);
  console.log(`Actual build     : ${fmt(totalActual)}  (confirmed native files only)`);

  // Top confirmed assets
  const topConfirmed = confirmed
    .sort((a, b) => (b.actualBuildSize ?? 0) - (a.actualBuildSize ?? 0))
    .slice(0, 30);

  console.log('\n── Top 30 confirmed assets (source → actual build) ─────────────────────────');
  console.log(pad('Source', 12) + pad('Build', 12) + pad('Ratio', 8) + pad('Importer', 16) + 'Name');
  console.log('─'.repeat(100));
  for (const a of topConfirmed) {
    const ratio = a.actualBuildSize ? (a.actualBuildSize / a.sourceSize).toFixed(2) : '—';
    console.log(
      pad(fmt(a.sourceSize), 12) +
      pad(fmt(a.actualBuildSize ?? 0), 12) +
      pad(`×${ratio}`, 8) +
      pad(a.importer, 16) +
      a.name
    );
  }

  if (unused.length > 0) {
    console.log(`\n── Unused assets (not in build) — top 20 by source size ────────────────────`);
    const topUnused = unused.sort((a, b) => b.sourceSize - a.sourceSize).slice(0, 20);
    for (const a of topUnused) {
      console.log(`  ${pad(fmt(a.sourceSize), 10)} ${a.relativePath}`);
    }
  }
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
