import assert from 'node:assert/strict';
import { buildVisualGridRows, findGridTarget } from '../www/js/grid-navigation.js';

function cell(id, left, top, width = 120, height = 180) {
    return {
        id,
        getBoundingClientRect() {
            return { left, top, width, height };
        }
    };
}

const cells = [
    cell('a', 0, -5, 130, 194),
    cell('b', 134, 0),
    cell('c', 268, 0),
    cell('d', 0, 194),
    cell('e', 134, 194),
    cell('f', 268, 194),
    cell('g', 0, 388),
    cell('h', 134, 388)
];

assert.deepEqual(
    buildVisualGridRows(cells).map(row => row.map(item => item.id)),
    [['a', 'b', 'c'], ['d', 'e', 'f'], ['g', 'h']]
);
assert.equal(findGridTarget(cells, cells[0], 'right').target, cells[1]);
assert.equal(findGridTarget(cells, cells[2], 'right').boundary, 'side');
assert.equal(findGridTarget(cells, cells[2], 'down').target, cells[5]);
assert.equal(findGridTarget(cells, cells[5], 'down').target, cells[7]);
assert.equal(findGridTarget(cells, cells[7], 'down').boundary, 'bottom');
assert.equal(findGridTarget(cells, cells[1], 'up').boundary, 'top');

console.log('Grid navigation tests passed.');
