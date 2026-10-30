import assert from 'node:assert/strict';

let focused;
const items = [];
const group = { querySelectorAll: () => items };
const modal = { querySelectorAll: () => [...items, avatar] };
function element(id, left, top, width, height, inGroup = true) {
    return {
        id, offsetParent: {}, disabled: false, dataset: {},
        getBoundingClientRect: () => ({ left, top, width, height }),
        closest(selector) {
            if (inGroup && selector.includes('.profile-edit-actions')) return group;
            return null;
        },
        focus() { focused = this; document.activeElement = this; }
    };
}
const save = element('save', 540, 840, 420, 96);
const cancel = element('cancel', 990, 840, 390, 96);
const avatar = element('avatar', 845, 500, 120, 130, false);
items.push(save, cancel);
globalThis.window = { getComputedStyle: () => ({ display: 'block', visibility: 'visible' }) };
globalThis.document = {
    body: {}, activeElement: save,
    addEventListener() {}, contains: () => true,
    querySelector(selector) { return selector === '#profile-edit-modal:not(.hidden)' ? modal : null; },
    querySelectorAll: () => [], getElementById: () => null
};
const { NavigationManager } = await import('../www/js/navigation.js');
let prevented = false;
NavigationManager.handleDpad({ key: 'ArrowRight', preventDefault() { prevented = true; } });
assert.equal(focused, cancel, 'Right from Save must reach Cancel, not a nearby avatar');
assert.equal(prevented, true);
NavigationManager.handleDpad({ key: 'ArrowLeft', preventDefault() {} });
assert.equal(focused, save, 'Left from Cancel returns to Save');
console.log('Profile dialog remote navigation tests passed.');
