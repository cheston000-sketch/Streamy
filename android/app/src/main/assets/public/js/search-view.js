export function matchesSearchFilters(item, {type = 'all', year = '', genre = ''} = {}) {
    const kind = item?.media_type;
    if (!['movie', 'tv', 'person'].includes(kind)) return false;
    if (type !== 'all' && kind !== type) return false;
    if (kind === 'person') return !year && !genre;
    const date = String(item.release_date || item.first_air_date || '');
    if (year && date.slice(0, 4) !== String(year)) return false;
    if (genre && !(Array.isArray(item.genre_ids) && item.genre_ids.map(String).includes(String(genre)))) return false;
    return true;
}

export function dedupeActorCredits(credits = []) {
    const seen = new Set();
    return credits.filter(item => {
        if (!item?.id || !['movie', 'tv'].includes(item.media_type) || item.adult === true) return false;
        const key = `${item.media_type}:${item.id}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    }).sort((a, b) => (Number(b.vote_count) || 0) - (Number(a.vote_count) || 0));
}

export function initSearchView({input, grid, fetchPage, fetchDetails, filterTitles, renderGridItems, openDetails, navigateTo, navigateBack, imageUrl}) {
    const resultsView = document.getElementById('search-results-view');
    const actorView = document.getElementById('search-actor-view');
    const actorName = document.getElementById('search-actor-name');
    const actorImage = document.getElementById('search-actor-image');
    const actorBack = document.getElementById('search-actor-back');
    const actorGrid = document.getElementById('search-actor-grid');
    const actorStatus = document.getElementById('search-actor-status');
    const actorMore = document.getElementById('search-actor-more');
    const status = document.getElementById('search-status');
    const more = document.getElementById('search-load-more');
    const type = document.getElementById('search-type');
    const year = document.getElementById('search-year');
    const genre = document.getElementById('search-genre');
    const currentYear = new Date().getFullYear();
    for (let value = currentYear + 1; value >= 1900; value--) {
        const option = document.createElement('option'); option.value = String(value); option.textContent = String(value); year.appendChild(option);
    }
    let generation = 0, timer = null, controller = null, actorController = null;
    let state = {term:'', page:0, totalPages:0, items:[], profile:''};
    let selectedActor = null, actorCredits = [], actorOffset = 0, actorLoadingRequest = null;
    const profileId = () => globalThis.localStorage.getItem('streamy_active_profile') || '';
    const isSearch = () => globalThis.location.hash.startsWith('#search');
    const isActor = () => globalThis.location.hash.startsWith('#search/actor/');
    const cancel = () => { generation++; clearTimeout(timer); timer = null; controller?.abort(); controller = null; };
    const cardForPerson = person => {
        const card = document.createElement('button');
        card.className = 'poster-card search-person-card'; card.type = 'button';
        card.dataset.mediaKey = `person:${person.id}`;
        card.setAttribute('aria-label', `${person.name || 'Actor'} — view filmography`);
        if (person.profile_path) {
            const img = document.createElement('img'); img.loading = 'lazy'; img.alt = ''; img.src = imageUrl + person.profile_path; card.appendChild(img);
        } else {
            const placeholder = document.createElement('span'); placeholder.className = 'search-person-placeholder'; placeholder.textContent = '★'; card.appendChild(placeholder);
        }
        const info = document.createElement('span'); info.className = 'search-person-info';
        const name = document.createElement('strong'); name.textContent = person.name || 'Unknown';
        const sub = document.createElement('small'); sub.textContent = 'ACTOR · VIEW FILMOGRAPHY'; info.append(name, sub); card.appendChild(info);
        card.onclick = () => { selectedActor = person; navigateTo(`#search/actor/${encodeURIComponent(person.id)}`); };
        return card;
    };
    const render = () => {
        const filters = {type:type.value, year:year.value, genre:genre.value};
        grid.innerHTML = '';
        const visible = state.items.filter(item => matchesSearchFilters(item, filters));
        const seen = new Set();
        for (const item of visible) {
            const key = `${item.media_type}:${item.id}`; if (!item.id || seen.has(key)) continue; seen.add(key);
            if (item.media_type === 'person') grid.appendChild(cardForPerson(item));
            else renderGridItems([item], grid, item.media_type, openDetails, {append:true});
        }
        const count = grid.querySelectorAll('.poster-card').length;
        const hasMore = state.page < state.totalPages;
        more.classList.toggle('hidden', !hasMore);
        more.disabled = false; more.textContent = 'Load more results';
        status.textContent = state.page ? (count ? `${count} result${count === 1 ? '' : 's'} shown${hasMore ? ' · Load more to search further' : ''}` : hasMore ? 'No matches in the loaded results. Load more to keep searching.' : 'No matching results. Try another search or filter.') : '';
    };
    const loadPage = async page => {
        if (!state.term || controller) return;
        const id = generation, activeProfile = state.profile, term = state.term;
        const request = new AbortController(); controller = request;
        more.disabled = true; status.textContent = page === 1 ? 'Searching…' : 'Loading more results…';
        try {
            const data = await fetchPage(term, page, {signal:request.signal});
            if (id !== generation || profileId() !== activeProfile || !isSearch()) return;
            const previousCount = grid.querySelectorAll('.poster-card').length;
            const restoreFromMore = page > 1 && document.activeElement === more;
            state.items.push(...data.results); state.page = data.page; state.totalPages = data.totalPages;
            render();
            if (restoreFromMore) {
                const cards = grid.querySelectorAll('.poster-card');
                (cards[previousCount] || cards[cards.length - 1] || input).focus();
            }
        } catch (error) {
            if (id !== generation || error?.name === 'AbortError') return;
            status.textContent = 'Search is temporarily unavailable. Please try again.';
            more.classList.remove('hidden'); more.disabled = false; more.textContent = 'Retry search';
        } finally { if (controller === request) controller = null; }
    };
    const restart = () => {
        cancel();
        state = {term:input.value.trim(), page:0, totalPages:0, items:[], profile:profileId()};
        grid.innerHTML = ''; status.textContent = ''; more.classList.add('hidden');
        if (state.term.length < 3) { if (state.term) status.textContent = 'Enter at least three characters.'; return; }
        const id = generation;
        timer = setTimeout(() => { timer = null; if (id === generation) loadPage(1); }, 450);
    };
    input.addEventListener('input', restart);
    [type, year, genre].forEach(control => control.addEventListener('change', () => {
        if (control === type && type.value === 'person') { year.value = ''; genre.value = ''; }
        year.disabled = genre.disabled = type.value === 'person';
        render();
    }));
    more.addEventListener('click', () => loadPage(state.page + 1));
    actorBack.addEventListener('click', () => navigateBack());
    const loadActorBatch = async (request, actor, activeProfile) => {
        if (actorLoadingRequest === request || request.signal.aborted) return;
        actorLoadingRequest = request; actorMore.disabled = true;
        const end = Math.min(actorCredits.length, actorOffset + 36);
        try {
            const credits = await filterTitles(actorCredits.slice(actorOffset, end), '', {signal:request.signal});
            if (request.signal.aborted || !isActor() || selectedActor !== actor || profileId() !== activeProfile) return;
            renderGridItems(credits, actorGrid, 'movie', openDetails, {append:true});
            const restoreFromMore = document.activeElement === actorMore;
            actorOffset = end;
            const count = actorGrid.querySelectorAll('.poster-card').length;
            const hasMore = actorOffset < actorCredits.length;
            actorMore.classList.toggle('hidden', !hasMore);
            if (restoreFromMore && !hasMore) (actorGrid.querySelectorAll('.poster-card')[count - 1] || actorBack).focus();
            actorStatus.textContent = count ? `${count} titles shown${hasMore ? ' · More available' : ''}` : hasMore ? 'No titles in this batch. Load more to continue.' : 'No titles available for this profile.';
        } catch (error) {
            if (!request.signal.aborted && isActor()) { actorStatus.textContent = 'Could not load these titles. Please try again.'; actorMore.classList.remove('hidden'); }
        } finally { if (actorLoadingRequest === request) { actorLoadingRequest = null; actorMore.disabled = false; } }
    };
    actorMore.addEventListener('click', () => { if (actorController && selectedActor) loadActorBatch(actorController, selectedActor, profileId()); });
    const syncRoute = async () => {
        if (!isSearch()) { cancel(); actorController?.abort(); return; }
        const wasActorVisible = !actorView.classList.contains('hidden');
        const showActor = isActor() && selectedActor && String(selectedActor.id) === decodeURIComponent(globalThis.location.hash.split('/').pop());
        resultsView.classList.toggle('hidden', !!showActor); actorView.classList.toggle('hidden', !showActor);
        if (!showActor) {
            actorController?.abort();
            if ((state.profile !== profileId() || (state.page === 0 && !controller && !timer)) && input.value.trim()) restart();
            else if (wasActorVisible && selectedActor) setTimeout(() => {
                if (!isActor() && isSearch()) Array.from(grid.querySelectorAll('.search-person-card')).find(card => card.dataset.mediaKey === `person:${selectedActor.id}`)?.focus();
            }, 180);
            return;
        }
        actorController?.abort(); const request = new AbortController(); actorController = request;
        const actor = selectedActor, activeProfile = profileId();
        actorName.textContent = actor.name || 'Actor';
        actorImage.hidden = !actor.profile_path;
        if (actor.profile_path) actorImage.src = imageUrl + actor.profile_path; else actorImage.removeAttribute('src');
        actorGrid.innerHTML = ''; actorCredits = []; actorOffset = 0; actorLoadingRequest = null; actorMore.classList.add('hidden'); actorStatus.textContent = 'Loading filmography…';
        setTimeout(() => { if (isActor()) actorBack.focus(); }, 180);
        try {
            const data = await fetchDetails(`/person/${encodeURIComponent(actor.id)}/combined_credits`, {signal:request.signal});
            if (!Array.isArray(data?.cast)) throw new Error('Invalid credits');
            if (request.signal.aborted || !isActor() || selectedActor !== actor || profileId() !== activeProfile) return;
            actorCredits = dedupeActorCredits(data.cast);
            if (actorCredits.length) await loadActorBatch(request, actor, activeProfile);
            else actorStatus.textContent = 'No titles available for this profile.';
        } catch (error) {
            if (!request.signal.aborted && isActor()) actorStatus.textContent = 'Filmography could not be loaded. Go back and try again.';
        }
    };
    globalThis.addEventListener('hashchange', syncRoute);
    globalThis.addEventListener('streamy-catalog-retry', () => {
        if (!isSearch()) return;
        if (isActor()) syncRoute();
        else restart();
    });
    // Actor details need a selected search result; recover cleanly after a reload.
    if (isActor() && !selectedActor) globalThis.history.replaceState(null, '', '#search');
    syncRoute();
}
