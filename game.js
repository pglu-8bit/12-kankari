(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var svg = $('board'), NS = 'http://www.w3.org/2000/svg';
  var rings = [210,150,90], ys = [165,115,65], cx = 260, cy = 210;
  var dx = [-1,0,1,1,1,0,-1,-1], dy = [-1,-1,-1,0,1,1,1,0];
  function px(p) { return cx + dx[p % 8] * rings[Math.floor(p / 8)]; }
  function py(p) { return cy + dy[p % 8] * ys[Math.floor(p / 8)]; }
  function el(name, attrs, parent) {
    var node = document.createElementNS(NS, name);
    Object.keys(attrs || {}).forEach(function (k) { node.setAttribute(k, attrs[k]); });
    if (parent) parent.appendChild(node);
    return node;
  }
  var adj = [], mills = [];
  for (var p = 0; p < 24; p++) {
    var r = Math.floor(p / 8), k = p % 8;
    adj[p] = [r * 8 + (k + 1) % 8, r * 8 + (k + 7) % 8];
    if (r) adj[p].push((r - 1) * 8 + k);
    if (r < 2) adj[p].push((r + 1) * 8 + k);
  }
  for (var rr = 0; rr < 3; rr++) for (var s = 0; s < 8; s += 2)
    mills.push([rr * 8 + s, rr * 8 + (s + 1) % 8, rr * 8 + (s + 2) % 8]);
  for (var kk = 0; kk < 8; kk++) mills.push([kk, 8 + kk, 16 + kk]);

  var board = Array(24).fill(0), hand = [0,12,12], side = 1, me = 1;
  var selected = -1, captureRemaining = 0, ended = false, busy = false, paused = false;
  var wins = 0, level = 1, total = 0, computerTimer = null;
  var yt = window.ytgame;
  var posCount = {}, quiet = 0, captureHappened = false, note = '', hitEls = [];

  // Five difficulties, 20 levels each (levels 1-100 overall).
  var TIERS = ['Beginner', 'Novice', 'Skilled', 'Master', 'Maharaja'], PER = 20;
  function tierOf(l) { return Math.floor((l - 1) / PER); }

  function makeBoard() {
    svg.innerHTML = '<defs><radialGradient id="gP"><stop stop-color="#fff"/><stop offset="1" stop-color="#e3d6b8"/></radialGradient><radialGradient id="gC"><stop stop-color="#ff8a5c"/><stop offset="1" stop-color="#6b0a05"/></radialGradient></defs>';
    var lines = el('g',{stroke:'var(--line)','stroke-width':3,fill:'none','stroke-linecap':'round'},svg);
    for (var i=0;i<3;i++) el('rect',{x:cx-rings[i],y:cy-ys[i],width:rings[i]*2,height:ys[i]*2,rx:4},lines);
    for (i=0;i<8;i++) el('line',{x1:px(i),y1:py(i),x2:px(16+i),y2:py(16+i)},lines);
    var dots=el('g',{},svg), hits=el('g',{},svg);
    for(i=0;i<24;i++) {
      el('circle',{cx:px(i),cy:py(i),r:11,fill:'#052f38',stroke:'#ffc83d','stroke-width':2},dots);
      el('circle',{cx:px(i),cy:py(i),r:4,fill:'#ff7a18'},dots);
      (function(idx){var h=el('circle',{cx:px(idx),cy:py(idx),r:25,fill:'transparent',tabindex:idx===9?0:-1,role:'button','aria-label':'Board point '+(idx+1)},hits);
        h.addEventListener('click',function(){onPoint(idx);});
        hitEls[idx]=h;
        h.addEventListener('keydown',function(e){
          if(e.key==='Enter'||e.key===' '){e.preventDefault();onPoint(idx);return;}
          var v={ArrowRight:[1,0],ArrowLeft:[-1,0],ArrowDown:[0,1],ArrowUp:[0,-1]}[e.key];
          if(!v)return;e.preventDefault();
          var best=-1,bc=1e9;
          for(var q=0;q<24;q++){if(q===idx)continue;var ddx=px(q)-px(idx),ddy=py(q)-py(idx),along=ddx*v[0]+ddy*v[1],perp=Math.abs(ddx*v[1]-ddy*v[0]);
            if(along<=0)continue;var cost=along+2*perp;if(cost<bc){bc=cost;best=q;}}
          if(best>=0){hitEls.forEach(function(n){n.setAttribute('tabindex','-1');});hitEls[best].setAttribute('tabindex','0');hitEls[best].focus();}
        });
      })(i);
    }
  }
  function isMill(b,p,who) { return mills.some(function(m){return m.indexOf(p)>=0&&m.every(function(q){return b[q]===who;});}); }
  function completedMills(b,p,who) { return mills.filter(function(m){return m.indexOf(p)>=0&&m.every(function(q){return b[q]===who;});}); }
  function newlyMadeMills(before,p,who) {
    return completedMills(board,p,who).filter(function(m){return !m.every(function(q){return before[q]===who;});}).length;
  }
  function totalPieces(who) { return hand[who]+board.filter(function(x){return x===who;}).length; }
  // Stones inside a Tigadi are protected. If ALL of a player's stones are in Tigadis,
  // this list is empty and the Tigadi captures nothing.
  function targets(who) {
    var safe=[];
    board.forEach(function(x,p){if(x===who&&!isMill(board,p,who))safe.push(p);});
    return safe;
  }
  function moves(who) {
    var out=[];
    if(hand[who]>0) board.forEach(function(x,p){if(!x)out.push({from:-1,to:p});});
    else board.forEach(function(x,p){if(x===who)adj[p].forEach(function(q){if(!board[q])out.push({from:p,to:q});});});
    return out;
  }
  function render() {
    var old=svg.querySelector('#stones');if(old)old.remove();
    var g=el('g',{id:'stones','pointer-events':'none'},svg);
    board.forEach(function(who,p){if(!who)return;
      var stone=el('g',{transform:'translate('+px(p)+','+py(p)+')',class:who===1?'peb ivory':'peb sindoor'},g);
      el('circle',{r:21,fill:who===1?'url(#gP)':'url(#gC)',stroke:'#ffc83d','stroke-width':2},stone);
      el('circle',{r:3,fill:who===1?'#c8321f':'#ffe9a8'},stone);
    });
    var h=svg.querySelector('#hints');if(h)h.remove();h=el('g',{id:'hints','pointer-events':'none'},svg);
    if(captureRemaining) {
      targets(3-me).forEach(function(p){el('circle',{cx:px(p),cy:py(p),r:27,fill:'none',stroke:'#ff6f5e','stroke-width':4},h);});
    } else if(!ended&&!busy&&side===me&&!hand[me]) {
      board.forEach(function(who,from){
        if(who!==me)return;
        var destinations=adj[from].filter(function(to){return !board[to];});
        if(!destinations.length)return;
        el('circle',{cx:px(from),cy:py(from),r:selected===from?27:23,fill:'none',stroke:selected===from?'#ffd166':'rgba(255,209,102,0.65)','stroke-width':selected===from?4:2},h);
        destinations.forEach(function(to){el('circle',{cx:px(to),cy:py(to),r:selected===from?11:7,fill:'#ffd166',opacity:selected===from?1:0.68},h);});
      });
    } else if(selected>=0) el('circle',{cx:px(selected),cy:py(selected),r:27,fill:'none',stroke:'#ffd166','stroke-width':4},h);
    updateUI();
  }
  function say(text){$('status').innerHTML=text;}
  function updateUI(){
    for(var p=1;p<=2;p++){
      $('s'+p).textContent=totalPieces(p);$('n'+p).textContent=(p===me?'You':'Computer')+' · '+(p===1?'Ivory':'Sindoor');
      $('h'+p).textContent=hand[p]?hand[p]+' left to place':'all placed';$('card'+p).classList.toggle('turn',!ended&&side===p);
    }
    $('stats').textContent='Wins: '+wins+' · Total score: '+total;
    var t=tierOf(level);
    $('lvl').textContent=TIERS[t]+' · Level '+(level-t*PER)+' / '+PER;
  }

  // Sound starts OFF (muted). The player turns it on with the Sound button.
  var audio=new Audio();audio.loop=true;audio.preload='auto';audio.volume=0.45;
  audio.muted=true;
  audio.src=new URL('assets/music.mp3',document.baseURI).href;
  var soundOn=false;
  function startAudio(){if(!soundOn||paused)return;var play=audio.play();if(play&&play.catch)play.catch(function(){});}
  function startFromGesture(e){if(e&&e.target&&e.target.closest&&e.target.closest('#mute,#mute2'))return;startAudio();}
  document.addEventListener('pointerdown',startFromGesture);document.addEventListener('keydown',startFromGesture);
  function stopAudio(){audio.pause();}
  function applyMasterVolume(){var c=getCtx.ctx;if(c&&getCtx.master){var g=getCtx.master.gain;g.cancelScheduledValues(c.currentTime);g.setValueAtTime(soundOn?1:0,c.currentTime);}}
  // One switch for everything: music, effects already scheduled, and later effects.
  function setSound(on){soundOn=!!on;audio.muted=!soundOn;applyMasterVolume();if(soundOn)startAudio();else stopAudio();var m=$('mute');m.textContent=soundOn?'🔊 Sound: On':'🔇 Sound: Off';m.setAttribute('aria-pressed',String(!soundOn));var m2=$('mute2');if(m2){m2.textContent=soundOn?'🔊':'🔇';m2.setAttribute('aria-pressed',String(!soundOn));}}
  function getCtx(){
    var AC=window.AudioContext||window.webkitAudioContext;if(!AC)return null;
    var ctx=getCtx.ctx;if(!ctx){ctx=getCtx.ctx=new AC();getCtx.master=ctx.createGain();getCtx.master.gain.value=soundOn?1:0;getCtx.master.connect(ctx.destination);}
    if(ctx.state==='suspended')ctx.resume();return ctx;
  }
  function playTone(freq,duration){
    if(!soundOn||paused)return;
    try{var ctx=getCtx();if(!ctx)return;var osc=ctx.createOscillator(),gain=ctx.createGain();
      osc.frequency.value=freq;gain.gain.setValueAtTime(0.08,ctx.currentTime);gain.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+duration);osc.connect(gain);gain.connect(getCtx.master);osc.start();osc.stop(ctx.currentTime+duration);
    }catch(e){}
  }
  // Applause: a few short bursts of filtered noise.
  function playClap(){
    if(!soundOn||paused)return;
    try{var ctx=getCtx();if(!ctx)return;
      for(var i=0;i<4;i++){
        var t=ctx.currentTime+i*0.11,len=Math.floor(ctx.sampleRate*0.07),buf=ctx.createBuffer(1,len,ctx.sampleRate),d=buf.getChannelData(0);
        for(var j=0;j<len;j++)d[j]=(Math.random()*2-1)*Math.pow(1-j/len,2);
        var src=ctx.createBufferSource(),bp=ctx.createBiquadFilter(),gain=ctx.createGain();
        src.buffer=buf;bp.type='bandpass';bp.frequency.value=1800+i*150;bp.Q.value=0.8;gain.gain.value=0.9;
        src.connect(bp);bp.connect(gain);gain.connect(getCtx.master);src.start(t);
      }
    }catch(e){}
  }
  function playSad(){playTone(330,0.22);setTimeout(function(){playTone(262,0.35);},200);}

  // NEW: cracker "pop" sound (a short low-passed noise burst), follows the Sound button.
  function playCracker(){
    if(!soundOn||paused)return;
    try{var ctx=getCtx();if(!ctx)return;
      var len=Math.floor(ctx.sampleRate*0.25),buf=ctx.createBuffer(1,len,ctx.sampleRate),d=buf.getChannelData(0);
      for(var j=0;j<len;j++)d[j]=(Math.random()*2-1)*Math.pow(1-j/len,3);
      var src=ctx.createBufferSource(),lp=ctx.createBiquadFilter(),gain=ctx.createGain();
      src.buffer=buf;lp.type='lowpass';lp.frequency.value=1200+Math.random()*1200;gain.gain.value=0.7;
      src.connect(lp);lp.connect(gain);gain.connect(getCtx.master);src.start();
    }catch(e){}
  }

  // NEW: fireworks / crackers shown when the player wins.
  var fwCanvas=null,fwRaf=0,fwTimers=[];
  function stopFireworks(){
    if(fwRaf)cancelAnimationFrame(fwRaf);fwRaf=0;
    fwTimers.forEach(clearTimeout);fwTimers=[];
    if(fwCanvas){
      try{if(fwCanvas.hidePopover)fwCanvas.hidePopover();}catch(e){}
      if(fwCanvas.parentNode)fwCanvas.parentNode.removeChild(fwCanvas);
      fwCanvas=null;
    }
  }
  function fireworks(){
    stopFireworks();
    if(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
    var cv=document.createElement('canvas');
    cv.setAttribute('aria-hidden','true');
    var st=cv.style;
    st.position='fixed';st.left='0';st.top='0';st.width='100%';st.height='100%';
    st.border='0';st.padding='0';st.margin='0';st.background='transparent';st.overflow='visible';
    st.pointerEvents='none';st.zIndex='9999';
    // Popover puts the canvas in the top layer, so it shows above the "You win" dialog.
    if('popover' in cv)cv.setAttribute('popover','manual');
    document.body.appendChild(cv);
    try{if(cv.showPopover)cv.showPopover();}catch(e){}
    fwCanvas=cv;
    var dpr=window.devicePixelRatio||1,W=window.innerWidth,H=window.innerHeight;
    cv.width=W*dpr;cv.height=H*dpr;
    var c=cv.getContext('2d');c.scale(dpr,dpr);
    var parts=[],start=performance.now();
    function burst(){
      var x=W*(0.15+Math.random()*0.7),y=H*(0.12+Math.random()*0.4),hue=Math.floor(Math.random()*360);
      for(var i=0;i<70;i++){
        var a=Math.random()*Math.PI*2,sp=1+Math.random()*4.5;
        parts.push({x:x,y:y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp,life:1,decay:0.012+Math.random()*0.012,
          color:'hsl('+Math.floor((hue+Math.random()*40)%360)+',100%,60%)'});
      }
      playCracker();
    }
    burst();
    for(var b=1;b<10;b++)fwTimers.push(setTimeout(burst,b*350));
    function frame(now){
      c.clearRect(0,0,W,H);
      for(var i=parts.length-1;i>=0;i--){
        var q=parts[i];
        q.vx*=0.985;q.vy=q.vy*0.985+0.04;q.x+=q.vx;q.y+=q.vy;q.life-=q.decay;
        if(q.life<=0){parts.splice(i,1);continue;}
        c.globalAlpha=q.life;c.fillStyle=q.color;
        c.beginPath();c.arc(q.x,q.y,2.2,0,Math.PI*2);c.fill();
      }
      c.globalAlpha=1;
      if(!parts.length&&now-start>3800){stopFireworks();return;}
      fwRaf=requestAnimationFrame(frame);
    }
    fwRaf=requestAnimationFrame(frame);
  }

  function showReaction(emoji){
    var n=document.createElement('div');n.className='reaction';n.setAttribute('aria-hidden','true');n.textContent=emoji;
    document.body.appendChild(n);setTimeout(function(){if(n.parentNode)n.parentNode.removeChild(n);},1300);
  }

  // Computer skill rises with the level: at level 1 it plays mostly at random, at level 100 almost always the best move it can see.
  function smartChance(){return 0.1+0.85*(level-1)/99;}
  function scoreMove(m,who){
    var opp=3-who,b=board.slice();
    if(m.from>=0)b[m.from]=0;
    b[m.to]=who;
    var sc=Math.random()*2;
    mills.forEach(function(ml){
      if(ml.indexOf(m.to)<0)return;
      var mine=0,theirs=0;
      ml.forEach(function(q){if(q===m.to)return;if(board[q]===who&&q!==m.from)mine++;else if(board[q]===opp)theirs++;});
      if(mine===2)sc+=10;               // completes a Tigadi
      else if(theirs===2)sc+=6;         // blocks a rival Tigadi
      else if(mine===1&&theirs===0)sc+=1.5;
    });
    sc+=adj[m.to].filter(function(q){return !b[q];}).length*0.3;
    return sc;
  }
  function pickMove(options,who){
    if(Math.random()>=smartChance())return options[Math.floor(Math.random()*options.length)];
    var best=null,bs=-1e9;
    options.forEach(function(m){var sc=scoreMove(m,who);if(sc>bs){bs=sc;best=m;}});
    return best;
  }
  function pickCapture(choices,who){
    if(Math.random()>=smartChance())return choices[Math.floor(Math.random()*choices.length)];
    var victim=3-who,best=choices[0],bs=-1e9;
    choices.forEach(function(p){
      var sc=Math.random();
      mills.forEach(function(ml){
        if(ml.indexOf(p)<0)return;
        var own=0,enemy=0;
        ml.forEach(function(q){if(board[q]===victim)own++;else if(board[q]===who)enemy++;});
        if(enemy===0)sc+=own*2;
      });
      sc+=adj[p].filter(function(q){return !board[q];}).length*0.5;
      if(sc>bs){bs=sc;best=p;}
    });
    return best;
  }

  function endTurn(who){
    selected=-1;captureRemaining=0;
    var lead=note;note='';
    if(totalPieces(3-who)<=2)return finish(who===me?'win':'lose');
    side=3-who;
    if(!moves(side).length){if(!moves(who).length)return finish('draw');side=who;}
    // Draw rules: 100 turns without a capture, or the same position three times, once all stones are placed.
    if(captureHappened){posCount={};quiet=0;captureHappened=false;}
    else if(!hand[1]&&!hand[2])quiet++;
    if(quiet>=100)return finish('draw');
    if(!hand[1]&&!hand[2]){var key=board.join('')+side;posCount[key]=(posCount[key]||0)+1;if(posCount[key]>=3)return finish('draw');}
    render();
    if(side!==me){busy=true;say(lead+'The computer is thinking…');computerTimer=setTimeout(computerMove,450);}
    else{busy=false;say(lead+(hand[me]?'Your move. Place a stone on any empty point.':'Your move. Choose a stone, then an adjacent empty point.'));}
  }
  function resolveMove(who,from,to,before){
    var made=Math.min(2,newlyMadeMills(before,to,who));
    if(made>0&&who===me){playClap();showReaction('👏');}
    var eligible=targets(3-who);
    var captures=Math.min(made,eligible.length);
    if(captures>0&&who===me){captureRemaining=captures;say('<strong>Tigadi!</strong> Choose '+(captures===1?'one enemy stone':'two enemy stones')+' to capture.');render();return;}
    if(made>0&&who===me&&captures===0)note='<strong>Tigadi!</strong> All enemy stones are protected, so nothing is captured. ';
    // Computer captures one stone per newly formed Tigadi. Protected stones are never captured.
    var taken=0;
    while(captures>0){var choices=targets(3-who);if(!choices.length)break;board[pickCapture(choices,who)]=0;captures--;taken++;captureHappened=true;playTone(300,0.12);}
    if(taken>0&&who!==me){showReaction('😢');playSad();}
    render();endTurn(who);
  }
  function onPoint(p){
    if(ended||busy||paused||side!==me)return;
    if(captureRemaining>0){
      if(targets(3-me).indexOf(p)<0)return;
      board[p]=0;captureRemaining--;captureHappened=true;playTone(300,0.12);render();
      if(captureRemaining>0&&targets(3-me).length){say('<strong>Tigadi!</strong> Choose another enemy stone.');return;}
      captureRemaining=0;endTurn(me);return;
    }
    if(hand[me]>0){
      if(board[p])return;
      var before=board.slice();board[p]=me;hand[me]--;render();resolveMove(me,-1,p,before);return;
    }
    if(selected<0){if(board[p]===me&&adj[p].some(function(q){return !board[q];})){selected=p;render();}return;}
    if(p===selected){selected=-1;render();return;}
    if(board[p]===me){selected=p;render();return;}
    if(!board[p]&&adj[selected].indexOf(p)>=0){
      var from=selected,before=board.slice();board[from]=0;board[p]=me;selected=-1;render();resolveMove(me,from,p,before);
    }
  }
  function computerMove(){
    computerTimer=null;
    if(ended||paused||side===me)return;
    var options=moves(side),move=options.length?pickMove(options,side):null;
    if(!move){finish('draw');return;}
    var who=side,before=board.slice();
    if(move.from<0)hand[who]--;else board[move.from]=0;
    board[move.to]=who;playTone(520,0.12);render();resolveMove(who,move.from,move.to,before);
  }
  function finish(result){
    ended=true;busy=false;selected=-1;captureRemaining=0;
    var text=result==='win'?'Shabash! You win.':result==='lose'?'The computer wins this round.':'A draw.';
    var atTop=level%PER===0;
    if(result==='win'){wins++;var score=20*level+50*totalPieces(me);total+=score;if(!atTop)level++;text+=' Score: '+score+'.';}
    render();say('<strong>'+text+'</strong>');if(result!=='draw')playTone(result==='win'?660:220,0.35);
    setTimeout(function(){if(document.body.dataset.screen!=='game')return;$('overTitle').textContent=text;
      $('overText').textContent=result==='win'?(atTop?'You cleared the top level of this difficulty. Pick a harder difficulty for more.':'You earned points and advanced to the next level.'):'Start another match when you are ready.';
      var d=$('dlgOver');if(d.showModal)d.showModal();else d.setAttribute('open','');
      if(result==='win')fireworks(); // CHANGED: crackers burst on a win (started after the dialog so they show on top)
    },500);
  }
  function newGame(){
    stopFireworks(); // NEW: clear crackers when a new game starts
    if(computerTimer)clearTimeout(computerTimer);
    var d=$('dlgOver');if(d.open&&d.close)d.close();else d.removeAttribute('open');
    board=Array(24).fill(0);hand=[0,12,12];me=parseInt($('first').value,10)||1;side=1;selected=-1;captureRemaining=0;ended=false;busy=false;
    posCount={};quiet=0;captureHappened=false;note='';
    render();
    if(side!==me){busy=true;say('The computer plays first…');computerTimer=setTimeout(computerMove,600);}
    else say('Your move. Place a stone on any empty point.');
  }
  function openDialog(id){var d=$(id);if(d.showModal)d.showModal();else d.setAttribute('open','');}
  makeBoard();
  function setScreen(name){document.body.dataset.screen=name;}
  function startGame(){setScreen('game');newGame();}
  function goHome(){
    stopFireworks();if(computerTimer){clearTimeout(computerTimer);computerTimer=null;}
    ['dlgOver','dlgRules'].forEach(function(id){var d=$(id);if(d.open&&d.close)d.close();else d.removeAttribute('open');});
    busy=false;ended=true;updateUI();setScreen('menu');
  }
  $('new').addEventListener('click',startGame);$('restart').addEventListener('click',newGame);$('home').addEventListener('click',goHome);$('overHome').addEventListener('click',goHome);$('mute2').addEventListener('click',function(){setSound(!soundOn);});$('overAgain').addEventListener('click',newGame);
  $('diff').addEventListener('change',function(){level=parseInt(this.value,10)*PER+1;updateUI();});
  $('overView').addEventListener('click',function(){var d=$('dlgOver');if(d.close)d.close();else d.removeAttribute('open');});
  $('rulesBtn').addEventListener('click',function(){openDialog('dlgRules');});$('rulesBack').addEventListener('click',function(){var d=$('dlgRules');if(d.close)d.close();else d.removeAttribute('open');});
  $('langEn').addEventListener('click',function(){$('rulesHi').hidden=true;$('rulesEn').hidden=false;$('langEn').setAttribute('aria-pressed','true');$('langHi').setAttribute('aria-pressed','false');});
  $('langHi').addEventListener('click',function(){$('rulesHi').hidden=false;$('rulesEn').hidden=true;$('langEn').setAttribute('aria-pressed','false');$('langHi').setAttribute('aria-pressed','true');});
  $('mute').addEventListener('click',function(){setSound(!soundOn);});
  ['dlgRules','dlgOver'].forEach(function(id){$(id).addEventListener('click',function(e){if(e.target===this&&this.close)this.close();});});
  if(yt){try{yt.system.onPause(function(){paused=true;stopAudio();stopFireworks();});yt.system.onResume(function(){paused=false;if(!ended&&busy&&side!==me&&!computerTimer)computerTimer=setTimeout(computerMove,300);});
    // The platform can turn sound off, but it can no longer turn it on by itself.
    yt.system.onAudioEnabledChange(function(on){if(!on)setSound(false);});}catch(e){}}
  setSound(false); // sets the button label to "Sound: Off" on load
  render(); // first screen is the menu; the game starts when New Game is pressed
})();
