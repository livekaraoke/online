const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../host/js/lyricview.js'),'utf8');
const start=source.indexOf('  function chordParts(');
const end=source.indexOf('  function captureOriginalChordText()',start);
const context={};
vm.createContext(context);
vm.runInContext(source.slice(start,end),context);
const transpose=context.transposeChordToken;

test('original chord spelling survives zero transpose, octaves and reset',()=>{
  for(const token of ['Bb','A#','Ebmaj7','F#m7','Bb/D','Cb','B#']){
    for(const shift of [0,12,-12,24])assert.equal(transpose(token,shift),token);
    transpose(token,2);
    assert.equal(transpose(token,0),token);
  }
});
test('transposition retains accidental preference and handles slash bass notes',()=>{
  assert.equal(transpose('Bb',3),'Db');
  assert.equal(transpose('A#',3),'C#');
  assert.equal(transpose('Bb/Db',2),'C/Eb');
  assert.equal(transpose('Bb',-1),'A');
  assert.equal(transpose('N.C.',2),'N.C.');
});
