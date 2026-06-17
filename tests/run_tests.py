import json, os
import quickjs

import pathlib
ROOT = str(pathlib.Path(__file__).resolve().parent.parent)
FILES = ["js/data.js","js/sentences.js","js/srs.js","js/telex.js","js/vocab.js",
         "js/tones.js","js/cloze.js","js/grammar.js","js/plan.js"]

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

// ---- levenshtein ----
T('lev same', levenshtein('abc','abc')===0);
T('lev one', levenshtein('abc','abd')===1);

// ---- FSRS ----
var nowMs=Date.now();
var p=fsrsUpdate(null,true);
T('fsrs pass shape', p && p.S>0 && p.nextReview>nowMs && p.reps===1 && p.lapses===0, JSON.stringify(p));
var f=fsrsUpdate(null,false);
T('fsrs fail lapse', f && f.lapses===1);
T('fsrs fail interval < pass interval', (f.nextReview-nowMs) < (p.nextReview-nowMs));
var p2=fsrsUpdate(p,true);
T('fsrs recall grows stability', p2.S>=p.S, 'p.S='+p.S+' p2.S='+p2.S);

// ---- recordAnswer / getCardData / isNew ----
localStorage.clear();
T('isNew before', isNew('w1','vi-en')===true);
recordAnswer('w1','vi-en',true);
T('card after record', getCardData('w1','vi-en')!==null);
T('isNew after', isNew('w1','vi-en')===false);
var st=getStats(); T('stats reviewed counts', st.reviewed>=1, JSON.stringify(st));

// ---- getNewCards ----
localStorage.clear();
var words=[{id:'a',word:'a'},{id:'b',word:'b'},{id:'c',word:'c'}];
var nc=getNewCards(words,10,true);
T('getNewCards returns new', Array.isArray(nc) && nc.length>=1 && nc[0].direction==='vi-en', JSON.stringify(nc.length));
T('getDueCards array', Array.isArray(getDueCards(words)));

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

print(f"\nSUMMARY: JS {len(passed)}/{len(results)} | data {'all ok' if dfail==0 else str(dfail)+' failed'}")
raise SystemExit(1 if (failed or dfail) else 0)
