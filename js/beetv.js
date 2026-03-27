/**
 * BeeTV (Android) Specific Overrides for StreamOS
 * Handles TV navigation, focus management, and device-specific styling.
 * v51.0 - Robust Global Focus Engine + Grid Support
 */
(function() {
    console.log("[BeeTV] Initializing Global Focus Engine v51.0...");

    const CONFIG = {
        POSTER_SELECTOR: '.poster-card, .show-all-card',
        TAB_SELECTOR: '.nav-tab',
        ROW_SELECTOR: '.content-row, #music-rows-container .content-row'
    };

    function getFocusableItems(container = document) {
        return Array.from(container.querySelectorAll('button, a, input, [tabindex="0"]')).filter(el => {
            const style = window.getComputedStyle(el);
            return !el.classList.contains('hidden') && 
                   style.display !== 'none' && 
                   style.visibility !== 'hidden' &&
                   el.offsetParent !== null;
        });
    }

    // Explicit D-Pad Logic
    window.addEventListener('keydown', (e) => {
        const key = e.key;
        if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Up', 'Down', 'Left', 'Right'].includes(key)) return;

        const active = document.activeElement;
        
        // Safety: If no element is focused, or we're on the body, find the first available item
        if (!active || active === document.body || active.tagName === 'BODY') {
            const first = getFocusableItems().shift();
            if (first) {
                first.focus();
                e.preventDefault();
            }
            return;
        }

        console.log("[BeeTV] D-Pad Key:", key, "| Active:", active.className || active.id || active.tagName);

        // 1. Horizontal Navigation
        if (['ArrowLeft', 'Left', 'ArrowRight', 'Right'].includes(key)) {
            handleHorizontal(active, key, e);
        }

        // 2. Vertical Navigation
        if (['ArrowUp', 'Up', 'ArrowDown', 'Down'].includes(key)) {
            handleVertical(active, key, e);
        }
    });

    function handleHorizontal(active, key, e) {
        const isRight = ['ArrowRight', 'Right'].includes(key);

        if (active.closest('#side-bar') || active.closest('.nav-tabs')) {
            if (isRight) {
                const firstContentItem = document.querySelector(CONFIG.POSTER_SELECTOR) || document.querySelector('.grid .poster-card, #hero-banner a, #apk-hero-banner a');
                if (firstContentItem) {
                    firstContentItem.focus();
                    e.preventDefault();
                }
            }
            return;
        }

        const parent = active.closest('.row-posters, .grid, #avatar-selection-grid, .control-btns, #view-home > div');
        if (!parent) return;

        const items = getFocusableItems(parent);
        const idx = items.indexOf(active);

        if (isRight && idx < items.length - 1) {
            items[idx + 1].focus();
            e.preventDefault();
        } else if (!isRight) {
            if (idx > 0) {
                items[idx - 1].focus();
                e.preventDefault();
            } else {
                const activeTab = document.querySelector('.nav-tab.active') || document.querySelector('.nav-tab');
                if (activeTab) {
                    activeTab.focus();
                    e.preventDefault();
                }
            }
        }
    }

    function handleVertical(active, key, e) {
        const isDown = ['ArrowDown', 'Down'].includes(key);
        const activeRect = active.getBoundingClientRect();
        
        if (active.closest('#side-bar') || active.closest('.nav-tabs')) {
            const tabs = getFocusableItems(active.closest('.nav-tabs') || document.querySelector('.nav-tabs'));
            const idx = tabs.indexOf(active);
            if (idx === -1) return;
            if (isDown && idx < tabs.length - 1) {
                tabs[idx + 1].focus(); e.preventDefault();
            } else if (!isDown && idx > 0) {
                tabs[idx - 1].focus(); e.preventDefault();
            }
            return;
        }

        const apkBanner = active.closest('#view-home > div[style*="background"]');
        if (apkBanner) {
            if (isDown) {
                const firstRow = document.querySelector(CONFIG.ROW_SELECTOR);
                if (firstRow) {
                    const firstItem = firstRow.querySelector(CONFIG.POSTER_SELECTOR);
                    if (firstItem) {
                        firstItem.focus(); e.preventDefault();
                    }
                }
            }
            return;
        }

        const currentRow = active.closest(CONFIG.ROW_SELECTOR);
        if (currentRow) {
            const rows = Array.from(document.querySelectorAll(CONFIG.ROW_SELECTOR));
            const rowIdx = rows.indexOf(currentRow);

            if (isDown && rowIdx < rows.length - 1) {
                focusNearestX(activeRect, rows[rowIdx + 1], e);
            } else if (!isDown) {
                if (rowIdx > 0) {
                    focusNearestX(activeRect, rows[rowIdx - 1], e);
                } else {
                    const apkHero = document.querySelector('#view-home > div[style*="background"]');
                    if (apkHero && !apkHero.classList.contains('hidden')) {
                        const btn = apkHero.querySelector('a, button, [tabindex="0"]');
                        if (btn) {
                            btn.focus(); e.preventDefault();
                        }
                    }
                }
            }
            return;
        }

        const currentGrid = active.closest('.grid, #category-grid, #search-grid');
        if (currentGrid) {
            const items = getFocusableItems(currentGrid);
            const idx = items.indexOf(active);
            
            const gridRect = currentGrid.getBoundingClientRect();
            const itemRect = active.getBoundingClientRect();
            const itemsPerRow = Math.max(1, Math.floor(gridRect.width / (itemRect.width + 10))); 

            if (isDown) {
                if (idx + itemsPerRow < items.length) {
                    items[idx + itemsPerRow].focus(); e.preventDefault();
                }
            } else {
                if (idx - itemsPerRow >= 0) {
                    items[idx - itemsPerRow].focus(); e.preventDefault();
                }
            }
            return;
        }
    }

    function focusNearestX(activeRect, container, e) {
        const targets = getFocusableItems(container);
        if (!targets.length) return;

        let closest = targets[0];
        let minDist = Infinity;
        const activeCenterX = activeRect.left + activeRect.width / 2;

        targets.forEach(item => {
            const rect = item.getBoundingClientRect();
            const centerX = rect.left + rect.width /2;
            const dist = Math.abs(centerX - activeCenterX);
            if (dist < minDist) {
                minDist = dist;
                closest = item;
            }
        });

        if (closest) {
            closest.focus();
            e.preventDefault();
        }
    }

    // Auto-scroll Alignment
    window.addEventListener('focusin', (e) => {
        const active = e.target;
        if (active && typeof active.scrollIntoView === 'function') {
            setTimeout(() => {
                active.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
            }, 100);
        }
    });

})();
