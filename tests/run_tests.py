import json, os
import quickjs

import pathlib
ROOT = str(pathlib.Path(__file__).resolve().parent.parent)
FILES = ["js/data.js","js/sentences.js","js/srs.js","js/telex.js","js/vocab.js",
         "js/tones.js","js/segments.js","js/cloze.js","js/grammar.js","js/chunks.js","js/plan.js","js/speak.js"]

PREAMBLE = r"""
var __ls={}; var localStorage={ getItem:function(k){return (k in __ls)?__ls[k]:null;},
  setItem:function(k,v){__ls[k]=String(v);}, removeItem:function(k){delete __ls[k];},
  clear:function(){for(var k in __ls)delete __ls[k];}, key:function(i){var ks=Object.keys(__ls);return i<ks.length?ks[i]:null;},
  get length(){return Object.keys(__ls).length;} };
var __ss={}; var sessionStorage={ getItem:function(k){return (k in __ss)?__ss[k]:null;},
  setItem:function(k,v){__ss[k]=String(v);}, removeItem:function(k){delete __ss[k];} };
var navigator={ userAgent:'test', vibrate:function(){} };
function setTimeout(fn){ return 0; }
var console={ log:function(){}, warn:function(){}, error:function(){} };
function SpeechSynthesisUtterance(){}
function Audio(){ return { play:function(){return {catch:function(){}};}, pause:function(){} }; }
var window = globalThis;
window.speechSynthesis = { getVoices:function(){return [];}, addEventListener:function(){}, speak:function(){}, cancel:function(){}, resume:function(){} };
var speechSynthesis = window.speechSynthesis;
var document = {
  addEventListener:function(){}, createElement:function(){return _el();},
  body:{appendChild:function(){}, addEventListener:function(){}},
  querySelector:function(){return null;}, querySelectorAll:function(){return [];},
  getElementById:function(){return null;}
};
function _el(){ return { style:{setProperty:function(){}}, classList:{add:function(){},remove:function(){},toggle:function(){},contains:function(){return false;}},
  appendChild:function(){}, addEventListener:function(){}, querySelector:function(){return null;}, querySelectorAll:function(){return [];}, remove:function(){}, focus:function(){}, set innerHTML(v){}, set textContent(v){} }; }
"""

