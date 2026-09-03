import { buildVisualGridRows, findGridTarget, findNearestGridItem } from './grid-navigation.js?v=118';

const FOCUSABLE_SELECTOR = [
    'button',
    'a[href]',
    'input',
    'select',
    'textarea',
    '[tabindex]:not([tabindex="-1"])'
].join(', ');

const SCROLL_CONTAINER_SELECTOR = [
    '.row-posters',
    '.content-grid',
    '.grid',
    '#episode-list',
    '#season-tabs',
    '#server-list',
    '.source-filter-controls',
    '#profiles-grid',
    '#profile-actions',
    '#avatar-selection-grid',
    '.player-header',
    '.nav-tabs'
].join(', ');

const HORIZONTAL_GROUP_SELECTOR = [
    '.row-posters',
    '.content-grid',
    '#episode-list',
    '#season-tabs',
    '#server-list',
    '.source-filter-controls',
    '#profiles-grid',
    '#profile-actions',
    '#avatar-selection-grid',
    '.player-header',
    '.nav-tabs'
].join(', ');

function isVisible(el) {
    if (!el || !document.contains(el)) return false;
    const style = window.getComputedStyle(el);
    return !el.disabled && style.display !== 'none' && style.visibility !== 'hidden' && el.offsetParent !== null;
}

function getFocusableItems(container = document) {
    return Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR)).filter(isVisible);
}

function getContextRoots() {
    const modal = document.querySelector('#profile-edit-modal:not(.hidden)');
    if (modal) return [modal];

    const profileScreen = document.querySelector('#profile-selection-screen:not(.hidden)');
    if (profileScreen) return [profileScreen];

    const activeView = Array.from(document.querySelectorAll('.view')).find(view => !view.classList.contains('hidden'));
    const roots = [];
    const topBar = document.getElementById('top-bar');
    if (topBar && !topBar.classList.contains('hidden')) roots.push(topBar);
    if (activeView) roots.push(activeView);
    return roots.length ? roots : [document.body];
}

function getCandidates() {
    return getContextRoots().flatMap(root => getFocusableItems(root));
}

function isOwnedNavigationScope(active) {
    return !!active?.closest?.('[data-nav-scope="tv-details"]');
}

function focusNearestInContainer(active, container) {
    if (!container) return false;
    const candidates = getFocusableItems(container);
    if (!candidates.length) return false;

    const activeRect = active.getBoundingClientRect();
    const activeCenterX = activeRect.left + activeRect.width / 2;
    let best = candidates[0];
    let bestDistance = Infinity;

    candidates.forEach(candidate => {
        const rect = candidate.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const distance = Math.abs(centerX - activeCenterX);
        if (distance < bestDistance) {
            bestDistance = distance;
            best = candidate;
        }
    });

    best.focus();
    return true;
}

function handleRowNavigation(active, direction) {
    const row = active.closest('.row-posters');
    if (!row || (direction !== 'up' && direction !== 'down')) return false;

    const rows = Array.from(document.querySelectorAll('.row-posters'))
        .filter(candidate => !candidate.closest('.hidden'));
    const rowIndex = rows.indexOf(row);
    if (rowIndex === -1) return false;

    if (direction === 'up') {
        if (rowIndex > 0) {
            return focusNearestInContainer(active, rows[rowIndex - 1]);
        }
        return false;
    }

    if (rowIndex < rows.length - 1) {
        return focusNearestInContainer(active, rows[rowIndex + 1]);
    }

    return false;
}

function getGridFooter(grid) {
    if (!grid?.id) return null;
    return Array.from(document.querySelectorAll('[data-grid-footer]'))
        .find(candidate => candidate.dataset.gridFooter === grid.id && isVisible(candidate)) || null;
}

function handleGridFooterNavigation(active, direction) {
    const gridId = active?.dataset?.gridFooter;
    if (!gridId) return false;

    if (direction === 'up') {
        const grid = document.getElementById(gridId);
        const rows = buildVisualGridRows(grid ? getFocusableItems(grid) : []);
        const lastRow = rows[rows.length - 1] || [];
        const target = findNearestGridItem(active, lastRow);
        if (target) target.focus();
    }

    // A grid footer owns every direction so focus cannot leak into unrelated controls.
    return true;
}

function handleGridNavigation(active, direction) {
    if (handleGridFooterNavigation(active, direction)) return true;

    const grid = active.closest('.grid');
    if (!grid) return false;

    const result = findGridTarget(getFocusableItems(grid), active, direction);
    if (result.target) {
        result.target.focus();
        return true;
    }

    if (result.boundary === 'top') {
        return false;
    }

    if (result.boundary === 'bottom') {
        const footer = getGridFooter(grid);
        if (footer) footer.focus();
        return true;
    }

    return result.boundary === 'side';
}

