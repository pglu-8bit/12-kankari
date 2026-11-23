(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var svg = $('board');
  var NS = 'http://www.w3.org/2000/svg';
  var rings = [210, 150, 90], ys = [165, 115, 65], cx = 260, cy = 210;
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
  var board = Array(24).fill(0), hand = [0, 12, 12], stones = [], side = 1, me = 1;
  var selected = -1, capture = false, ended = false, busy = false, paused = false;
  var wins = 0, level = 1, total = 0;
  var yt = window.ytgame;

  function makeBoard() {
    svg.innerHTML = '<defs><radialGradient id="gP"><stop stop-color="#fff"/><stop offset="1" stop-color="#e3d6b8"/></radialGradient><radialGradient id="gC"><stop stop-color="#ff8a5c"/><stop offset="1" stop-color="#6b0a05"/></radialGradient></defs>';
    var lines = el('g', { stroke: 'var(--line)', 'stroke-width': 3, fill: 'none', 'stroke-linecap': 'round' }, svg);
    for (var i = 0; i < 3; i++) el('rect', { x: cx-rings[i], y: cy-ys[i], width: rings[i]*2, height: ys[i]*2, rx: 4 }, lines);
    for (i = 0; i < 8; i++) el('line', { x1:px(i), y1:py(i), x2:px(16+i), y2:py(16+i) }, lines);
    var dots = el('g', {}, svg), hits = el('g', {}, svg);
    for (i = 0; i < 24; i++) {
      el('circle', { cx:px(i), cy:py(i), r:11, fill:'#052f38', stroke:'#ffc83d', 'stroke-width':2 }, dots);
      el('circle', { cx:px(i), cy:py(i), r:4, fill:'#ff7a18' }, dots);
      (function (idx) { var h = el('circle', { cx:px(idx), cy:py(idx), r:25, fill:'transparent', tabindex:idx===9?0:-1, role:'button', 'aria-label':'Board point '+(idx+1) }, hits);
        h.addEventListener('click', function () { onPoint(idx); });
        h.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPoint(idx); } });
      })(i);
    }
  }
  function isMill(b, p, who) { return mills.some(function (m) { return m.indexOf(p) >= 0 && m.every(function (q) { return b[q] === who; }); }); }
  function totalPieces(who) { return hand[who] + board.filter(function (x) { return x === who; }).length; }
  function targets(who) {
    var all = [], safe = [];
    board.forEach(function (x, p) { if (x === who) { all.push(p); if (!isMill(board, p, who)) safe.push(p); } });
    return safe.length ? safe : all;
  }
  function moves(who) {
    var out = [];
    if (hand[who] > 0) {
      board.forEach(function (x, p) { if (!x) addMove(out, who, -1, p); });
    } else board.forEach(function (x, p) { if (x === who) adj[p].forEach(function (q) { if (!board[q]) addMove(out, who, p, q); }); });
    return out;
  }
  function addMove(out, who, from, to) {
    board[to] = who; if (from >= 0) board[from] = 0;
    var caps = isMill(board, to, who) ? targets(3-who) : [];
    if (caps.length) caps.forEach(function (cap) { out.push({from:from,to:to,cap:cap}); });
    else out.push({from:from,to:to,cap:-1});
    board[to] = 0; if (from >= 0) board[from] = who;
  }
  function render() {
    var old = svg.querySelector('#stones'); if (old) old.remove();
    var g = el('g', { id:'stones', 'pointer-events':'none' }, svg);
    board.forEach(function (who, p) { if (!who) return;
      var stone = el('g', { transform:'translate('+px(p)+','+py(p)+')', class:who===1?'peb ivory':'peb sindoor' }, g);
      el('circle', { r:21, fill:who===1?'url(#gP)':'url(#gC)', stroke:'#ffc83d', 'stroke-width':2 }, stone);
      el('circle', { r:3, fill:who===1?'#c8321f':'#ffe9a8' }, stone);
    });
    var h = svg.querySelector('#hints'); if (h) h.remove();
    h = el('g', { id:'hints', 'pointer-events':'none' }, svg);
    if (capture) targets(3-me).forEach(function (p) { el('circle',{cx:px(p),cy:py(p),r:27,fill:'none',stroke:'#ff6f5e','stroke-width':4},h); });
    else if (selected >= 0) { el('circle',{cx:px(selected),cy:py(selected),r:27,fill:'none',stroke:'#ffd166','stroke-width':4},h);
      if (!hand[me]) adj[selected].forEach(function (p) { if (!board[p]) el('circle',{cx:px(p),cy:py(p),r:10,fill:'#ffd166'},h); }); }
    updateUI();
  }
  function say(text) { $('status').innerHTML = text; }
  function updateUI() {
    for (var p=1;p<=2;p++) {
      $('s'+p).textContent=totalPieces(p); $('n'+p).textContent=(p===me?'You':'Computer')+' · '+(p===1?'Ivory':'Sindoor');
      $('h'+p).textContent=hand[p] ? hand[p]+' left to place' : 'all placed'; $('card'+p).classList.toggle('turn',!ended&&side===p);
    }
    $('stats').textContent='Wins: '+wins+' · Total score: '+total;
    $('lvl').textContent='Level '+level+' / 100 · '+(level<13?'Beginner':level<36?'Novice':level<66?'Skilled':level<96?'Master':'Maharaja');
  }
  var audio = new Audio(); audio.loop = true; audio.preload = 'auto'; audio.volume = 0.45;
  audio.src = new URL('assets/music.mp3', document.baseURI).href;
  var soundOn = true;
  function startAudio() {
    if (!soundOn || paused) return;
    var play = audio.play();
    if (play && play.catch) play.catch(function () { /* Browser may require another user gesture; retry on the next one. */ });
  }
  document.addEventListener('pointerdown', startAudio);
  document.addEventListener('keydown', startAudio);
  function stopAudio() { audio.pause(); }
  function playTone(freq, duration) {
    if (!soundOn || paused) return;
    try { var AC=window.AudioContext||window.webkitAudioContext; if (!AC) return;
      var ctx=playTone.ctx||(playTone.ctx=new AC()), osc=ctx.createOscillator(), gain=ctx.createGain();
      if (ctx.state==='suspended') ctx.resume(); osc.frequency.value=freq; gain.gain.setValueAtTime(0.08,ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+duration); osc.connect(gain); gain.connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime+duration);
    } catch (e) {}
  }
  function perform(m, who) {
    if (m.from < 0) hand[who]--; else board[m.from]=0;
    board[m.to]=who; playTone(m.cap>=0?300:520,0.12);
    if (m.cap>=0) board[m.cap]=0;
    render();
    if (m.cap>=0 && totalPieces(3-who)<=2) return finish(who===me?'win':'lose');
    side=3-who; selected=-1; capture=false;
    if (totalPieces(side)<=2) return finish(who===me?'win':'lose');
    if (!moves(side).length) { if (!moves(3-side).length) return finish('draw'); side=3-side; }
    render();
    if (side!==me) { busy=true; say('The computer is thinking…'); setTimeout(computerMove,450); }
    else { busy=false; say(hand[me]?'Your move. Place a stone on any empty point.':'Your move. Choose a stone, then an adjacent empty point.'); }
  }
  function onPoint(p) {
    if (ended||busy||paused||side!==me) return;
    if (capture) {
      if (targets(3-me).indexOf(p)<0) return;
      board[p]=0;
      capture=false;
      captureFrom=null;
      playTone(300,0.12);
      render();
      finishAction();
      return;
    }
    if (hand[me] > 0) {
      if (board[p]) return;
      board[p]=me; hand[me]--; render();
      if (isMill(board,p,me)&&targets(3-me).length) { capture=true; captureFrom={from:-1,to:p}; say('<strong>Tigadi!</strong> Choose an enemy stone to capture.'); render(); }
      else finishAction();
      return;
    }
    if (selected<0) { if (board[p]===me&&adj[p].some(function(q){return !board[q];})) { selected=p; render(); } return; }
    if (p===selected) { selected=-1; render(); return; }
    if (board[p]===me) { selected=p; render(); return; }
    if (!board[p]&&adj[selected].indexOf(p)>=0) { var from=selected; board[from]=0; board[p]=me; selected=-1;
      if (isMill(board,p,me)&&targets(3-me).length) { capture=true; captureFrom={from:from,to:p}; say('<strong>Tigadi!</strong> Choose an enemy stone to capture.'); render(); }
      else perform({from:from,to:p,cap:-1},me);
    }
  }
  var captureFrom = null;
  function finishAction() {
    if (capture) return;
    var who=me;
    side=3-who; selected=-1;
    if (totalPieces(side)<=2) return finish('win');
    if (!moves(side).length) { if (!moves(who).length) return finish('draw'); side=who; }
    render();
    if (side!==me) { busy=true; say('The computer is thinking…'); setTimeout(computerMove,450); }
    else { busy=false; say(hand[me]?'Your move. Place a stone on any empty point.':'Your move. Choose a stone, then an adjacent empty point.'); }
  }
  function computerMove() {
    if (ended||paused||side===me) return;
    var options=moves(side), best=options[Math.floor(Math.random()*options.length)];
    if (!best) { finish('draw'); return; }
    perform(best,side);
  }
  function finish(result) {
    ended=true; busy=false; selected=-1; capture=false;
    var text=result==='win'?'Shabash! You win.':result==='lose'?'The computer wins this round.':'A draw.';
    if (result==='win') { wins++; var score=20*level+50*totalPieces(me); total+=score; level=Math.min(100,level+1); text+=' Score: '+score+'.'; }
    render(); say('<strong>'+text+'</strong>');
    if (result!=='draw') playTone(result==='win'?660:220,0.35);
    setTimeout(function(){ $('overTitle').textContent=text; $('overText').textContent=result==='win'?'You earned points and advanced to the next level.':'Start another match when you are ready.'; var d=$('dlgOver'); if(d.showModal)d.showModal(); else d.setAttribute('open',''); },500);
  }
  function newGame() {
    var d=$('dlgOver'); if(d.open&&d.close)d.close(); else d.removeAttribute('open');
    board=Array(24).fill(0); hand=[0,12,12]; stones=[]; me=parseInt($('first').value,10)||1; side=1; selected=-1; capture=false; ended=false; busy=false; captureFrom=null;
    render(); if(side===me) say('Your move. Place a stone on any empty point.'); else {busy=true;say('The computer is thinking…');setTimeout(computerMove,450);}
  }
  function openDialog(id) { var d=$(id); if(d.showModal)d.showModal(); else d.setAttribute('open',''); }
  makeBoard();
  $('new').addEventListener('click',newGame); $('overAgain').addEventListener('click',newGame);
  $('overView').addEventListener('click',function(){var d=$('dlgOver');if(d.close)d.close();else d.removeAttribute('open');});
  $('rulesBtn').addEventListener('click',function(){openDialog('dlgRules');}); $('rulesBack').addEventListener('click',function(){var d=$('dlgRules');if(d.close)d.close();else d.removeAttribute('open');});
  $('langEn').addEventListener('click',function(){$('rulesHi').hidden=true;$('rulesEn').hidden=false;$('langEn').setAttribute('aria-pressed','true');$('langHi').setAttribute('aria-pressed','false');});
  $('langHi').addEventListener('click',function(){$('rulesHi').hidden=false;$('rulesEn').hidden=true;$('langEn').setAttribute('aria-pressed','false');$('langHi').setAttribute('aria-pressed','true');});
  $('mute').addEventListener('click',function(){soundOn=!soundOn;this.textContent=soundOn?'🔊 Sound: On':'🔇 Sound: Off';this.setAttribute('aria-pressed',String(!soundOn));if(soundOn)startAudio();else stopAudio();});
  ['dlgRules','dlgOver'].forEach(function(id){$(id).addEventListener('click',function(e){if(e.target===this&&this.close)this.close();});});
  if(yt){try{yt.system.onPause(function(){paused=true;stopAudio();});yt.system.onResume(function(){paused=false;});if(!yt.system.isAudioEnabled()){$('mute').click();}yt.system.onAudioEnabledChange(function(on){soundOn=!!on;if(soundOn)startAudio();else stopAudio();});}catch(e){}}
  newGame();
})();