TESTS = r"""
var RESULTS = [];
function T(name, cond, detail){ RESULTS.push({name:name, pass:!!cond, detail: cond?'':(detail||'')}); }
function eq(a,b){ return a===b; }
function nfc(s){ return String(s).normalize('NFC'); }

// ---- stripDiacritics ----
T('stripDiacritics tôi->toi', stripDiacritics('tôi')==='toi');
T('stripDiacritics đường->duong', stripDiacritics('đường')==='duong');
T('stripDiacritics Đ->D', stripDiacritics('Đ')==='D');

// ---- telexCompile (real shipped engine) ----
var tx = {'dd':'đ','aa':'â','ee':'ê','oo':'ô','aw':'ă','ow':'ơ','uw':'ư','w':'ư',
 'as':'á','af':'à','ar':'ả','ax':'ã','aj':'ạ','asz':'a','tieesng':'tiếng','vieejt':'việt',
 'saus':'sáu','toans':'toán','hoaf':'hòa','quas':'quá','gias':'giá','dduwowngf':'đường',
 'nguyeenx':'nguyễn','chuwa':'chưa','chuwas':'chứa','buoori':'buổi','xin chaof':'xin chào','camr own':'cảm ơn'};
for (var k in tx){ var got=telexCompile(k); T('telex '+k+'->'+tx[k], nfc(got)===nfc(tx[k]), 'got '+got); }

// ---- detectVietnameseTone ----
var tones={'ma':'ngang','mà':'huyen','má':'sac','mả':'hoi','mã':'nga','mạ':'nang','tiếng':'sac','việt':'nang','đường':'huyen'};
for (var w in tones){ T('tone '+w, detectVietnameseTone(w)===tones[w], 'got '+detectVietnameseTone(w)); }
// easy-mode matching data: every form's detected tone matches its key
var tmBad=[];
for (var i=0;i<TONE_MATCH_SETS.length;i++){ var ms=TONE_MATCH_SETS[i];
  ['ngang','huyen','sac','hoi','nga','nang'].forEach(function(k){ if(detectVietnameseTone(ms[k])!==k) tmBad.push(ms[k]+'!='+k); });
}
T('TONE_MATCH_SETS forms match their tone', tmBad.length===0, tmBad.join(' | '));
T('toneDifficulty default = medium', (getSettings().toneDifficulty||'medium')==='medium');

// ---- checkVietnamese (strict default) ----
T('checkVi exact', checkVietnamese('tôi','tôi')===true);
T('checkVi trims/case', checkVietnamese('  Tôi ','tôi')===true);
T('checkVi strict rejects no-diacritic', checkVietnamese('toi','tôi')===false);
localStorage.setItem('vn_settings_v1', JSON.stringify({acceptNoDiacritics:true}));
T('checkVi loose accepts no-diacritic', checkVietnamese('toi','tôi')===true);
localStorage.removeItem('vn_settings_v1');

// ---- checkEnglish ----
T('checkEn me', checkEnglish('me',['I, me'])===true);
T('checkEn house', checkEnglish('house',['house; home; dwelling'])===true);
T('checkEn to be', checkEnglish('to be',['to be'])===true);
T('checkEn water', checkEnglish('water',['water'])===true);
T('checkEn typo hous', checkEnglish('hous',['house'])===true);
T('checkEn reject wrong', checkEnglish('zzzz',['water'])===false);
T('checkEn stopword not match', checkEnglish('a',['a friend'])===false);
T('checkEn stem complete->completed', checkEnglish('complete',['having completed this action, perfect aspect','having reached this state'])===true);
T('checkEn stem arrived->arrive', checkEnglish('arrived',['to arrive, to come'])===true);
T('checkEn short word no false stem', checkEnglish('cat',['category'])===false);
T('checkEn still rejects unrelated', checkEnglish('zzzz',['water; to water'])===false);

// ---- levenshtein ----
T('lev same', levenshtein('abc','abc')===0);
T('lev one', levenshtein('abc','abd')===1);

// ---- _speechVerdict (Speak tab ASR grading) ----
T('speech exact match', _speechVerdict('tôi','tôi')==='good');
T('speech diacritic-stripped still good (ASR often drops tone marks)', _speechVerdict('toi','tôi')==='good');
T('speech case/whitespace insensitive', _speechVerdict('  TÔI  ','tôi')==='good');
T('speech punctuation ignored', _speechVerdict('tôi.','tôi')==='good');
T('speech whole-sentence diacritic-dropped transcript still good', _speechVerdict('Hom nay toi di hoc','Hôm nay tôi đi học')==='good');
T('speech single-letter mishearing -> close, not good', _speechVerdict('tom','tôi')==='close');
T('speech one-word substitution in a sentence -> close', _speechVerdict('Tôi là xinh viên','Tôi là sinh viên')==='close');
T('speech way off -> off', _speechVerdict('xin chào','tôi')==='off');
T('speech empty transcript -> off', _speechVerdict('','tôi')==='off');
T('speech whitespace-only transcript -> off', _speechVerdict('   ','tôi')==='off');

// ---- FSRS (rating is now 1..4 = Again/Hard/Good/Easy, not a boolean) ----
var nowMs=Date.now();
var p=fsrsUpdate(null,GOOD);
T('fsrs good-rating shape', p && p.S>0 && p.nextReview>nowMs && p.reps===1 && p.lapses===0, JSON.stringify(p));
var f=fsrsUpdate(null,AGAIN);
T('fsrs again-rating lapse', f && f.lapses===1);
T('fsrs again-rating interval < good-rating interval', (f.nextReview-nowMs) < (p.nextReview-nowMs));
var p2=fsrsUpdate(p,GOOD);
T('fsrs recall grows stability', p2.S>=p.S, 'p.S='+p.S+' p2.S='+p2.S);

// Hard/Easy actually change outcomes relative to Good, from identical prior state
var base={D:5,S:10,lastReview:nowMs-5*DAY_MS,nextReview:nowMs,reps:3,lapses:0};
var rHard=fsrsUpdate(base,HARD), rGood=fsrsUpdate(base,GOOD), rEasy=fsrsUpdate(base,EASY);
T('fsrs Hard grows stability less than Good', rHard.S<rGood.S, 'hard='+rHard.S+' good='+rGood.S);
T('fsrs Easy grows stability more than Good', rEasy.S>rGood.S, 'easy='+rEasy.S+' good='+rGood.S);
T('fsrs Easy lowers difficulty vs Good', rEasy.D<rGood.D, 'easy.D='+rEasy.D+' good.D='+rGood.D);
T('fsrs Hard raises difficulty vs Good', rHard.D>rGood.D, 'hard.D='+rHard.D+' good.D='+rGood.D);
T('fsrs Again raises difficulty most', fsrsUpdate(base,AGAIN).D>rHard.D);
// difficulty stays within FSRS's [1,10] clamp even after repeated Again at the ceiling
var dCeil={D:10,S:1,lastReview:nowMs-DAY_MS,nextReview:nowMs,reps:1,lapses:0};
T('fsrs difficulty clamped at 10', fsrsUpdate(dCeil,AGAIN).D<=10);

// ---- inferRating (Again/Hard/Good/Easy from automatic grading, no UI buttons) ----
localStorage.removeItem('vn_latency_v1');
T('inferRating wrong answer is always Again', inferRating(false,{retried:false,latencyMs:1,bucket:'x'})===AGAIN);
T('inferRating wrong answer is Again even if fast', inferRating(false,{latencyMs:1,bucket:'x'})===AGAIN);
T('inferRating retried correct caps at Hard regardless of speed', inferRating(true,{retried:true,latencyMs:1,bucket:'x'})===HARD);
T('inferRating with no bucket/latency defaults to Good', inferRating(true,{})===GOOD);
// Build a personal baseline (~1000ms) for a fresh bucket, then check classification
localStorage.removeItem('vn_latency_v1');
for (var i=0;i<10;i++) inferRating(true,{latencyMs:1000,bucket:'test-bucket'});
T('inferRating much faster than baseline -> Easy', inferRating(true,{latencyMs:200,bucket:'test-bucket'})===EASY);
T('inferRating much slower than baseline -> Hard', inferRating(true,{latencyMs:2000,bucket:'test-bucket'})===HARD);
T('inferRating near baseline -> Good', inferRating(true,{latencyMs:1000,bucket:'test-bucket'})===GOOD);
// Before warmup, even a very fast/slow answer just grades Good
localStorage.removeItem('vn_latency_v1');
inferRating(true,{latencyMs:1000,bucket:'fresh-bucket'});
T('inferRating before warmup ignores latency -> Good', inferRating(true,{latencyMs:1,bucket:'fresh-bucket'})===GOOD);
// Separate buckets don't cross-contaminate each other's baseline
localStorage.removeItem('vn_latency_v1');
for (var i=0;i<10;i++) inferRating(true,{latencyMs:5000,bucket:'slow-typist-task'});
T('inferRating buckets are independent', inferRating(true,{latencyMs:200,bucket:'other-task'})===GOOD);
localStorage.removeItem('vn_latency_v1');

// ---- recordAnswer / getCardData / isNew ----
localStorage.clear();
T('isNew before', isNew('w1','vi-en')===true);
recordAnswer('w1','vi-en',true);
T('card after record', getCardData('w1','vi-en')!==null);
T('isNew after', isNew('w1','vi-en')===false);
var st=getStats(); T('stats reviewed counts', st.reviewed>=1, JSON.stringify(st));

// ---- accepted-answer override store ----
localStorage.removeItem('vn_accepted_v1');
T('accepted empty initially', getAcceptedAnswers('wx','vi-en').length===0);
addAcceptedAnswer('wx','vi-en','finished');
T('accepted stored', getAcceptedAnswers('wx','vi-en').indexOf('finished')>=0);
addAcceptedAnswer('wx','vi-en','finished');
T('accepted dedupes (case-insensitive)', getAcceptedAnswers('wx','vi-en').length===1);
T('accepted makes checkEnglish pass', checkEnglish('finished', ['something else'].concat(getAcceptedAnswers('wx','vi-en')))===true);

// ---- getNewCards ----
localStorage.clear();
var words=[{id:'a',word:'a'},{id:'b',word:'b'},{id:'c',word:'c'}];
var nc=getNewCards(words,10,true);
T('getNewCards returns new', Array.isArray(nc) && nc.length>=1 && nc[0].direction==='vi-en', JSON.stringify(nc.length));
T('getDueCards array', Array.isArray(getDueCards(words)));
// en→vi promotions interleave once a word has been passed vi→en
localStorage.clear();
recordAnswer('a','vi-en',true);
var nc2=getNewCards(words,10,true);
T('getNewCards interleaves en→vi promotion', nc2.some(c=>c.direction==='en-vi'&&c.word.id==='a') && nc2.some(c=>c.direction==='vi-en'), JSON.stringify(nc2.map(c=>c.word.id+'/'+c.direction)));
// setting off → no en→vi
localStorage.setItem('vn_settings_v1', JSON.stringify({bothDirections:false}));
var nc3=getNewCards(words,10,true);
T('bothDirections off → no en→vi', !nc3.some(c=>c.direction==='en-vi'), JSON.stringify(nc3.map(c=>c.direction)));
localStorage.removeItem('vn_settings_v1');

// ---- cloze/grammar blanking ----
T('clozeBlank found', /cz-blank/.test(_clozeBlank('Tôi là sinh viên.','là')||''));
T('clozeBlank null when absent', _clozeBlank('abc def','xyz')===null);
T('grBlank found', /cz-blank/.test(_grBlank('Tôi là sinh viên.','là')||''));

// ---- GRAMMAR data integrity: every example's blank must be cloze-able ----
var grBad=[];
for (var i=0;i<GRAMMAR.length;i++){ var g=GRAMMAR[i];
  if(!g.id||!g.title||!g.explain||!g.examples||!g.examples.length){ grBad.push(g.id+':struct'); continue; }
  for (var j=0;j<g.examples.length;j++){ var ex=g.examples[j];
    if(!ex.vi||!ex.en||!ex.blank){ grBad.push(g.id+':ex-fields'); continue; }
    if(_grBlank(ex.vi, ex.blank)===null) grBad.push(g.id+': "'+ex.blank+'" not in "'+ex.vi+'"');
  }
}
T('GRAMMAR all blanks cloze-able ('+GRAMMAR.length+' points)', grBad.length===0, grBad.join(' | '));

// ---- CHUNKS data integrity: every example must contain its own chunk verbatim ----
var chBad=[], chIds={};
for (var i=0;i<CHUNKS.length;i++){ var c=CHUNKS[i];
  if(!c.id||!c.chunk||!c.en||!c.examples||!c.examples.length){ chBad.push((c.id||'?')+':struct'); continue; }
  if(chIds[c.id]) chBad.push(c.id+': duplicate id');
  chIds[c.id]=true;
  for (var j=0;j<c.examples.length;j++){ var ex=c.examples[j];
    if(!ex.vi||!ex.en){ chBad.push(c.id+':ex-fields'); continue; }
    if(_chunkBlank(ex.vi, c.chunk)===null) chBad.push(c.id+': "'+c.chunk+'" not found (or not a discrete token span) in "'+ex.vi+'"');
  }
  // a chunk should be more than one word -- a single-word entry belongs in
  // Vocab/Grammar instead, and would signal a mis-curated entry here
  if (c.chunk.trim().indexOf(' ') < 0) chBad.push(c.id+': "'+c.chunk+'" is a single word, not a multi-word chunk');
}
T('CHUNKS all blanks cloze-able ('+CHUNKS.length+' chunks)', chBad.length===0, chBad.join(' | '));

// No chunk should exactly duplicate a GRAMMAR blank target -- that would
// mean the same drill item exists (and gets independently SRS-scheduled)
// in two different tabs, which is redundant rather than additive.
var grBlanks={};
for (var i=0;i<GRAMMAR.length;i++){ GRAMMAR[i].examples.forEach(function(ex){ grBlanks[ex.blank]=true; }); }
var chOverlap = CHUNKS.filter(function(c){ return grBlanks[c.chunk]; }).map(function(c){ return c.chunk; });
T('CHUNKS do not duplicate a GRAMMAR blank target', chOverlap.length===0, chOverlap.join(' | '));

// ---- SEGMENT_SETS data integrity ----
// Each set's forms should be genuine minimal pairs: same tone, and either
// the same rime after a consonant-initial key, or the same consonant frame
// around a vowel-family key. This is a mechanical proxy — it can't verify
// the words are real/correctly-glossed (done by hand against data/vocab.json
// and dictionary sources), but it does catch a mismatched tone or a typo'd
// rime/vowel, which would silently break the "only the target sound differs"
// premise the whole drill depends on.
var U_VARIANTS = ['u','ù','ú','ủ','ũ','ụ'];
var UH_VARIANTS = ['ư','ừ','ứ','ử','ữ','ự'];
var sgBad=[];
for (var i=0;i<SEGMENT_SETS.length;i++){ var set=SEGMENT_SETS[i];
  if(!set.id||!set.contrast||!set.forms||set.forms.length<2){ sgBad.push(set.id+':struct'); continue; }
  var tones=[], rimes=[];
  var isVowelSet = /^u-uh-/.test(set.id);
  for (var j=0;j<set.forms.length;j++){ var f=set.forms[j];
    if(!f.key||!f.word||!f.en){ sgBad.push(set.id+':form-fields'); continue; }
    tones.push(detectVietnameseTone(f.word));
    if (isVowelSet) {
      var variants = f.key==='ư' ? UH_VARIANTS : (f.key==='u' ? U_VARIANTS : null);
      if (!variants) { sgBad.push(set.id+': unexpected vowel key "'+f.key+'"'); continue; }
      var found = null;
      for (var k=0;k<variants.length;k++){ if (f.word.indexOf(variants[k])>=0){ found=variants[k]; break; } }
      if (!found) { sgBad.push(set.id+': "'+f.word+'" has no '+f.key+'-family vowel'); continue; }
      var otherFamily = f.key==='ư' ? U_VARIANTS : UH_VARIANTS;
      var frame = f.word.split(found).join('#');
      rimes.push(frame);
      for (var k2=0;k2<otherFamily.length;k2++){
        if (f.word.indexOf(otherFamily[k2])>=0) sgBad.push(set.id+': "'+f.word+'" also contains the other vowel family');
      }
    } else {
      if (f.word.indexOf(f.key)!==0) { sgBad.push(set.id+': "'+f.word+'" does not start with key "'+f.key+'"'); continue; }
      rimes.push(f.word.slice(f.key.length));
    }
  }
  if (tones.length && tones.some(function(t){return t!==tones[0];})) sgBad.push(set.id+': tone mismatch across forms ('+tones.join(',')+')');
  if (rimes.length && rimes.some(function(r){return r!==rimes[0];})) sgBad.push(set.id+': rime/frame mismatch across forms ('+rimes.join(',')+')');
}
T('SEGMENT_SETS forms are true minimal pairs ('+SEGMENT_SETS.length+' sets)', sgBad.length===0, sgBad.join(' | '));

// Every word used in the drill must actually be tokenizable/renderable by
// the app's own Vietnamese-text helpers, and every set must offer at least
// 2 distinct choices (fewer would make the multiple-choice UI degenerate).
var sgBad2=[];
for (var i=0;i<SEGMENT_SETS.length;i++){ var set=SEGMENT_SETS[i];
  var keys = set.forms.map(function(f){return f.key;});
  if (new Set(keys).size !== keys.length) sgBad2.push(set.id+': duplicate keys');
  if (set.forms.length < 2) sgBad2.push(set.id+': fewer than 2 choices');
  set.forms.forEach(function(f){ if (typeof f.word!=='string' || !f.word.trim()) sgBad2.push(set.id+': empty word'); });
}
T('SEGMENT_SETS choices well-formed', sgBad2.length===0, sgBad2.join(' | '));

// ---- PRIMARY_MEANING sanity ----
var pmBad=[];
for (var key in PRIMARY_MEANING){ if(!key || typeof PRIMARY_MEANING[key]!=='string' || !PRIMARY_MEANING[key].trim()) pmBad.push(key); }
T('PRIMARY_MEANING well-formed', pmBad.length===0, pmBad.join(','));

// ---- vocab self-consistency: typing the primary meaning is accepted; tone detect doesn't crash ----
var selfBad=[], toneBad=[];
var sample = __VOCAB__.slice(0, 400);
for (var i=0;i<sample.length;i++){ var w=sample[i];
  var m0=(w.meanings||[])[0];
  if(m0){ var frag=m0.split(/[\/;,(]/)[0].trim();
    if(frag && !checkEnglish(frag, w.meanings)) selfBad.push(w.word+'='+frag); }
  if(!/\s/.test(w.word)){ var t=detectVietnameseTone(w.word);
    if(['ngang','huyen','sac','hoi','nga','nang'].indexOf(t)<0) toneBad.push(w.word); }
}
T('vocab primary meaning self-accepts (sample 400)', selfBad.length===0, selfBad.slice(0,6).join(' | '));
T('vocab tone detect valid (sample 400)', toneBad.length===0, toneBad.slice(0,6).join(' | '));

// apply PRIMARY_MEANING override and confirm tôi/là fixed
var byw={}; for (var i=0;i<__VOCAB__.length;i++) byw[__VOCAB__[i].word]=__VOCAB__[i];
function firstAfterOverride(word){ var w=byw[word]; if(!w) return null; var pm=PRIMARY_MEANING[word];
  if(!pm) return w.meanings[0]; var rest=w.meanings.filter(function(m){return m.trim().toLowerCase()!==pm.toLowerCase();}); return [pm].concat(rest)[0]; }
T('override tôi -> I, me', firstAfterOverride('tôi')==='I, me', firstAfterOverride('tôi'));
T('override là -> to be', firstAfterOverride('là')==='to be', firstAfterOverride('là'));
T('override đã concise', firstAfterOverride('đã')==='already; did (past/completed marker)', firstAfterOverride('đã'));

// ---- Plan (stage-aware, scaling) ----
var basePlan=[{tab:'a',minutes:4},{tab:'b',minutes:10},{tab:'c',minutes:5},{tab:'d',minutes:7},{tab:'e',minutes:4}];
T('scalePlan sums to 30', _scalePlan(basePlan,30).reduce(function(a,s){return a+s.minutes;},0)===30);
T('scalePlan sums to 45', _scalePlan(basePlan,45).reduce(function(a,s){return a+s.minutes;},0)===45);
T('scalePlan sums to 20', _scalePlan(basePlan,20).reduce(function(a,s){return a+s.minutes;},0)===20);
T('scalePlan keeps zeroed segments', _scalePlan([{tab:'a',minutes:0},{tab:'b',minutes:10}],30).filter(function(s){return s.minutes===0;}).length===1);
var stg=_stagePlan();
T('stagePlan well-formed', Array.isArray(stg)&&stg.length>0&&stg.every(function(s){return s.tab&&s.minutes>0&&s.label;}));
T('stagePlan base sums 30', stg.reduce(function(a,s){return a+s.minutes;},0)===30);
var op=optimalPlan(); var goal=getSettings().dailyGoalMins||30;
T('optimalPlan sums to daily goal', op.reduce(function(a,s){return a+s.minutes;},0)===goal, 'goal='+goal+' got='+op.reduce(function(a,s){return a+s.minutes;},0));
var VALID={tones:1,vocab:1,grammar:1,cloze:1,listening:1,reader:1,basics:1};
T('optimalPlan tabs all valid', op.every(function(s){return VALID[s.tab];}));

JSON.stringify(RESULTS);
"""

