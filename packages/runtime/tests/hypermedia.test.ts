import {test} from 'node:test';
import assert from 'node:assert/strict';
import {compileAttribute} from '../dist/hypermedia.js';

test('trusted attribute actions are rewritten without changing strings, templates, regexes or comments',()=>{
  const expression=compileAttribute('[$count, "@get", `@get`, /@get/.source, @peek(() => $count)]');
  assert.deepEqual(expression.run({count:2},{get:async()=>{},peek:fn=>fn()},{} as Element),[2,'@get','@get','@get',2]);
  assert.deepEqual(expression.refs,['count']);
});
test('trusted attribute assignment reaches supplied draft and rejects forbidden root names',()=>{
  const state={count:1};compileAttribute('$count += 2',true).run(state,{get:async()=>{},peek:fn=>fn()},{} as Element);
  assert.equal(state.count,3);
  assert.throws(()=>compileAttribute('$constructor',false).run(state,{get:async()=>{},peek:fn=>fn()},{} as Element),/Invalid signal name/);
});
