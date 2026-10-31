import assert from 'node:assert/strict';

let focused;
let groupSelector = ".profile-edit-actions";
const items = [];
const group = { querySelectorAll: () => items };
const modal = { querySelectorAll: () => [...items, avatar] };
function element(id, left, top, width, height, inGroup = true) {
    return {
        id, offsetParent: {}, disabled: false, dataset: {},
        getBoundingClientRect: () => ({ left, top, width, height }),
        closest(selector) {
            if (inGroup && selector.includes(groupSelector)) return group;
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
groupSelector = '.settings-action-row';
const refresh = element('refresh', 80, 970, 830, 110);
const copy = element('copy', 935, 970, 780, 110);
items.splice(0, items.length, refresh, copy);
refresh.focus();
NavigationManager.handleDpad({ key: 'ArrowRight', preventDefault() {} });
assert.equal(focused, copy, 'Right from Refresh must reach Copy, not a distant menu item');
NavigationManager.handleDpad({ key: 'ArrowLeft', preventDefault() {} });
assert.equal(focused, refresh, 'Left from Copy returns to Refresh');
groupSelector = '.parent-pin-actions';
const proceed = element('continue', 590, 900, 360, 90);
const dismiss = element('cancel', 970, 900, 360, 90);
items.splice(0, items.length, proceed, dismiss);
proceed.focus();
NavigationManager.handleDpad({ key: 'ArrowRight', preventDefault() {} });
assert.equal(focused, dismiss, 'Right from Continue must reach Cancel, not the PIN keypad');
NavigationManager.handleDpad({ key: 'ArrowLeft', preventDefault() {} });
assert.equal(focused, proceed);
console.log('Profile, settings, and PIN remote navigation tests passed.');