ctx = quickjs.Context()
src = PREAMBLE + "\n"
for f in FILES:
    src += open(os.path.join(ROOT, f), encoding="utf-8").read() + "\n"
vocab_full = json.load(open(os.path.join(ROOT, "data/vocab.json"), encoding="utf-8"))
src += "var __VOCAB__ = " + json.dumps(vocab_full[:600], ensure_ascii=False) + ";\n"
src += TESTS

try:
    out = ctx.eval(src)
    results = json.loads(out)
except Exception as e:
    print("HARNESS ERROR:", str(e)[:800])
    raise SystemExit(1)

passed = [r for r in results if r["pass"]]
failed = [r for r in results if not r["pass"]]
print(f"JS LOGIC TESTS: {len(passed)}/{len(results)} passed")
for r in failed:
    print(f"  FAIL: {r['name']}  -- {r['detail']}")

# ---- Python-side data integrity ----
print("\nDATA INTEGRITY:")
dfail = 0
def chk(name, cond, detail=""):
    global dfail
    print(f"  {'ok  ' if cond else 'FAIL'} {name}" + ("" if cond else f"  -- {detail}"))
    if not cond: dfail += 1

vocab = vocab_full
ids = [w.get("id") or w["word"].lower() for w in vocab]
chk("vocab non-empty", len(vocab) > 3000, str(len(vocab)))
chk("all have word", all(w.get("word") for w in vocab))
chk("all have non-empty meanings", all(w.get("meanings") and all(m.strip() for m in w["meanings"]) for w in vocab))
chk("all meanings are strings", all(all(isinstance(m, str) for m in w["meanings"]) for w in vocab))
chk("ids unique", len(set(ids)) == len(ids), f"{len(ids)-len(set(ids))} dupes")
chk("all have rank", all("rank" in w for w in vocab))

