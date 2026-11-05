#!/usr/bin/env node
// Regenerates firestore.indexes.json from scripts/query-manifest.mjs.   Usage: npm run indexes
import { writeFile } from 'node:fs/promises';
import { buildIndexFile } from './query-manifest.mjs';
const out = buildIndexFile();
await writeFile(new URL('../firestore.indexes.json', import.meta.url), JSON.stringify(out, null, 2) + '\n');
console.log(`firestore.indexes.json written: ${out.indexes.length} composite indexes, ${out.fieldOverrides.length} collection-group field overrides.`);
