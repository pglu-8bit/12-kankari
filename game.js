(function () {
  var NS = 'http://www.w3.org/2000/svg';
  var $ = function (id) { return document.getElementById(id); };
  var svg = $('board');
  var yt = window.ytgame, paused = false, held = [], soundOn = true, actx = null;
