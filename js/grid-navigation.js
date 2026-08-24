function getRectCenter(element) {
    const rect = element.getBoundingClientRect();
    return {
        element,
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
        height: rect.height
    };
}

export function buildVisualGridRows(elements) {
    const entries = elements
        .map(getRectCenter)
        .filter(entry => Number.isFinite(entry.x) && Number.isFinite(entry.y) && entry.height > 0)
        .sort((a, b) => a.y - b.y || a.x - b.x);

    if (!entries.length) return [];

    const smallestHeight = Math.min(...entries.map(entry => entry.height));
    const rowTolerance = Math.max(16, smallestHeight * 0.35);
    const rows = [];

    entries.forEach(entry => {
        const row = rows[rows.length - 1];
        if (!row || Math.abs(entry.y - row.centerY) > rowTolerance) {
            rows.push({ centerY: entry.y, entries: [entry] });
            return;
        }

        row.entries.push(entry);
        row.centerY = row.entries.reduce((sum, item) => sum + item.y, 0) / row.entries.length;
    });

    return rows.map(row => row.entries
        .sort((a, b) => a.x - b.x)
        .map(entry => entry.element));
}

export function findNearestGridItem(source, candidates) {
    if (!source || !candidates.length) return null;
    const sourceCenter = getRectCenter(source).x;
    let best = null;
    let bestDistance = Infinity;

    candidates.forEach(candidate => {
        const distance = Math.abs(getRectCenter(candidate).x - sourceCenter);
        if (distance < bestDistance) {
            best = candidate;
            bestDistance = distance;
        }
    });

    return best;
}

export function findGridTarget(elements, active, direction) {
    const rows = buildVisualGridRows(elements);
    const rowIndex = rows.findIndex(row => row.includes(active));
    if (rowIndex === -1) return { target: null, boundary: null };

    const row = rows[rowIndex];
    const columnIndex = row.indexOf(active);

    if (direction === 'left' || direction === 'right') {
        const offset = direction === 'left' ? -1 : 1;
        return {
            target: row[columnIndex + offset] || null,
            boundary: row[columnIndex + offset] ? null : 'side'
        };
    }

    const nextRowIndex = direction === 'up' ? rowIndex - 1 : rowIndex + 1;
    if (nextRowIndex < 0) return { target: null, boundary: 'top' };
    if (nextRowIndex >= rows.length) return { target: null, boundary: 'bottom' };

    return {
        target: findNearestGridItem(active, rows[nextRowIndex]),
        boundary: null
    };
}
