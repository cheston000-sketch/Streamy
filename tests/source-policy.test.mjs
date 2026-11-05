import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateRegistry,registryLinks,registryAllows,refreshRegistry,cachedRegistry,REGISTRY_CACHE_KEY,REGISTRY_MAX_AGE,updateSourceHealth,sourceHealthPenalty,sourceHealthTier} from '../www/js/source-policy.js';
const registry=validateRegistry(JSON.parse(await readFile(new URL('../www/server/source-registry.json',import.meta.url),'utf8')));
const movie=registryLinks(registry,{tmdb:550,type:'movie'});
const episode=registryLinks(registry,{tmdb:1399,type:'tv',season:2,episode:3});
assert.equal(movie.find(x=>x.server==='MovieTV API').url,'https://movietvapi.stream/embed/movie/550');
assert.equal(episode.find(x=>x.server==='MovieTV API').url,'https://movietvapi.stream/embed/tv/1399/2/3');
const changed=structuredClone(registry);changed.version++;changed.providers.find(p=>p.id==='vidlink').enabled=false;changed.disabledHosts.push('dead.example');
assert.equal(registryLinks(changed,{tmdb:1}).some(x=>x.server==='Vidlink'),false);
assert.equal(registryAllows({type:'iframe',url:'https://vidlink.pro/movie/1'},changed),false);
assert.equal(registryAllows({type:'hls',url:'https://cdn.dead.example/a.m3u8'},changed),false);
assert.equal(registryAllows({type:'hls',url:'https://other.example/a.m3u8'},changed),true);
for(const bad of ['http://unsafe.example/movie/{tmdb}','https://{tmdb}.example/movie/1','https://safe.example/{unsupported}']){
 const copy=structuredClone(registry);copy.providers[0].movie=bad;assert.throws(()=>validateRegistry(copy));
}
const data=new Map();const storage={getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v)};
let reply={ok:true,text:async()=>JSON.stringify(changed)};
assert.equal((await refreshRegistry({host:'https://backend.example',storage,fetcher:async()=>reply})).version,changed.version);
reply={ok:true,text:async()=>JSON.stringify(registry)};
assert.equal((await refreshRegistry({host:'https://backend.example',storage,fetcher:async()=>reply})).version,changed.version,'older remote registry must not restore removed providers');
assert.equal((await refreshRegistry({host:'https://backend.example',storage,fetcher:async()=>{throw Error('offline')}})).version,changed.version);
const cache=JSON.parse(data.get(REGISTRY_CACHE_KEY));cache.savedAt=Date.now()-REGISTRY_MAX_AGE-1;data.set(REGISTRY_CACHE_KEY,JSON.stringify(cache));
assert.equal(cachedRegistry(storage),null);
let h=updateSourceHealth({},'success',1000,2000);assert.equal(h.successes,1);
h=updateSourceHealth(h,'failed',2000);h=updateSourceHealth(h,'failed',3000);
assert.ok(sourceHealthPenalty(h,3001)>1000,'two failures should temporarily demote source');
h=updateSourceHealth(h,'success',4000,4000);assert.equal(h.consecutiveFailures,0);assert.equal(h.cooldownUntil,0);
assert.ok(sourceHealthPenalty(h,4001)<1000,'success should restore source eligibility');
console.log('Remote source registry and playback health tests passed.');

const spidey=registryLinks(registry,{tmdb:127635,type:'tv',season:4,episode:4}).find(x=>x.providerId==='vidfast');
assert.equal(spidey.url,'https://vidfast.vc/tv/127635/4/2?autoPlay=true');
assert.equal(spidey.pairedEpisode,true);
assert.match(spidey.server,/Giant-Sized Lizard \/ Rhino's Wild Bunch/);
assert.equal(episode.find(x=>x.providerId==='vidfast').url,'https://vidfast.vc/tv/1399/2/3?autoPlay=true');
assert.equal(registryLinks(registry,{tmdb:127635,type:'tv',season:3,episode:4}).some(x=>x.providerId==='vidfast'),false);
for (let catalogEpisode=1;catalogEpisode<=38;catalogEpisode++) {
 const link=registryLinks(registry,{tmdb:127635,type:'tv',season:4,episode:catalogEpisode}).find(x=>x.providerId==='vidfast');
 assert.equal(new URL(link.url).pathname,`/tv/127635/4/${Math.ceil(catalogEpisode/2)}`);
 assert.equal(link.pairedLastEpisode,Math.ceil(catalogEpisode/2)*2);
}
assert.match(registryLinks(registry,{tmdb:127635,type:'tv',season:4,episode:8}).find(x=>x.providerId==='vidfast').server,/King Lizard \/ Go Rhino Go/);
assert.equal(movie.find(x=>x.providerId==='vidfast').url,'https://vidfast.vc/movie/550?autoPlay=true');

const recent=1000000000;
const worked=updateSourceHealth({},'success',recent,2000);
const failed=updateSourceHealth(worked,'failed',recent+1);
assert.equal(sourceHealthTier(failed,recent+2),'failed');
assert.ok(sourceHealthPenalty(failed,recent+2)>sourceHealthPenalty({},recent+2));
assert.ok(sourceHealthPenalty(worked,recent+2)<sourceHealthPenalty({},recent+2));
assert.equal(sourceHealthTier(updateSourceHealth(failed,'success',recent+3,1500),recent+4),'working');
assert.equal(sourceHealthTier(failed,recent+2*24*60*60*1000),'untested','old failures get another chance');
assert.equal(sourceHealthTier(worked,recent+8*24*60*60*1000),'untested','old successes do not permanently pin a source');
assert.ok(sourceHealthPenalty({...worked,bufferCount:8},recent+2)>sourceHealthPenalty(worked,recent+2));
