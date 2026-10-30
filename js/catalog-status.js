import { getCatalogStatus, retryCatalogRequests } from './api.js?v=148';

// A catalog notice is intentionally separate from playback: cached metadata
// does not imply that the video itself is available without a connection.
export function initCatalogStatusNotice() {
    const main = document.getElementById('main-content');
    if (!main || document.getElementById('catalog-status-notice')) return;
    const notice = document.createElement('section');
    notice.id = 'catalog-status-notice';
    notice.className = 'catalog-status-notice hidden';
    notice.setAttribute('role', 'status');
    notice.setAttribute('aria-live', 'polite');
    const text = document.createElement('span');
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'catalog-status-retry';
    retry.textContent = 'Retry catalog';
    retry.addEventListener('click', retryCatalogRequests);
    notice.append(text, retry);
    main.prepend(notice);
    const update = () => {
        const state = getCatalogStatus();
        notice.classList.toggle('hidden', !state.stale && !state.unavailable && !state.retrying);
        retry.disabled = state.retrying;
        text.textContent = state.retrying ? 'Checking the catalog connection…'
            : state.stale ? 'Showing saved catalog information; some details may be out of date.'
            : 'Some catalog information is unavailable. Check your connection and retry.';
    };
    globalThis.addEventListener('streamy-catalog-status-changed', update);
    update();
}
