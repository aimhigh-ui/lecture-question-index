// 講義タブの切り替え、選択講義のURL保存、YouTube時刻リンクの生成。
// 入力: data/lectures.json。出力: #tabs / #lecture-select / #panel の中身。
// 時刻リンクは動画IDと秒数だけから作る。追跡用の si パラメータは付けない。
(function () {
  'use strict';

  var RESUME_LABEL = { explain: '説明再開', chapter: '次の章へ', closing: '締めへ' };
  var lectures = [];
  var tabsEl = document.getElementById('tabs');
  var selectEl = document.getElementById('lecture-select');
  var panelEl = document.getElementById('panel');

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function clock(sec) {
    var h = Math.floor(sec / 3600);
    var m = Math.floor((sec % 3600) / 60);
    var s = sec % 60;
    return h > 0 ? h + ':' + pad(m) + ':' + pad(s) : pad(m) + ':' + pad(s);
  }

  function spoken(sec) {
    var m = Math.floor(sec / 60);
    return m + '分' + (sec % 60) + '秒';
  }

  function videoUrl(id, sec) {
    return 'https://youtu.be/' + id + (sec != null ? '?t=' + sec : '');
  }

  function timeLink(videoId, sec, label) {
    var a = el('a', 'time');
    a.href = videoUrl(videoId, sec);
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.setAttribute('aria-label', spoken(sec) + ' ' + label + '（YouTubeを新しいタブで開く）');
    a.appendChild(el('span', 'clock', clock(sec)));
    a.appendChild(document.createTextNode(label));
    return a;
  }

  function detailRow(term, text) {
    var row = el('div');
    row.appendChild(el('dt', null, term));
    row.appendChild(el('dd', null, text));
    return row;
  }

  function isGreen(badge) { return badge.indexOf('質問あり') === 0; }

  function renderSegment(lecture, seg, index) {
    var li = el('li', 'item');
    li.appendChild(el('span', 'num', String(index + 1)));

    var main = el('div', 'main');
    main.appendChild(el('p', 'q', seg.ask));
    main.appendChild(el('span', isGreen(seg.badge) ? 'badge green' : 'badge', seg.badge));
    var dl = el('dl', 'detail');
    dl.appendChild(detailRow('受講者の反応', seg.reaction));
    dl.appendChild(detailRow('受講者からの質問', seg.studentQuestion));
    dl.appendChild(detailRow('講師の回答', seg.answer));
    main.appendChild(dl);
    li.appendChild(main);

    var times = el('div', 'times');
    times.appendChild(timeLink(lecture.videoId, seg.askSec, '問いかけ'));
    times.appendChild(timeLink(lecture.videoId, seg.resumeSec, RESUME_LABEL[seg.resumeKind]));
    li.appendChild(times);
    return li;
  }

  function renderPanel(lecture) {
    panelEl.textContent = '';
    panelEl.setAttribute('aria-labelledby', 'tab-' + lecture.id);
    panelEl.appendChild(el('h2', null, lecture.videoTitle));
    panelEl.appendChild(el('p', 'summary', lecture.summary));

    var open = el('a', 'video-link', 'この講義の動画をYouTubeで開く');
    open.href = videoUrl(lecture.videoId);
    open.target = '_blank';
    open.rel = 'noopener noreferrer';
    panelEl.appendChild(open);

    panelEl.appendChild(el('p', 'list-title', '受講者の反応があった場面（' + lecture.segments.length + '件）'));
    var ol = el('ol', 'items');
    lecture.segments.forEach(function (seg, i) { ol.appendChild(renderSegment(lecture, seg, i)); });
    panelEl.appendChild(ol);
  }

  function select(id, opts) {
    var lecture = lectures.filter(function (l) { return l.id === id; })[0] || lectures[0];
    Array.prototype.forEach.call(tabsEl.children, function (btn) {
      var on = btn.dataset.id === lecture.id;
      btn.setAttribute('aria-selected', on ? 'true' : 'false');
      btn.tabIndex = on ? 0 : -1;
    });
    selectEl.value = lecture.id;
    renderPanel(lecture);
    if (!opts || opts.remember !== false) {
      try {
        var url = new URL(window.location.href);
        url.searchParams.set('lecture', lecture.id);
        window.history.replaceState(null, '', url);
      } catch (e) { /* URLを更新できない環境でも表示は続ける */ }
    }
    return lecture;
  }

  function buildControls() {
    lectures.forEach(function (lecture) {
      var btn = el('button', 'tab', lecture.videoTitle);
      btn.type = 'button';
      btn.id = 'tab-' + lecture.id;
      btn.setAttribute('role', 'tab');
      btn.setAttribute('aria-controls', 'panel');
      btn.dataset.id = lecture.id;
      btn.addEventListener('click', function () { select(lecture.id); });
      btn.addEventListener('keydown', function (ev) {
        var idx = lectures.indexOf(lecture);
        var next = null;
        if (ev.key === 'ArrowRight') next = (idx + 1) % lectures.length;
        else if (ev.key === 'ArrowLeft') next = (idx - 1 + lectures.length) % lectures.length;
        else if (ev.key === 'Home') next = 0;
        else if (ev.key === 'End') next = lectures.length - 1;
        if (next == null) return;
        ev.preventDefault();
        select(lectures[next].id);
        tabsEl.children[next].focus();
      });
      tabsEl.appendChild(btn);

      var opt = el('option', null, lecture.videoTitle);
      opt.value = lecture.id;
      selectEl.appendChild(opt);
    });
    selectEl.addEventListener('change', function () { select(selectEl.value); });
  }

  function requestedId() {
    var fromQuery = new URLSearchParams(window.location.search).get('lecture');
    return fromQuery || window.location.hash.replace(/^#(lecture=)?/, '');
  }

  fetch('data/lectures.json')
    .then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    })
    .then(function (data) {
      lectures = data.lectures;
      buildControls();
      select(requestedId(), { remember: false });
    })
    .catch(function () {
      panelEl.textContent = '';
      panelEl.appendChild(el('p', 'status', '一覧を読み込めませんでした。ページを再読み込みしてください。'));
    });
})();