function scoreCandidate(activeRect, rect, direction) {
    const activeCenterX = activeRect.left + activeRect.width / 2;
    const activeCenterY = activeRect.top + activeRect.height / 2;
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const dx = centerX - activeCenterX;
    const dy = centerY - activeCenterY;

    if (direction === 'left' && dx >= -4) return Infinity;
    if (direction === 'right' && dx <= 4) return Infinity;
    if (direction === 'up' && dy >= -4) return Infinity;
    if (direction === 'down' && dy <= 4) return Infinity;

    const primary = direction === 'left' || direction === 'right' ? Math.abs(dx) : Math.abs(dy);
    const secondary = direction === 'left' || direction === 'right' ? Math.abs(dy) : Math.abs(dx);
    return primary * 100 + secondary;
}

function focusBestCandidate(active, direction) {
    const activeRect = active.getBoundingClientRect();
    const localGroup = active.closest(HORIZONTAL_GROUP_SELECTOR);
    const localCandidates = localGroup
        ? getFocusableItems(localGroup).filter(candidate => candidate !== active)
        : [];
    const globalCandidates = getCandidates().filter(candidate => candidate !== active);

    const candidates =
        (direction === 'left' || direction === 'right') && localCandidates.length
            ? localCandidates
            : globalCandidates;

    let best = null;
    let bestScore = Infinity;

    candidates.forEach(candidate => {
        const score = scoreCandidate(activeRect, candidate.getBoundingClientRect(), direction);
        if (score < bestScore) {
            bestScore = score;
            best = candidate;
        }
    });

    if (best) {
        best.focus();
        return true;
    }

    return false;
}

function focusBestCandidateFromList(activeRect, candidates, direction) {
    let best = null;
    let bestScore = Infinity;

    candidates.forEach(candidate => {
        const rect = candidate.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const activeCenterX = activeRect.left + activeRect.width / 2;
        const activeCenterY = activeRect.top + activeRect.height / 2;
        const dx = centerX - activeCenterX;
        const dy = Math.abs(centerY - activeCenterY);
        if (direction === 'left' && dx >= -4) return;
        if (direction === 'right' && dx <= 4) return;
        const score = Math.abs(dx) * 100 + dy;
        if (score < bestScore) {
            bestScore = score;
            best = candidate;
        }
    });

    if (best) {
        best.focus();
        return true;
    }
    return false;
}

function maintainScroll(active) {
    const scrollContainer = active.closest(SCROLL_CONTAINER_SELECTOR);
    if (scrollContainer && typeof active.scrollIntoView === 'function') {
        active.scrollIntoView({ behavior: 'auto', block: 'nearest', inline: 'center' });
        return;
    }
    if (typeof active.scrollIntoView === 'function') {
        active.scrollIntoView({ behavior: 'auto', block: 'nearest', inline: 'nearest' });
    }
}

export const NavigationManager = {
    lastFocusedPerView: {},

    saveFocus(viewId) {
        const active = document.activeElement;
        if (active && active !== document.body && isVisible(active)) {
            this.lastFocusedPerView[viewId] = active;
        }
    },

    restoreFocus(viewId, fallbackSelector) {
        const saved = this.lastFocusedPerView[viewId];
        if (saved && isVisible(saved)) {
            saved.focus();
            return;
        }

        if (!fallbackSelector) return;

        const fallback = document.querySelector(fallbackSelector);
        if (fallback && isVisible(fallback)) {
            fallback.focus();
        }
    },

    handleDpad(e) {
        const keyMap = {
            ArrowLeft: 'left',
            Left: 'left',
            ArrowRight: 'right',
            Right: 'right',
            ArrowUp: 'up',
            Up: 'up',
            ArrowDown: 'down',
            Down: 'down'
        };

        const direction = keyMap[e.key];
        if (!direction) return;

        let active = document.activeElement;
        if (!active || active === document.body || !isVisible(active)) {
            const first = getCandidates()[0];
            if (first) {
                first.focus();
                e.preventDefault();
            }
            return;
        }

        if (isOwnedNavigationScope(active)) {
            return;
        }

        if (handleGridNavigation(active, direction)) {
            e.preventDefault();
            return;
        }

        if (handleRowNavigation(active, direction)) {
            e.preventDefault();
            return;
        }

        if (focusBestCandidate(active, direction)) {
            e.preventDefault();
        }
    },

    lockFocus(containerSelector) {
        const container = document.querySelector(containerSelector);
        if (!container) return;

        if (!container.dataset.focusLocked) {
            container.dataset.focusLocked = 'true';
            container.addEventListener('keydown', e => {
                if (e.key !== 'Tab') return;
                const focusable = getFocusableItems(container);
                if (!focusable.length) return;

                const first = focusable[0];
                const last = focusable[focusable.length - 1];
                if (e.shiftKey && document.activeElement === first) {
                    last.focus();
                    e.preventDefault();
                } else if (!e.shiftKey && document.activeElement === last) {
                    first.focus();
                    e.preventDefault();
                }
            });
        }

        const first = getFocusableItems(container)[0];
        if (first) {
            setTimeout(() => first.focus(), 100);
        }
    }
};

document.addEventListener('focusin', e => {
    if (e.target instanceof HTMLElement) {
        maintainScroll(e.target);
    }
});
