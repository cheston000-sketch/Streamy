import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const css = await readFile(new URL('../www/tellyvo.css', import.meta.url), 'utf8');
const tvBreakpoint = css.match(/@media \(min-width: 901px\) and \(max-width: 1100px\) \{([\s\S]*?)\n\}/);

assert.ok(tvBreakpoint, 'Expected a Fire TV density breakpoint');
assert.match(tvBreakpoint[1], /\.poster-card\s*\{[\s\S]*?flex-basis:\s*120px;[\s\S]*?height:\s*180px;/);
assert.match(tvBreakpoint[1], /\.row-posters\s*\{[\s\S]*?gap:\s*10px;[\s\S]*?padding:\s*18px 20px 22px;/);
assert.match(tvBreakpoint[1], /transform:\s*scale\(1\.06\)/);

const occupiedWidth = (7 * 120) + (6 * 10) + (2 * 20);
assert.ok(occupiedWidth <= 960, 'Seven cards should fit the Fire TV CSS viewport');

console.log('TV card density tests passed.');
