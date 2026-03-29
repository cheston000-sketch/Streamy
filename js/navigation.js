export const NavigationManager = {
    lastFocusedPerView: {},
    
    saveFocus(viewId) {
        if (document.activeElement && document.activeElement !== document.body) {
            this.lastFocusedPerView[viewId] = document.activeElement;
        }
    },
    
    restoreFocus(viewId, fallbackSelector) {
        const saved = this.lastFocusedPerView[viewId];
        if (saved && document.contains(saved) && saved.offsetParent !== null) {
            saved.focus();
        } else if (fallbackSelector) {
            const fallback = document.querySelector(fallbackSelector);
            if (fallback) fallback.focus();
        }
    },
    
    handleDpad(e) {
        const active = document.activeElement;
        if (!active) return;

        // Ensure current item is scrolled into focus properly
        setTimeout(() => {
            const newActive = document.activeElement;
            if (newActive && typeof newActive.scrollIntoView === 'function') {
                newActive.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
            }
        }, 10);
    },

    lockFocus(containerSelector) {
        const container = document.querySelector(containerSelector);
        if (!container) return;

        const focusableElements = container.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        if (focusableElements.length === 0) return;

        const first = focusableElements[0];
        const last = focusableElements[focusableElements.length - 1];

        container.addEventListener('keydown', (e) => {
            if (e.key === 'Tab') {
                if (e.shiftKey) {
                    if (document.activeElement === first) {
                        last.focus();
                        e.preventDefault();
                    }
                } else if (document.activeElement === last) {
                    first.focus();
                    e.preventDefault();
                }
            }
            // For remote D-pad, native spatial navigation usually handles this, 
            // but we can add explicit wrapping if needed.
        });
        
        // Auto-focus first element
        setTimeout(() => first.focus(), 100);
    }
};
