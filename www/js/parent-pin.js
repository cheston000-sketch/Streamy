// The PIN is a local parental control, not an account credential. Store a
// salted slow hash rather than the PIN itself and fail closed on corrupt data.
export const PARENT_PIN_KEY = 'tellyvo_parent_pin_v1';
export const PARENT_PIN_ATTEMPTS_KEY = 'tellyvo_parent_pin_attempts_v1';
const ITERATIONS = 150000;
const MAX_FAILURES = 5;
const LOCK_MS = 60000;
const toBase64 = bytes => btoa(String.fromCharCode(...bytes));
const fromBase64 = text => Uint8Array.from(atob(text), char => char.charCodeAt(0));

export function hasParentPin(storage = globalThis.localStorage) {
    return storage.getItem(PARENT_PIN_KEY) !== null;
}

export function isValidParentPin(pin) { return /^\d{4,6}$/.test(String(pin || '')); }

async function derive(pin, salt, iterations = ITERATIONS) {
    if (!globalThis.crypto?.subtle || !globalThis.crypto?.getRandomValues) throw new Error('PIN protection is unavailable on this device.');
    const key = await globalThis.crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
    return new Uint8Array(await globalThis.crypto.subtle.deriveBits({name:'PBKDF2', hash:'SHA-256', salt, iterations}, key, 256));
}

export async function setParentPin(pin, storage = globalThis.localStorage, options = {}) {
    if (!isValidParentPin(pin)) throw new Error('Enter a PIN with 4 to 6 digits.');
    if (!globalThis.crypto?.subtle || !globalThis.crypto?.getRandomValues) throw new Error('PIN protection is unavailable on this device.');
    const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
    const hash = await derive(pin, salt);
    if (options.shouldCommit && !options.shouldCommit()) return false;
    storage.setItem(PARENT_PIN_KEY, JSON.stringify({version:1, iterations:ITERATIONS, salt:toBase64(salt), hash:toBase64(hash)}));
    storage.removeItem(PARENT_PIN_ATTEMPTS_KEY);
    return true;
}

export async function verifyParentPin(pin, storage = globalThis.localStorage, now = Date.now()) {
    let attempts;
    try { attempts = JSON.parse(storage.getItem(PARENT_PIN_ATTEMPTS_KEY) || '{}'); } catch { attempts = {}; }
    if (Number(attempts.lockedUntil) > now) return {ok:false, locked:true};
    let record, salt, expected;
    try {
        record = JSON.parse(storage.getItem(PARENT_PIN_KEY));
        if (record?.version !== 1 || record.iterations !== ITERATIONS) throw new Error();
        salt = fromBase64(record.salt); expected = fromBase64(record.hash);
        if (salt.length !== 16 || expected.length !== 32) throw new Error();
    } catch { throw new Error('Parent PIN data is unavailable.'); }
    // Compute a hash even for an incorrectly formatted entry to avoid revealing
    // whether the attempt was close to the stored value.
    const actual = await derive(String(pin || ''), salt, record.iterations);
    let difference = 0;
    for (let index = 0; index < expected.length; index++) difference |= expected[index] ^ actual[index];
    const ok = difference === 0 && isValidParentPin(pin);
    if (ok) { storage.removeItem(PARENT_PIN_ATTEMPTS_KEY); return {ok:true, locked:false}; }
    const failures = (Number(attempts.failures) || 0) + 1;
    const locked = failures >= MAX_FAILURES;
    storage.setItem(PARENT_PIN_ATTEMPTS_KEY, JSON.stringify({failures: locked ? 0 : failures, lockedUntil: locked ? now + LOCK_MS : 0}));
    return {ok:false, locked};
}

export function removeParentPin(storage = globalThis.localStorage) {
    storage.removeItem(PARENT_PIN_KEY);
    storage.removeItem(PARENT_PIN_ATTEMPTS_KEY);
}