sents = json.load(open(os.path.join(ROOT, "data/sentences.json"), encoding="utf-8"))
chk("sentences non-empty", len(sents) > 1000, str(len(sents)))
chk("sentences have vi & en", all(s.get("vi") and s.get("en") for s in sents[:2000]))

# index.html references every js file that exists, and vice versa
import re
html = open(os.path.join(ROOT, "index.html"), encoding="utf-8").read()
referenced = set(re.findall(r'src="(js/[^"]+)"', html))
on_disk = set("js/" + f for f in os.listdir(os.path.join(ROOT, "js")) if f.endswith(".js"))
chk("all js files referenced in index.html", on_disk <= referenced, str(on_disk - referenced))
chk("no dangling script refs", referenced <= on_disk, str(referenced - on_disk))

# service worker precaches every js file
sw = open(os.path.join(ROOT, "sw.js"), encoding="utf-8").read()
sw_missing = [f for f in on_disk if f not in sw]
chk("service worker precaches all js", not sw_missing, str(sw_missing))

# Every `this.el.<name>` access must have a matching key in some `this.el = {…}`
# literal in the same file (catches DOM-wiring typos like the tones `feedback`
# bug the JS harness can't see without a real DOM).
for jf in sorted(on_disk):
    src = open(os.path.join(ROOT, jf), encoding="utf-8").read()
    if "this.el = {" not in src:
        continue
    keys = set()
    for block in re.findall(r"this\.el\s*=\s*\{(.*?)\}", src, re.S):
        keys |= set(re.findall(r"(\w+)\s*:", block))
    used = set(re.findall(r"this\.el\.(\w+)\b", src))
    missing = sorted(u for u in used if u not in keys)
    chk(f"{jf}: all this.el.* are defined", not missing, f"undefined: {missing}")

print(f"\nSUMMARY: JS {len(passed)}/{len(results)} | data {'all ok' if dfail==0 else str(dfail)+' failed'}")
raise SystemExit(1 if (failed or dfail) else 0)
