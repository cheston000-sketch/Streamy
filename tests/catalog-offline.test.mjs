import assert from 'node:assert/strict';
const cache = new Map();
const profiles = new Map([['streamy_active_profile','adult'],['streamy_profiles',JSON.stringify([{id:'adult',isKid:false},{id:'kid',isKid:true}])]]);
globalThis.localStorage = { getItem:k=>profiles.get(k)||null };
const db = { objectStoreNames:{contains:()=>true}, transaction() {
    const tx={ objectStore() { return {
        get(key) { const request={}; queueMicrotask(()=>{request.result=cache.get(key);request.onsuccess?.();});return request; },
        put(value) { cache.set(value.url,value);queueMicrotask(()=>tx.oncomplete?.()); }
    }; } }; return tx;
}};
globalThis.indexedDB={open(){const request={};queueMicrotask(()=>{request.result=db;request.onsuccess?.();});return request;}};
const events=[];globalThis.dispatchEvent=e=>events.push(e.type);
const {fetchFromTMDB,fetchTmdbSearchPage,getCatalogStatus,resetCatalogStatus,retryCatalogRequests}=await import('../www/js/api.js');
const previousFetch=globalThis.fetch, previousError=console.error;
console.error=()=>{};
const ok=data=>({ok:true,json:async()=>data});
const cacheOld=()=>{for(const v of cache.values())v.timestamp=Date.now()-50000000;};
try {
    globalThis.fetch=async url=>String(url).includes('/search/multi')
        ? ok({total_pages:4,results:[{id:1,media_type:'movie',certification:'PG'}]})
        : ok({results:[{id:1,media_type:'movie',certification:'PG'}]});
    assert.equal((await fetchFromTMDB('/movie/popular?page=1')).length,1);
    assert.equal((await fetchTmdbSearchPage('stars',1)).totalPages,4);
    cacheOld();
    globalThis.fetch=async()=>{throw new TypeError('network down');};
    assert.equal((await fetchFromTMDB('/movie/popular?page=1')).length,1,'expired metadata is usable when offline');
    assert.equal((await fetchTmdbSearchPage('stars',1)).results.length,1,'search can use saved pages');
    assert.equal(getCatalogStatus().stale,true);
    globalThis.fetch=async()=>ok({results:[]});
    await fetchFromTMDB('/tv/popular?page=1');
    assert.equal(getCatalogStatus().stale,true,'unrelated success cannot hide a stale catalog response');
    globalThis.fetch=async()=>{throw Error('offline');};
    await retryCatalogRequests();
    assert.equal(getCatalogStatus().retrying,false);
    assert.equal(getCatalogStatus().stale,true,'failed probe keeps stale notice');
    assert.equal(getCatalogStatus().unavailable,true,'failed probe reports unavailable');
    globalThis.fetch=async url=>String(url).includes('/configuration')?ok({images:{}}):ok({results:[]});
    await retryCatalogRequests();
    assert.equal(getCatalogStatus().stale,false);
    assert.equal(getCatalogStatus().unavailable,false);
    assert.ok(events.includes('streamy-catalog-retry'));

    // A successful probe cannot erase a request that failed again while the probe was in flight.
    resetCatalogStatus(); cacheOld(); globalThis.fetch=async()=>{throw Error('offline');};
    await fetchFromTMDB('/movie/popular?page=1');
    let finishProbe;
    globalThis.fetch=async url=>String(url).includes('/configuration')
        ? new Promise(resolve=>{finishProbe=resolve;}) : Promise.reject(Error('still offline'));
    const retrying=retryCatalogRequests();
    await fetchFromTMDB('/movie/popular?page=1');
    finishProbe(ok({images:{}})); await retrying;
    assert.equal(getCatalogStatus().stale,true,'a new stale response survives the successful probe');

    resetCatalogStatus();
    profiles.set('streamy_active_profile','kid');
    globalThis.fetch=async url=>{
        if(String(url).includes('/release_dates')) return ok({results:[{iso_3166_1:'US',release_dates:[{certification:'PG'}]}]});
        return ok({results:[{id:10,media_type:'movie'},{id:11,media_type:'movie',certification:'R'}]});
    };
    assert.deepEqual((await fetchFromTMDB('/movie/popular?page=1')).map(x=>x.id),[10]);
    cacheOld();globalThis.fetch=async()=>{throw Error('offline');};
    assert.deepEqual((await fetchFromTMDB('/movie/popular?page=1')).map(x=>x.id),[10],'saved PG rating remains checked, R is excluded');
    for(const key of cache.keys()) if(key.includes('/release_dates')) cache.delete(key);
    assert.deepEqual(await fetchFromTMDB('/movie/popular?page=1'),[],'unrated titles stay excluded without saved certification');

    const controller=new AbortController();controller.abort();
    await assert.rejects(()=>fetchFromTMDB('/movie/popular?page=1',{signal:controller.signal}),{name:'AbortError'});
    console.log('Catalog offline fallback, retry and kids rating tests passed.');
} finally {globalThis.fetch=previousFetch;console.error=previousError;}
