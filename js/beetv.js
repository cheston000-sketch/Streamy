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
        // Find siblings in the same container (Posters, Tabs, Grid, or Header)
        const parent = active.closest('.row-posters, .nav-tabs, .grid, #avatar-selection-grid, .control-btns, #top-bar, #view-home > div');
        if (!parent) return;

        const items = getFocusableItems(parent);
        const idx = items.indexOf(active);

        if (isRight && idx < items.length - 1) {
            items[idx + 1].focus();
            e.preventDefault();
        } else if (!isRight && idx > 0) {
            items[idx - 1].focus();
            e.preventDefault();
        }
    }

    function handleVertical(active, key, e) {
        const isDown = ['ArrowDown', 'Down'].includes(key);
        const activeRect = active.getBoundingClientRect();
        
        // CASE A: Top Bar -> Move to first content row or banner
        if (active.closest('#top-bar')) {
            if (isDown) {
                // Try moving to APK Hero Banner first if visible
                const apkBanner = document.querySelector('#view-home > div[style*="background"]');
                if (apkBanner && !apkBanner.classList.contains('hidden')) {
                    const firstBtn = apkBanner.querySelector('a, button, [tabindex="0"]');
                    if (firstBtn) {
                        firstBtn.focus();
                        e.preventDefault();
                        return;
                    }
                }
                
                // Otherwise move to first row
                const firstRow = document.querySelector(CONFIG.ROW_SELECTOR);
                if (firstRow) {
                    const firstItem = firstRow.querySelector(CONFIG.POSTER_SELECTOR);
                    if (firstItem) {
                        firstItem.focus();
                        e.preventDefault();
                    }
                }
            }
            return;
        }

        // CASE B: APK Hero Banner -> Move up to Top Bar or down to Rows
        const apkBanner = active.closest('#view-home > div[style*="background"]');
        if (apkBanner) {
            if (isDown) {
                const firstRow = document.querySelector(CONFIG.ROW_SELECTOR);
                if (firstRow) {
                    const firstItem = firstRow.querySelector(CONFIG.POSTER_SELECTOR);
                    if (firstItem) {
                        firstItem.focus();
                        e.preventDefault();
                    }
                }
            } else {
                // Move up to Top Bar
                const tabs = document.querySelectorAll('.nav-tab');
                if (tabs.length) {
                    tabs[0].focus();
                    e.preventDefault();
                }
            }
            return;
        }

        // CASE C: Content Row -> Move between rows or up to banner/tabs
        const currentRow = active.closest(CONFIG.ROW_SELECTOR);
        if (currentRow) {
            const rows = Array.from(document.querySelectorAll(CONFIG.ROW_SELECTOR));
            const rowIdx = rows.indexOf(currentRow);

            if (isDown && rowIdx < rows.length - 1) {
                // Move Down to Next Row
                focusNearestX(activeRect, rows[rowIdx + 1], e);
            } else if (!isDown) {
                if (rowIdx > 0) {
                    // Move Up to Previous Row
                    focusNearestX(activeRect, rows[rowIdx - 1], e);
                } else {
                    // Move Up to Banner or Top Bar
                    const apkHero = document.querySelector('#view-home > div[style*="background"]');
                    if (apkHero && !apkHero.classList.contains('hidden')) {
                        const btn = apkHero.querySelector('a, button, [tabindex="0"]');
                        if (btn) {
                            btn.focus();
                            e.preventDefault();
                            return;
                        }
                    }
                    const tabs = document.querySelectorAll('.nav-tab');
                    if (tabs.length) {
                        tabs[0].focus();
                        e.preventDefault();
                    }
                }
            }
            return;
        }

        // CASE D: Grid View (Search/Categories)
        const currentGrid = active.closest('.grid, #category-grid, #search-grid');
        if (currentGrid) {
            const items = getFocusableItems(currentGrid);
            const idx = items.indexOf(active);
            
            // For grids, we estimate items per row based on container width
            const gridRect = currentGrid.getBoundingClientRect();
            const itemRect = active.getBoundingClientRect();
            const itemsPerRow = Math.max(1, Math.floor(gridRect.width / (itemRect.width + 10))); 

            if (isDown) {
                if (idx + itemsPerRow < items.length) {
                    items[idx + itemsPerRow].focus();
                    e.preventDefault();
                } else {
                    // Scroll to bottom or handle load more?
                }
            } else {
                if (idx - itemsPerRow >= 0) {
                    items[idx - itemsPerRow].focus();
                    e.preventDefault();
                } else {
                    // Move up to Top Bar
                    const tabs = document.querySelectorAll('.nav-tab');
                    if (tabs.length) {
                        tabs[0].focus();
                        e.preventDefault();
                    }
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
