/**
 * BeeTV (Android) Specific Overrides for StreamOS
 * Handles TV navigation, focus management, and device-specific styling.
 * v50.0 - Robust Global Focus Engine
 */
(function() {
    console.log("[BeeTV] Initializing Global Focus Engine...");

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
        if (!active || active === document.body) {
            // Initial focus if nothing is focused
            const first = getFocusableItems().shift();
            if (first) first.focus();
            return;
        }

        console.log("[BeeTV] Navigation Key:", key, "Active:", active.className);

        // 1. Horizontal Navigation (Within Rows or Tabs)
        if (['ArrowLeft', 'Left', 'ArrowRight', 'Right'].includes(key)) {
            handleHorizontal(active, key);
        }

        // 2. Vertical Navigation (Between Rows or Tabs/Rows)
        if (['ArrowUp', 'Up', 'ArrowDown', 'Down'].includes(key)) {
            handleVertical(active, key);
        }
    });

    function handleHorizontal(active, key) {
        const isRight = ['ArrowRight', 'Right'].includes(key);
        // Find siblings in the same container
        const parent = active.closest('.row-posters, .nav-tabs, #avatar-selection-grid, .control-btns');
        if (!parent) return;

        const items = getFocusableItems(parent);
        const idx = items.indexOf(active);

        if (isRight && idx < items.length - 1) {
            items[idx + 1].focus();
            event.preventDefault();
        } else if (!isRight && idx > 0) {
            items[idx - 1].focus();
            event.preventDefault();
        }
    }

    function handleVertical(active, key) {
        const isDown = ['ArrowDown', 'Down'].includes(key);
        
        // CASE A: Active is in TOP BAR (Tabs) -> Move to content
        if (active.closest('#top-bar')) {
            if (isDown) {
                // Focus first poster in first row
                const firstRow = document.querySelector(CONFIG.ROW_SELECTOR);
                if (firstRow) {
                    const firstPoster = firstRow.querySelector(CONFIG.POSTER_SELECTOR);
                    if (firstPoster) {
                        firstPoster.focus();
                        event.preventDefault();
                    }
                }
            }
            return;
        }

        // CASE B: Active is in CONTENT ROW -> Move between rows or to top bar
        const currentRow = active.closest(CONFIG.ROW_SELECTOR);
        if (currentRow) {
            const rows = Array.from(document.querySelectorAll(CONFIG.ROW_SELECTOR));
            const rowIdx = rows.indexOf(currentRow);

            if (isDown && rowIdx < rows.length - 1) {
                // Move to next row (try to match horizontal position)
                const activeRect = active.getBoundingClientRect();
                const nextRow = rows[rowIdx + 1];
                const nextItems = getFocusableItems(nextRow);
                
                // Find closest item by X coordinate
                let closest = nextItems[0];
                let minDist = Infinity;
                nextItems.forEach(item => {
                    const rect = item.getBoundingClientRect();
                    const dist = Math.abs((rect.left + rect.width/2) - (activeRect.left + activeRect.width/2));
                    if (dist < minDist) {
                        minDist = dist;
                        closest = item;
                    }
                });

                if (closest) {
                    closest.focus();
                    event.preventDefault();
                }
            } else if (!isDown) {
                if (rowIdx > 0) {
                    // Move to previous row
                    const activeRect = active.getBoundingClientRect();
                    const prevRow = rows[rowIdx - 1];
                    const prevItems = getFocusableItems(prevRow);
                    
                    let closest = prevItems[0];
                    let minDist = Infinity;
                    prevItems.forEach(item => {
                        const rect = item.getBoundingClientRect();
                        const dist = Math.abs((rect.left + rect.width/2) - (activeRect.left + activeRect.width/2));
                        if (dist < minDist) {
                            minDist = dist;
                            closest = item;
                        }
                    });
                    if (closest) {
                        closest.focus();
                        event.preventDefault();
                    }
                } else {
                    // Move to TOP BAR
                    const tabs = Array.from(document.querySelectorAll('.nav-tab'));
                    if (tabs.length) {
                        tabs[0].focus();
                        event.preventDefault();
                    }
                }
            }
            return;
        }

        // CASE C: Active is in SETTINGS or other full views
        if (active.closest('#view-settings, #profile-edit-modal')) {
            const container = active.closest('#view-settings, #profile-edit-modal');
            const items = getFocusableItems(container);
            const idx = items.indexOf(active);
            if (isDown && idx < items.length - 1) {
                items[idx + 1].focus();
                event.preventDefault();
            } else if (!isDown && idx > 0) {
                items[idx - 1].focus();
                event.preventDefault();
            }
        }
    }

    // Auto-scroll logic (from app.js but reinforced)
    window.addEventListener('focusin', (e) => {
        const active = e.target;
        if (active && typeof active.scrollIntoView === 'function') {
            setTimeout(() => {
                active.scrollIntoView({ block: 'nearest', inline: 'nearest' });
            }, 50);
        }
    });

    // Initial Tweaks
    function initAndroidTweaks() {
        const profileScreen = document.getElementById('profile-selection-screen');
        const mainContent = document.getElementById('main-content');
        const topBar = document.getElementById('top-bar');

        if (profileScreen && !profileScreen.classList.contains('hidden')) {
            mainContent.classList.add('hidden');
            topBar.classList.add('hidden');
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initAndroidTweaks);
    } else {
        initAndroidTweaks();
    }

})();
