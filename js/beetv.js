/**
 * BeeTV (Android) Specific Overrides for StreamOS
 * Handles TV navigation, focus management, and device-specific styling.
 */
(function() {
    console.log("[BeeTV] Patching Navigation Engine...");

    // Helper to get all focusable elements in a container
    function getFocusableItems(container) {
        return Array.from(container.querySelectorAll('button, a, input, [tabindex="0"]')).filter(el => {
            return !el.classList.contains('hidden') && el.offsetParent !== null;
        });
    }

    // Initialize Android Tweaks
    function initAndroidTweaks() {
        // 1. Hide main content on boot to prevent background focus traps
        const profileScreen = document.getElementById('profile-selection-screen');
        const mainContent = document.getElementById('main-content');
        const topBar = document.getElementById('top-bar');

        if (profileScreen && !profileScreen.classList.contains('hidden')) {
            mainContent.classList.add('hidden');
            topBar.classList.add('hidden');
        }

        // 2. Patch Profile Grid Navigation
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.addedNodes.length) {
                    patchProfileCards();
                }
            });
        });

        const grid = document.getElementById('profiles-grid');
        if (grid) {
            observer.observe(grid, { childList: true });
            patchProfileCards();
        }

        // 3. Patch Action Buttons
        const addBtn = document.getElementById('add-profile-btn');
        const editBtn = document.getElementById('edit-profiles-btn');

        if (addBtn) {
            addBtn.addEventListener('keydown', (e) => {
                const grid = document.getElementById('profiles-grid');
                if ((e.key === 'ArrowUp' || e.key === 'Up') && grid) {
                    const cards = getFocusableItems(grid);
                    if (cards.length) cards[cards.length - 1].focus();
                    e.preventDefault();
                } else if (e.key === 'ArrowRight' || e.key === 'Right') {
                    if (editBtn) editBtn.focus();
                    e.preventDefault();
                }
            });
        }

        if (editBtn) {
            editBtn.addEventListener('keydown', (e) => {
                const grid = document.getElementById('profiles-grid');
                if ((e.key === 'ArrowUp' || e.key === 'Up') && grid) {
                    const cards = getFocusableItems(grid);
                    if (cards.length) cards[cards.length - 1].focus();
                    e.preventDefault();
                } else if (e.key === 'ArrowLeft' || e.key === 'Left') {
                    if (addBtn) addBtn.focus();
                    e.preventDefault();
                }
            });
        }
    }

    function patchProfileCards() {
        const grid = document.getElementById('profiles-grid');
        if (!grid) return;
        const cards = Array.from(grid.querySelectorAll('.profile-card'));
        
        cards.forEach((card, idx) => {
            if (card.dataset.patched) return;
            card.dataset.patched = "true";

            card.addEventListener('keydown', (e) => {
                console.log("[BeeTV] Card Keydown:", e.key);
                if (['ArrowRight', 'Right'].includes(e.key) && idx < cards.length - 1) {
                    cards[idx + 1].focus();
                    e.preventDefault();
                } else if (['ArrowLeft', 'Left'].includes(e.key) && idx > 0) {
                    cards[idx - 1].focus();
                    e.preventDefault();
                } else if (['ArrowDown', 'Down'].includes(e.key)) {
                    const addBtn = document.getElementById('add-profile-btn');
                    if (addBtn) addBtn.focus();
                    e.preventDefault();
                }
            });
        });
    }

    // Run when global init happens
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initAndroidTweaks);
    } else {
        initAndroidTweaks();
    }

})();
