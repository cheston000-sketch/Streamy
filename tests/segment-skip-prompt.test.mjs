import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const layout = await readFile(new URL('../android/app/src/main/res/layout/activity_player.xml', import.meta.url), 'utf8');
const strings = await readFile(new URL('../android/app/src/main/res/values/strings.xml', import.meta.url), 'utf8');
const activity = await readFile(new URL('../android/app/src/main/java/org/streamy/app/PlayerActivity.java', import.meta.url), 'utf8');

assert.match(layout, /@drawable\/bg_segment_skip_bubble/);
assert.match(layout, /native_segment_skip_button[\s\S]*@string\/skip_intro/);
assert.match(layout, /native_segment_skip_cancel[\s\S]*@string\/not_now/);
assert.doesNotMatch(layout, /native_segment_skip_(?:title|detail)/);
assert.doesNotMatch(strings, /detected|marker ready|skip ahead to/i);
assert.match(activity, /configurePlaybackPromptButton\(segmentSkipButton, true\)/);
assert.match(activity, /configurePlaybackPromptButton\(nextEpisodeButton, true\)/);
assert.match(layout, /native_next_episode_prompt[\s\S]*@drawable\/bg_segment_skip_bubble/);
assert.match(activity, /isRecap \? R\.string\.skip_recap : R\.string\.skip_intro/);

console.log('Segment skip prompt design tests passed.');
