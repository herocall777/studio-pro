/* ScheduleMate 성장노트: 레슨 기록 · 목표(월/주/콩쿨) · 새 책 시작 · 학부모 피드백 글 · 인쇄 · 엑셀 · 폰 잠금
 * 의존: React(전역), getSb()(index.html), mm-ext.js 보다 먼저/나중 어느 쪽이든 로드 가능
 * 데이터: mm_note_settings · mm_lesson_log · mm_goal · mm_newbook · mm_feedback · 저장소 mm-note-media (009_growth_note.sql)
 * 권한은 서버(RLS)가 판단합니다. */
(function () {
  'use strict';
  var R = window.React, h = R.createElement;
  var useState = R.useState, useEffect = R.useEffect, useRef = R.useRef, useMemo = R.useMemo;

  /* ───────── 공통 ───────── */
  function sb() { return window.getSb && window.getSb(); }
  function kstDate(d) { return (d || new Date()).toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' }); }
  function addDays(ymd, n) { var d = new Date(ymd + 'T12:00:00+09:00'); d.setDate(d.getDate() + n); return kstDate(d); }
  function mondayOf(ymd) { var d = new Date(ymd + 'T12:00:00+09:00'); var w = d.getDay(); return addDays(ymd, w === 0 ? -6 : 1 - w); }
  function monthEnd(ym) { var p = ym.split('-'); var d = new Date(Number(p[0]), Number(p[1]), 0); return ym + '-' + ('0' + d.getDate()).slice(-2); }
  function md(ymd) { if (!ymd) return ''; var p = ymd.split('-'); return Number(p[1]) + '/' + Number(p[2]); }
  function errText(e) { return (e && (e.message || e.error_description || e.msg)) || String(e || '알 수 없는 오류'); }
  function isAdmin(a) { return a && (a.role === '원장' || a.role === '실장' || a.role === '슈퍼어드민'); }
  function isStaff(a) { return a && (isAdmin(a) || a.role === '강사'); }
  function myName(a) { return ((a && a.name) || '').replace(/ \(.*\)/, '') || (a && a.email) || ''; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function uniq(a) { var o = []; (a || []).forEach(function (x) { if (x && o.indexOf(x) < 0) o.push(x); }); return o; }

  var C = { bg: '#fff', line: '#e5e7eb', mute: '#6b7280', pink: '#E07B8B', green: '#10b981', amber: '#f59e0b', red: '#ef4444', ink: '#111827', soft: '#f9fafb', blue: '#3b82f6', violet: '#8b5cf6' };
  var S = {
    wrap: { padding: 16, maxWidth: 980, margin: '0 auto', color: C.ink, fontFamily: 'inherit' },
    card: { background: C.bg, border: '1px solid ' + C.line, borderRadius: 14, padding: 16, marginBottom: 14 },
    h3: { fontSize: 14, fontWeight: 700, margin: '0 0 8px' },
    label: { fontSize: 12, fontWeight: 700, color: C.mute, margin: '10px 0 4px', display: 'block' },
    mute: { color: C.mute, fontSize: 12 },
    btn: { border: 'none', borderRadius: 10, padding: '9px 14px', fontWeight: 700, cursor: 'pointer', background: C.pink, color: '#fff', fontSize: 13 },
    btn2: { border: '1px solid ' + C.line, borderRadius: 10, padding: '8px 12px', fontWeight: 600, cursor: 'pointer', background: '#fff', color: C.ink, fontSize: 13 },
    chip: { border: '1px solid ' + C.line, borderRadius: 999, padding: '5px 11px', cursor: 'pointer', background: '#fff', color: C.ink, fontSize: 12, fontWeight: 600 },
    chipOn: { border: '1px solid ' + C.pink, borderRadius: 999, padding: '5px 11px', cursor: 'pointer', background: C.pink, color: '#fff', fontSize: 12, fontWeight: 700 },
    input: { border: '1px solid ' + C.line, borderRadius: 8, padding: '8px 10px', fontSize: 13, width: '100%', boxSizing: 'border-box', fontFamily: 'inherit' },
    row: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
  };
  function Card(p) { return h('div', { style: S.card }, p.title ? h('h3', { style: S.h3 }, p.title) : null, p.children); }
  function Msg(p) { return p.text ? h('div', { style: { fontSize: 12, color: p.err ? C.red : C.green, margin: '6px 0' } }, p.text) : null; }
  function Label(p) { return h('label', { style: S.label }, p.children); }
  function badge(text, color) { return h('span', { style: { background: color + '22', color: color, borderRadius: 999, padding: '2px 9px', fontSize: 11, fontWeight: 700 } }, text); }
  function Chips(p) {
    return h('div', { style: Object.assign({ marginBottom: 6 }, S.row) }, p.items.map(function (t) {
      var v = Array.isArray(t) ? t[0] : t, l = Array.isArray(t) ? t[1] : t;
      return h('button', { key: v, type: 'button', style: p.value === v ? S.chipOn : S.chip, onClick: function () { p.onChange(v); } }, l);
    }));
  }
  function useQuery(fn, deps) {
    var _d = useState(null), data = _d[0], setData = _d[1];
    var _l = useState(true), loading = _l[0], setLoading = _l[1];
    var _e = useState(''), err = _e[0], setErr = _e[1];
    var _n = useState(0), tick = _n[0], setTick = _n[1];
    useEffect(function () {
      var dead = false; setLoading(true);
      Promise.resolve(fn()).then(function (r) { if (dead) return; if (r && r.error) setErr(errText(r.error)); else { setErr(''); setData(r ? r.data : null); } setLoading(false); })
        .catch(function (e) { if (!dead) { setErr(errText(e)); setLoading(false); } });
      return function () { dead = true; };
    }, (deps || []).concat([tick]));
    return { data: data, loading: loading, err: err, reload: function () { setTick(function (t) { return t + 1; }); } };
  }
  function tableHint(err) {
    return /relation|does not exist|schema cache|mm_note|mm_lesson|mm_goal|mm_newbook|mm_feedback/i.test(err || '')
      ? '성장노트 표가 아직 없습니다. Supabase SQL Editor에서 009_growth_note.sql 을 실행해 주세요.' : err;
  }

  /* ───────── 초성 검색 ───────── */
  var CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
  function chosung(s) {
    return String(s || '').split('').map(function (ch) {
      var c = ch.charCodeAt(0);
      return c >= 0xAC00 && c <= 0xD7A3 ? CHO.charAt(Math.floor((c - 0xAC00) / 588)) : ch;
    }).join('');
  }
  function nameMatch(name, q) {
    q = String(q || '').replace(/\s/g, ''); if (!q) return true;
    var n = String(name || '').replace(/\s/g, '');
    return n.indexOf(q) >= 0 || chosung(n).indexOf(q) >= 0;
  }

  /* ───────── 설정 (학원별) ───────── */
  var DEFAULTS = {
    academyName: '',
    subjects: ['피아노', '보컬', '드럼', '기타', '작곡·미디', '이론'],
    lessonBooks: [
      { name: '바이엘', vols: '1-4', subject: '피아노' }, { name: '체르니 100', vols: '', subject: '피아노' },
      { name: '체르니 30', vols: '', subject: '피아노' }, { name: '소나티나', vols: '', subject: '피아노' },
      { name: '부르크뮐러 25', vols: '', subject: '피아노' }, { name: '하농', vols: '', subject: '피아노' },
      { name: '발성·호흡', vols: '1-3', subject: '보컬' }, { name: '드럼 리듬 교본', vols: '1-3', subject: '드럼' },
    ],
    theoryBooks: [{ name: '음악 이론', vols: '1-10', subject: '' }],
    ratingItems: ['리듬감', '음정', '표현력', '자세·호흡', '초견', '연습 태도', '집중력'],
    opening: '안녕하세요, {학원}입니다. {이름} 학생의 {기간} 레슨 소식을 전해 드립니다.',
    closing1: ['이번 주도 수고 많았어요. 집에서 조금씩 연습해 오면 다음 레슨이 훨씬 즐거워질 거예요.',
      '한 주 동안 잘 따라와 주었습니다. 다음 주에도 함께 한 걸음 나아가 볼게요.'],
    closing2: ['2주 동안 차근차근 쌓아 온 것이 소리에 보이기 시작했어요. 궁금하신 점은 언제든 편하게 말씀해 주세요.',
      '지난 2주 동안 꾸준히 해 온 덕분에 진도가 한결 단단해졌습니다. 앞으로도 잘 이끌어 가겠습니다.'],
    closingM: ['한 달의 레슨을 정리해 보내 드립니다. 잘 되는 부분은 더 넓히고, 아직 서툰 부분은 다음 달 목표에 담아 두었어요.',
      '한 달 사이 곡과 실력이 함께 자랐어요. 집에서 가족 앞에서 한 곡 들려주는 시간을 가져 보시면 아이에게 큰 자신감이 됩니다.'],
  };
  function useSettings(studio) {
    var q = useQuery(function () { return sb().from('mm_note_settings').select('*').eq('studio_id', studio).maybeSingle(); }, [studio]);
    var data = Object.assign({}, DEFAULTS, (q.data && q.data.data) || {});
    return { s: data, loading: q.loading, err: q.err, reload: q.reload };
  }
  function parseVols(v) {
    v = String(v || '').trim(); if (!v) return [''];
    var m = v.match(/^(\d+)\s*[-~]\s*(\d+)$/);
    if (m) { var out = []; for (var i = Number(m[1]); i <= Number(m[2]) && out.length < 40; i++) out.push(String(i)); return out; }
    return v.split(/[,\s]+/).filter(Boolean);
  }
  function bookLabel(b) { return b.book + (b.vol ? ' ' + b.vol + '권' : ''); }
  function booksFor(s, subject, kind) {
    var list = kind === 'theory' ? s.theoryBooks : s.lessonBooks;
    return (list || []).filter(function (b) { return !subject || !b.subject || b.subject === subject; });
  }

  /* ───────── 평가 문장 (항목별 상·중·하, 표현 2가지) ───────── */
  var RT = {
    '리듬감': { hi: ['리듬을 정확하게 느끼며 연주하고 있어요', '박자 감각이 아주 안정적이에요'], mid: ['리듬이 점점 고르게 잡혀 가고 있어요', '박자를 의식하며 연주하기 시작했어요'], lo: ['박자를 세며 천천히 리듬을 다지는 중이에요', '메트로놈과 함께 리듬 기초를 다지고 있어요'] },
    '음정': { hi: ['음정이 정확하고 안정적이에요', '소리를 듣고 음을 정확하게 찾아내요'], mid: ['음정이 점점 정확해지고 있어요', '귀로 듣고 맞추는 힘이 자라고 있어요'], lo: ['소리를 듣고 맞추는 연습을 함께 늘려 가고 있어요', '음을 천천히 확인하며 정확도를 높이는 중이에요'] },
    '표현력': { hi: ['곡의 느낌을 살려 표현할 줄 알아요', '셈여림과 분위기를 스스로 살려 내요'], mid: ['강약과 느낌을 의식하기 시작했어요', '곡의 분위기를 조금씩 표현하고 있어요'], lo: ['먼저 정확하게 익힌 뒤 표현을 더해 갈 예정이에요', '표현은 곡이 손에 익은 다음 단계에서 다듬을게요'] },
    '자세·호흡': { hi: ['자세와 호흡이 바르게 자리 잡았어요', '편안한 자세로 힘을 잘 빼고 있어요'], mid: ['바른 자세와 호흡을 익혀 가는 중이에요', '힘 빼는 법을 조금씩 알아 가고 있어요'], lo: ['기본 자세와 호흡을 다시 다지고 있어요', '자세부터 차근차근 바로잡는 중이에요'] },
    '초견': { hi: ['처음 보는 악보도 막힘없이 읽어 내요', '악보 읽는 속도가 아주 빨라요'], mid: ['악보 읽는 속도가 빨라지고 있어요', '처음 보는 악보에도 점점 자신감이 붙고 있어요'], lo: ['악보 읽기를 차근차근 연습하고 있어요', '음표 읽기를 매 레슨 조금씩 다지고 있어요'] },
    '연습 태도': { hi: ['스스로 연습하는 습관이 잘 잡혀 있어요', '연습해 온 티가 확실히 나요'], mid: ['연습 태도가 꾸준히 좋아지고 있어요', '연습하는 시간이 조금씩 늘고 있어요'], lo: ['집에서 하루 10분이라도 앉는 습관을 함께 만들어 가면 좋겠어요', '집 연습이 조금 부족한 편이라 짧게라도 매일 해 보기를 권해요'] },
    '집중력': { hi: ['레슨 시간 내내 집중력이 좋아요', '설명을 귀 기울여 듣고 바로 적용해요'], mid: ['집중하는 시간이 점점 길어지고 있어요', '레슨에 참여하는 모습이 좋아지고 있어요'], lo: ['짧게 나눠 집중하는 방식으로 레슨을 이끌고 있어요', '집중할 수 있도록 활동을 나눠 진행하고 있어요'] },
  };
  function rateSentence(item, avg, alt) {
    var lv = avg >= 4 ? 'hi' : avg >= 3 ? 'mid' : 'lo';
    var bank = RT[item];
    if (!bank) return item + ': ' + (lv === 'hi' ? '아주 잘하고 있어요' : lv === 'mid' ? '좋아지고 있어요' : '함께 다져 가는 중이에요');
    return bank[lv][alt % 2];
  }
  function avgRatings(logs) {
    var sum = {}, cnt = {};
    (logs || []).forEach(function (l) { Object.keys(l.ratings || {}).forEach(function (k) { var v = Number(l.ratings[k]); if (v) { sum[k] = (sum[k] || 0) + v; cnt[k] = (cnt[k] || 0) + 1; } }); });
    var out = {}; Object.keys(sum).forEach(function (k) { out[k] = Math.round(sum[k] / cnt[k] * 10) / 10; }); return out;
  }

  /* ───────── 그래프 (SVG 문자열 — 화면·인쇄 공용) ───────── */
  function chartSvg(obj) {
    var keys = Object.keys(obj || {}); if (!keys.length) return '';
    var rowH = 26, w = 320, lw = 84, H = keys.length * rowH + 10;
    var bars = keys.map(function (k, i) {
      var v = Math.max(0, Math.min(5, Number(obj[k]) || 0)), y = 6 + i * rowH, bw = (w - lw - 40) * v / 5;
      return '<text x="0" y="' + (y + 14) + '" font-size="12" fill="#374151">' + esc(k) + '</text>' +
        '<rect x="' + lw + '" y="' + (y + 3) + '" width="' + (w - lw - 40) + '" height="14" rx="7" fill="#f3f4f6"/>' +
        '<rect x="' + lw + '" y="' + (y + 3) + '" width="' + bw + '" height="14" rx="7" fill="#E07B8B"/>' +
        '<text x="' + (w - 32) + '" y="' + (y + 14) + '" font-size="12" font-weight="700" fill="#111827">' + v.toFixed(1) + '</text>';
    }).join('');
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + w + ' ' + H + '" width="100%" style="max-width:420px" role="img" aria-label="평가 그래프">' + bars + '</svg>';
  }
  function Chart(p) { var s = chartSvg(p.data); return s ? h('div', { dangerouslySetInnerHTML: { __html: s } }) : null; }

  /* ───────── 인쇄 (숨은 iframe → 인쇄창, PDF 저장 가능) ───────── */
  function printHtml(title, body, size) {
    var pg = { A4: 'A4', A5: 'A5', A6: 'A6', label: '100mm 70mm' }[size || 'A4'] || 'A4';
    var base = size === 'A6' || size === 'label' ? 11 : size === 'A5' ? 12 : 13;
    var html = '<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>' + esc(title) + '</title><style>' +
      '@page{size:' + pg + ';margin:' + (size === 'label' ? '4mm' : '10mm') + '}' +
      'body{font-family:-apple-system,"Apple SD Gothic Neo","Malgun Gothic",sans-serif;font-size:' + base + 'px;color:#111;line-height:1.6;margin:0}' +
      'h1{font-size:' + (base + 5) + 'px;margin:0 0 6px}h2{font-size:' + (base + 1) + 'px;margin:12px 0 4px;color:#be185d}' +
      '.mute{color:#6b7280;font-size:' + (base - 1) + 'px}.box{border:1px solid #e5e7eb;border-radius:8px;padding:8px 10px;margin:6px 0}' +
      'table{width:100%;border-collapse:collapse}td,th{border:1px solid #e5e7eb;padding:4px 6px;text-align:left;vertical-align:top}' +
      '.pre{white-space:pre-wrap}img{max-width:100%}</style></head><body>' + body + '</body></html>';
    var f = document.createElement('iframe');
    f.setAttribute('aria-hidden', 'true');
    f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
    document.body.appendChild(f);
    var d = f.contentWindow.document; d.open(); d.write(html); d.close();
    setTimeout(function () {
      try { f.contentWindow.focus(); f.contentWindow.print(); } catch (e) { /* ignore */ }
      setTimeout(function () { f.remove(); }, 4000);
    }, 400);
  }
  function PrintBar(p) {
    var _s = useState('A4'), size = _s[0], setSize = _s[1];
    var sizes = p.label ? [['A4', 'A4'], ['A5', 'A5'], ['A6', 'A6'], ['label', '라벨 100×70']] : [['A4', 'A4'], ['A5', 'A5'], ['A6', 'A6']];
    return h('div', { style: Object.assign({ marginTop: 8 }, S.row) },
      h(Chips, { items: sizes, value: size, onChange: setSize }),
      h('button', { type: 'button', style: S.btn2, onClick: function () { p.onPrint(size); } }, '🖨 ' + (p.text || '인쇄')));
  }

  /* ───────── 음성 입력 🎤 ───────── */
  function MicBtn(p) {
    var _o = useState(false), on = _o[0], setOn = _o[1];
    var _t = useState(''), tip = _t[0], setTip = _t[1];
    var ref = useRef(null);
    function go() {
      var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SR) { setTip('이 기기에서는 말로 적기가 안 돼요. 키보드의 🎙 버튼을 눌러 말하면 그대로 적혀요.'); return; }
      if (on && ref.current) { ref.current.stop(); return; }
      var r = new SR(); r.lang = 'ko-KR'; r.interimResults = false; r.maxAlternatives = 1;
      r.onresult = function (e) { var t = e.results[0][0].transcript; if (t) p.onText(t); };
      r.onerror = function (e) { setTip(e.error === 'not-allowed' ? '마이크 권한을 허용해 주세요' : '다시 눌러 말해 주세요'); };
      r.onend = function () { setOn(false); };
      ref.current = r; setTip(''); setOn(true); r.start();
    }
    return h('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 4 } },
      h('button', { type: 'button', title: '말로 적기', onClick: go, style: Object.assign({}, S.btn2, { padding: '6px 9px', background: on ? '#fee2e2' : '#fff' }) }, on ? '● 듣는 중' : '🎤'),
      tip ? h('span', { style: { fontSize: 11, color: C.mute } }, tip) : null);
  }
  function Field(p) {
    var Tag = p.area ? 'textarea' : 'input';
    return h('div', null,
      p.label ? h(Label, null, p.label) : null,
      h('div', { style: { display: 'flex', gap: 6, alignItems: 'flex-start' } },
        h(Tag, { style: Object.assign({}, S.input, p.area ? { minHeight: p.rows ? p.rows * 20 : 60, resize: 'vertical' } : {}), value: p.value || '', placeholder: p.placeholder || '',
          onChange: function (e) { p.onChange(e.target.value); } }),
        p.noMic ? null : h(MicBtn, { onText: function (t) { p.onChange((p.value ? p.value + ' ' : '') + t); } })));
  }

  /* ───────── 사진 (자동으로 줄여 저장) ───────── */
  function shrink(file, max) {
    max = max || 1280;
    return new Promise(function (res, rej) {
      var img = new Image(), url = URL.createObjectURL(file);
      img.onload = function () {
        var k = Math.min(1, max / Math.max(img.width, img.height));
        var c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
        c.toBlob(function (b) { b ? res(b) : rej(new Error('사진을 줄이지 못했어요')); }, 'image/jpeg', 0.82);
      };
      img.onerror = function () { URL.revokeObjectURL(url); rej(new Error('사진을 읽지 못했어요')); };
      img.src = url;
    });
  }
  function uploadPhotos(kid, files) {
    return Promise.all((files || []).map(function (f, i) {
      return shrink(f).then(function (b) {
        var path = kid.studio_id + '/' + kid.member_id + '/' + Date.now() + '_' + i + '.jpg';
        return sb().storage.from('mm-note-media').upload(path, b, { contentType: 'image/jpeg' }).then(function (u) { if (u.error) throw u.error; return path; });
      });
    }));
  }
  function useSigned(paths) {
    var _u = useState({}), urls = _u[0], setUrls = _u[1];
    var key = (paths || []).join('|');
    useEffect(function () {
      var need = (paths || []).filter(function (p) { return p && !urls[p]; }); if (!need.length) return;
      sb().storage.from('mm-note-media').createSignedUrls(need, 3600).then(function (r) {
        if (r.error || !r.data) return;
        setUrls(function (o) { var n = Object.assign({}, o); r.data.forEach(function (x) { if (x.signedUrl) n[x.path] = x.signedUrl; }); return n; });
      });
    }, [key]);
    return urls;
  }
  function Photos(p) {
    var urls = useSigned(p.paths);
    if (!(p.paths || []).length) return null;
    return h('div', { style: Object.assign({ marginTop: 6 }, S.row) }, p.paths.map(function (path) {
      var sel = p.selected && p.selected.indexOf(path) >= 0;
      return urls[path] ? h('img', { key: path, src: urls[path], alt: '레슨 사진', onClick: p.onToggle ? function () { p.onToggle(path); } : null,
        style: { width: p.size || 76, height: p.size || 76, objectFit: 'cover', borderRadius: 8, cursor: p.onToggle ? 'pointer' : 'default',
          outline: p.onToggle ? (sel ? '3px solid ' + C.pink : '1px solid ' + C.line) : 'none', opacity: p.onToggle && !sel ? 0.55 : 1 } })
        : h('div', { key: path, style: { width: p.size || 76, height: p.size || 76, borderRadius: 8, background: C.soft } });
    }));
  }

  /* ───────── 학생 고르기 (이름·초성 검색) ───────── */
  function useRoster() { return useQuery(function () { return sb().from('mm_roster').select('*').eq('active', true).order('name'); }, []); }
  function KidPicker(p) {
    var _q = useState(''), q = _q[0], setQ = _q[1];
    var kids = (p.kids || []).filter(function (k) { return nameMatch(k.name, q); });
    return h(Card, null,
      h('input', { style: S.input, placeholder: '이름 또는 초성으로 찾기 (예: ㄱㅁㅈ)', value: q, onChange: function (e) { setQ(e.target.value); } }),
      h('div', { style: Object.assign({ marginTop: 8, maxHeight: 190, overflowY: 'auto' }, S.row) }, kids.slice(0, 80).map(function (k) {
        var on = p.value === k.member_id;
        return h('button', { key: k.member_id, type: 'button', style: on ? S.chipOn : S.chip, onClick: function () { p.onChange(on ? '' : k.member_id); } },
          k.name, k.subject ? h('span', { style: { opacity: 0.7, fontWeight: 500 } }, ' · ' + k.subject) : null,
          p.sub && p.sub[k.member_id] ? h('div', { style: { fontSize: 10, fontWeight: 500, opacity: 0.85 } }, p.sub[k.member_id]) : null);
      }), !kids.length ? h('span', { style: S.mute }, p.kids && p.kids.length ? '찾는 학생이 없어요' : '명단이 비어 있어요. (출결·기록 > 설정 > 명단 동기화)') : null));
  }

  /* ───────── 교재 고르기 ───────── */
  function BookPick(p) {
    var list = booksFor(p.s, p.subject, p.kind);
    var cur = list.filter(function (b) { return b.name === p.book; })[0];
    var custom = p.book && !cur;
    var vols = cur ? parseVols(cur.vols) : [''];
    return h('div', { style: S.row },
      h('select', { style: Object.assign({}, S.input, { width: 'auto', minWidth: 140 }), value: custom ? '__c' : (p.book || ''),
        onChange: function (e) { var v = e.target.value; p.onChange(v === '__c' ? ' ' : v, ''); } },
        h('option', { value: '' }, '교재 고르기'), list.map(function (b) { return h('option', { key: b.name, value: b.name }, b.name); }),
        h('option', { value: '__c' }, '＋ 목록에 없는 책')),
      custom ? h('input', { style: Object.assign({}, S.input, { width: 170 }), placeholder: '책 이름', value: p.book.trim(), onChange: function (e) { p.onChange(e.target.value || ' ', p.vol); } }) : null,
      cur && vols.length > 1 ? h('select', { style: Object.assign({}, S.input, { width: 'auto' }), value: p.vol || '', onChange: function (e) { p.onChange(p.book, e.target.value); } },
        h('option', { value: '' }, '권'), vols.map(function (v) { return h('option', { key: v, value: v }, v + '권'); })) : null,
      custom ? h('input', { style: Object.assign({}, S.input, { width: 70 }), placeholder: '권', value: p.vol || '', onChange: function (e) { p.onChange(p.book, e.target.value); } }) : null);
  }

  /* ═════════ ① 레슨 기록 ═════════ */
  function blankItem() { return { book: '', vol: '', page: '', title: '', fix: '' }; }
  function itemEmpty(it) { return !((it.book || '').trim() || it.page || it.title || it.fix); }
  function itemText(it) { return [bookLabel({ book: (it.book || '').trim(), vol: it.vol }), it.page, it.title].filter(function (x) { return x && x.trim(); }).join(' · '); }

  function LogTab(p) {
    var a = p.account, s = p.s, roster = p.roster;
    var _k = useState(''), sel = _k[0], setSel = _k[1];
    var kid = (roster.data || []).filter(function (k) { return k.member_id === sel; })[0];
    var _e = useState(null), editing = _e[0], setEditing = _e[1];
    var _ver = useState(0), ver = _ver[0], setVer = _ver[1];
    var logs = useQuery(function () {
      if (!kid) return Promise.resolve({ data: [] });
      return sb().from('mm_lesson_log').select('*').eq('studio_id', kid.studio_id).eq('member_id', kid.member_id).order('lesson_date', { ascending: false }).limit(40);
    }, [sel]);
    var allPhotos = []; (logs.data || []).forEach(function (l) { allPhotos = allPhotos.concat(l.photos || []); });
    function printLogs(range, size) {
      var since = range === 'week' ? mondayOf(kstDate()) : kstDate().slice(0, 7) + '-01';
      var rows = (logs.data || []).filter(function (l) { return l.lesson_date >= since; }).slice().reverse();
      var body = '<h1>' + esc(kid.name) + ' 레슨 기록</h1><div class="mute">' + esc(s.academyName || '') + ' · ' + (range === 'week' ? '이번 주' : '이번 달') + ' (' + md(since) + '~)</div>' +
        (rows.length ? rows.map(function (l) {
          return '<div class="box"><b>' + md(l.lesson_date) + '</b> ' + esc(l.subject || '') +
            (l.items || []).map(function (it) { return '<div>• ' + esc(itemText(it)) + (it.fix ? '<div class="mute">&nbsp;&nbsp;└ ' + esc(it.fix) + '</div>' : '') + '</div>'; }).join('') +
            (l.good ? '<div>👍 ' + esc(l.good) + '</div>' : '') + (l.improve ? '<div>📝 ' + esc(l.improve) + '</div>' : '') + '</div>';
        }).join('') : '<p>이 기간의 기록이 없습니다.</p>');
      printHtml(kid.name + ' 레슨 기록', body, size);
    }
    return h('div', null,
      h(KidPicker, { kids: roster.data, value: sel, onChange: function (v) { setSel(v); setEditing(null); } }),
      kid ? h(LogForm, { key: kid.member_id + (editing ? editing.id : 'new' + ver), kid: kid, a: a, s: s, editing: editing,
        onDone: function () { setEditing(null); setVer(ver + 1); logs.reload(); }, onCancel: function () { setEditing(null); } }) : null,
      kid ? h(Card, { title: '기록 ' + (logs.data || []).length + '개' },
        h(Msg, { text: tableHint(logs.err), err: true }),
        (logs.data || []).map(function (l) {
          return h('div', { key: l.id, style: { borderBottom: '1px solid ' + C.line, padding: '10px 0' } },
            h('div', { style: S.row }, h('b', null, md(l.lesson_date)), l.subject ? badge(l.subject, C.blue) : null,
              l.teacher_name ? h('span', { style: S.mute }, l.teacher_name + ' (학부모 비공개)') : null,
              h('span', { style: { flex: 1 } }),
              h('button', { type: 'button', style: S.btn2, onClick: function () { setEditing(l); window.scrollTo({ top: 0, behavior: 'smooth' }); } }, '고치기'),
              h('button', { type: 'button', style: S.btn2, onClick: function () {
                if (!window.confirm || window.confirm(md(l.lesson_date) + ' 기록을 지울까요?')) sb().from('mm_lesson_log').delete().eq('id', l.id).then(logs.reload);
              } }, '지우기')),
            (l.items || []).map(function (it, i) {
              return h('div', { key: i, style: { fontSize: 13, marginTop: 4 } }, '• ' + itemText(it), it.fix ? h('div', { style: { fontSize: 12, color: C.mute, paddingLeft: 12 } }, '└ ' + it.fix) : null);
            }),
            l.good ? h('div', { style: { fontSize: 13, marginTop: 4 } }, '👍 ' + l.good) : null,
            l.improve ? h('div', { style: { fontSize: 13 } }, '📝 ' + l.improve) : null,
            Object.keys(l.ratings || {}).length ? h('div', { style: Object.assign({ marginTop: 4 }, S.row) }, Object.keys(l.ratings).map(function (k) { return h('span', { key: k, style: S.mute }, k + ' ' + l.ratings[k]); })) : null,
            h(Photos, { paths: l.photos, size: 56 }));
        }),
        allPhotos.length || (logs.data || []).length ? h('div', null,
          h(Label, null, '기록 인쇄'),
          h('div', { style: S.row },
            h(PrintBar, { text: '이번 주 기록', onPrint: function (z) { printLogs('week', z); } }),
            h(PrintBar, { text: '이번 달 기록', onPrint: function (z) { printLogs('month', z); } }))) : null) : null);
  }

  function LogForm(p) {
    var kid = p.kid, s = p.s, ed = p.editing;
    var _d = useState(ed ? ed.lesson_date : kstDate()), date = _d[0], setDate = _d[1];
    var _sj = useState(ed ? ed.subject || '' : (kid.subject && s.subjects.indexOf(kid.subject) >= 0 ? kid.subject : '')), subject = _sj[0], setSubject = _sj[1];
    var _it = useState(ed ? (ed.items || []) : []), items = _it[0], setItems = _it[1];
    var _c = useState(blankItem()), cur = _c[0], setCur = _c[1];
    var _g = useState(ed ? ed.good || '' : ''), good = _g[0], setGood = _g[1];
    var _im = useState(ed ? ed.improve || '' : ''), improve = _im[0], setImprove = _im[1];
    var _r = useState(ed ? ed.ratings || {} : {}), ratings = _r[0], setRatings = _r[1];
    var _ph = useState(ed ? ed.photos || [] : []), photos = _ph[0], setPhotos = _ph[1];
    var _nf = useState([]), files = _nf[0], setFiles = _nf[1];
    var _m = useState(''), msg = _m[0], setMsg = _m[1];
    var _b = useState(false), busy = _b[0], setBusy = _b[1];
    function setC(k, v) { setCur(function (o) { var n = Object.assign({}, o); n[k] = v; return n; }); }
    function pushItem() {
      if (itemEmpty(cur)) { setMsg('교재나 고칠 점을 먼저 적어 주세요'); return; }
      setItems(items.concat([Object.assign({}, cur, { book: (cur.book || '').trim() })])); setCur(blankItem()); setMsg('');
    }
    function save() {
      var all = items.concat(itemEmpty(cur) ? [] : [Object.assign({}, cur, { book: (cur.book || '').trim() })]);
      if (!date) return setMsg('날짜를 선택해 주세요');
      if (!all.length && !good.trim() && !improve.trim() && !files.length) return setMsg('적은 내용이 없어요');
      setBusy(true); setMsg('저장하는 중이에요…');
      uploadPhotos(kid, files).then(function (paths) {
        var row = { studio_id: kid.studio_id, member_id: kid.member_id, lesson_date: date, subject: subject || null, items: all,
          good: good.trim() || null, improve: improve.trim() || null, ratings: ratings, photos: photos.concat(paths), updated_at: new Date().toISOString() };
        if (ed) return sb().from('mm_lesson_log').update(row).eq('id', ed.id);
        row.teacher_name = myName(p.a);
        return sb().from('mm_lesson_log').insert(row);
      }).then(function (r) {
        setBusy(false);
        if (r && r.error) throw r.error;
        setMsg(''); p.onDone();
      }).catch(function (e) { setBusy(false); setMsg('저장하지 못했어요. 적은 내용은 그대로 있으니 인터넷을 확인하고 다시 눌러 주세요 (' + tableHint(errText(e)) + ')'); });
    }
    return h(Card, { title: (ed ? '✏️ ' + md(ed.lesson_date) + ' 기록 고치기 · ' : '📝 레슨 기록 · ') + kid.name },
      h('div', { style: S.row },
        h('input', { type: 'date', style: Object.assign({}, S.input, { width: 'auto' }), value: date, onChange: function (e) { setDate(e.target.value); } }),
        h('select', { style: Object.assign({}, S.input, { width: 'auto' }), value: subject, onChange: function (e) { setSubject(e.target.value); } },
          h('option', { value: '' }, '과목'), s.subjects.map(function (x) { return h('option', { key: x, value: x }, x); }))),

      h(Label, null, '교재와 진도 · 진도마다 고칠 점을 바로 아래에'),
      items.map(function (it, i) {
        return h('div', { key: i, style: { background: C.soft, borderRadius: 8, padding: '6px 10px', marginBottom: 6, fontSize: 13, display: 'flex', gap: 8 } },
          h('div', { style: { flex: 1 } }, (i + 1) + '. ' + itemText(it), it.fix ? h('div', { style: { color: C.mute, fontSize: 12 } }, '└ ' + it.fix) : null),
          h('button', { type: 'button', style: Object.assign({}, S.btn2, { padding: '2px 8px' }), onClick: function () { setItems(items.filter(function (_, j) { return j !== i; })); } }, '빼기'));
      }),
      h('div', { style: { border: '1px dashed ' + C.line, borderRadius: 10, padding: 10 } },
        h(BookPick, { s: s, subject: subject, kind: 'lesson', book: cur.book, vol: cur.vol, onChange: function (b, v) { setCur(Object.assign({}, cur, { book: b, vol: v })); } }),
        h('div', { style: Object.assign({ marginTop: 6 }, S.row) },
          h('div', { style: { flex: 1, minWidth: 130 } }, h(Field, { value: cur.page, placeholder: '페이지·번호 (예: p.24 / 12~15번)', onChange: function (v) { setC('page', v); } })),
          h('div', { style: { flex: 2, minWidth: 180 } }, h(Field, { value: cur.title, placeholder: '곡 제목 / 단원', onChange: function (v) { setC('title', v); } }))),
        h('div', { style: { marginTop: 6 } }, h(Field, { value: cur.fix, placeholder: '이 진도에서 고칠 점 (짧게 적어도 돼요)', onChange: function (v) { setC('fix', v); } })),
        h('button', { type: 'button', style: Object.assign({ marginTop: 8 }, S.btn2), onClick: pushItem }, '＋ 이 진도 담고 다음 진도 적기' + (items.length ? ' (' + (items.length + 1) + '번째)' : ''))),

      h(Field, { label: '잘한 점 · 학부모 글의 바탕이 됩니다', area: true, value: good, placeholder: '예: 왼손 반주 리듬이 안정적으로 잡혔어요', onChange: setGood }),

      h(Label, null, '오늘 평가 (1~5, 누르면 학부모 글에 문장이 자동으로 들어가요)'),
      s.ratingItems.map(function (it) {
        return h('div', { key: it, style: Object.assign({ marginBottom: 4 }, S.row) },
          h('span', { style: { width: 84, fontSize: 13 } }, it),
          [1, 2, 3, 4, 5].map(function (n) {
            var on = ratings[it] === n;
            return h('button', { key: n, type: 'button', style: Object.assign({}, on ? S.chipOn : S.chip, { width: 34, padding: '4px 0' }),
              onClick: function () { var o = Object.assign({}, ratings); if (on) delete o[it]; else o[it] = n; setRatings(o); } }, n);
          }));
      }),

      h(Field, { label: '전체적으로 연습할 점 · 진도마다 적었으면 비워도 돼요', area: true, value: improve, placeholder: '예: 하루 10분, 손목 힘 빼고 천천히', onChange: setImprove }),

      h(Label, null, '사진 (자동으로 줄여서 저장)'),
      h('div', { style: S.row },
        h('label', { style: Object.assign({}, S.btn2, { display: 'inline-block' }) }, '📷 사진 · 앨범',
          h('input', { type: 'file', accept: 'image/*', multiple: true, style: { display: 'none' }, onChange: function (e) { setFiles(files.concat([].slice.call(e.target.files || []))); e.target.value = ''; } })),
        files.length ? h('span', { style: S.mute }, '새 사진 ' + files.length + '장') : null,
        files.length ? h('button', { type: 'button', style: S.btn2, onClick: function () { setFiles([]); } }, '새 사진 비우기') : null),
      h(Photos, { paths: photos, size: 56, selected: photos, onToggle: function (path) { setPhotos(photos.filter(function (x) { return x !== path; })); } }),
      photos.length ? h('div', { style: S.mute }, '사진을 누르면 이 기록에서 빠져요') : null,

      h('div', { style: Object.assign({ marginTop: 12 }, S.row) },
        h('button', { type: 'button', style: S.btn, disabled: busy, onClick: save }, busy ? '저장 중…' : ed ? '고친 내용 저장' : '기록 저장'),
        ed ? h('button', { type: 'button', style: S.btn2, onClick: p.onCancel }, '그만두기') : null),
      h(Msg, { text: msg, err: !/중이에요/.test(msg) }));
  }

  /* ═════════ ② 목표 (월별·주별) + 콩쿨 준비 ═════════ */
  function periodKey(type, monthV, weekV) { return type === 'month' ? monthV : mondayOf(weekV); }
  function goalSummary(g) {
    if (!g) return '';
    var b = (g.books || []).map(function (x) { return (x.done ? '✓' : '') + bookLabel(x); });
    return b.concat(g.note ? [g.note.slice(0, 18)] : []).join(' · ');
  }
  function GoalTab(p) {
    var s = p.s, roster = p.roster, studio = p.studio;
    var _t = useState('month'), type = _t[0], setType = _t[1];
    var _mo = useState(kstDate().slice(0, 7)), monthV = _mo[0], setMonthV = _mo[1];
    var _w = useState(mondayOf(kstDate())), weekV = _w[0], setWeekV = _w[1];
    var key = periodKey(type, monthV, weekV);
    var _k = useState(''), sel = _k[0], setSel = _k[1];
    var kid = (roster.data || []).filter(function (k) { return k.member_id === sel; })[0];
    var all = useQuery(function () { return sb().from('mm_goal').select('*').eq('studio_id', studio).eq('period_type', type).eq('period_key', key); }, [type, key]);
    var byKid = {}; (all.data || []).forEach(function (g) { byKid[g.member_id] = g; });
    var sub = {}; Object.keys(byKid).forEach(function (m) { sub[m] = goalSummary(byKid[m]); });
    return h('div', null,
      h(Card, null,
        h(Chips, { items: [['month', '월별'], ['week', '주별']], value: type, onChange: setType }),
        type === 'month'
          ? h('input', { type: 'month', style: Object.assign({}, S.input, { width: 'auto' }), value: monthV, onChange: function (e) { setMonthV(e.target.value); } })
          : h('div', { style: S.row }, h('input', { type: 'date', style: Object.assign({}, S.input, { width: 'auto' }), value: weekV, onChange: function (e) { setWeekV(mondayOf(e.target.value)); } }), h('span', { style: S.mute }, md(key) + '(월) ~ ' + md(addDays(key, 6)) + '(일)')),
        h('div', { style: Object.assign({ marginTop: 6 }, S.mute) }, '아이를 누르면 목표 화면이 열려요. 정한 목표는 이름 아래에 보여요.'),
        h(Msg, { text: tableHint(all.err), err: true })),
      h(KidPicker, { kids: roster.data, value: sel, onChange: setSel, sub: sub }),
      kid && !all.loading ? h(GoalForm, { key: kid.member_id + type + key + (byKid[kid.member_id] ? byKid[kid.member_id].updated_at : '-'), kid: kid, s: s, type: type, pkey: key, goal: byKid[kid.member_id], onSaved: all.reload }) : null,
      kid ? h(ContestCard, { key: 'c' + kid.member_id, kid: kid }) : null);
  }
  function GoalForm(p) {
    var kid = p.kid, s = p.s, g = p.goal;
    var _n = useState(g ? g.note || '' : ''), note = _n[0], setNote = _n[1];
    var _b = useState(g ? g.books || [] : []), books = _b[0], setBooks = _b[1];
    var _o = useState(''), open = _o[0], setOpen = _o[1];
    var _m = useState(''), msg = _m[0], setMsg = _m[1];
    var _sj = useState(kid.subject && s.subjects.indexOf(kid.subject) >= 0 ? kid.subject : ''), subject = _sj[0], setSubject = _sj[1];
    function has(b, v, kind) { return books.some(function (x) { return x.book === b && x.vol === v && x.kind === kind; }); }
    function toggle(b, v, kind) {
      setBooks(has(b, v, kind) ? books.filter(function (x) { return !(x.book === b && x.vol === v && x.kind === kind); }) : books.concat([{ book: b, vol: v, kind: kind, done: false }]));
    }
    function save() {
      setMsg('저장 중…');
      sb().from('mm_goal').upsert({ studio_id: kid.studio_id, member_id: kid.member_id, period_type: p.type, period_key: p.pkey, note: note.trim() || null, books: books, updated_at: new Date().toISOString() },
        { onConflict: 'studio_id,member_id,period_type,period_key' }).then(function (r) {
        if (r.error) return setMsg(tableHint(errText(r.error)));
        setMsg('목표를 저장했어요 ✅'); p.onSaved();
      });
    }
    var period = p.type === 'month' ? Number(p.pkey.slice(5)) + '월' : md(p.pkey) + ' 주';
    function shelf(kind, title) {
      var list = booksFor(s, subject, kind);
      return h('div', null, h(Label, null, title + ' · 교재를 누르면 권수가 펼쳐져요'),
        h('div', { style: S.row }, list.map(function (b) {
          var vols = parseVols(b.vols), cnt = books.filter(function (x) { return x.book === b.name && x.kind === kind; }).length;
          if (vols.length === 1) return h('button', { key: b.name, type: 'button', style: has(b.name, vols[0], kind) ? S.chipOn : S.chip, onClick: function () { toggle(b.name, vols[0], kind); } }, b.name);
          return h('button', { key: b.name, type: 'button', style: open === kind + b.name || cnt ? S.chipOn : S.chip, onClick: function () { setOpen(open === kind + b.name ? '' : kind + b.name); } }, b.name + (cnt ? ' (' + cnt + ')' : '') + ' ▾');
        })),
        list.filter(function (b) { return open === kind + b.name; }).map(function (b) {
          return h('div', { key: 'v' + b.name, style: Object.assign({ marginTop: 6, paddingLeft: 8 }, S.row) }, parseVols(b.vols).map(function (v) {
            return h('button', { key: v, type: 'button', style: has(b.name, v, kind) ? S.chipOn : S.chip, onClick: function () { toggle(b.name, v, kind); } }, v + '권');
          }));
        }));
    }
    function printGoal(size) {
      var body = '<h1>' + esc(kid.name) + ' · ' + esc(period) + ' 목표</h1><div class="mute">' + esc(s.academyName || '') + '</div>' +
        (books.length ? '<h2>교재 목표</h2><table>' + books.map(function (b) { return '<tr><td style="width:24px">' + (b.done ? '☑' : '☐') + '</td><td>' + esc(bookLabel(b)) + (b.kind === 'theory' ? ' <span class="mute">(이론)</span>' : '') + '</td></tr>'; }).join('') + '</table>' : '') +
        (note ? '<h2>이번 목표</h2><div class="box pre">' + esc(note) + '</div>' : '');
      printHtml(kid.name + ' 목표표', body, size);
    }
    return h(Card, { title: '🎯 ' + kid.name + ' · ' + period + ' 목표' },
      h('select', { style: Object.assign({}, S.input, { width: 'auto', marginBottom: 4 }), value: subject, onChange: function (e) { setSubject(e.target.value); } },
        h('option', { value: '' }, '모든 과목 교재'), s.subjects.map(function (x) { return h('option', { key: x, value: x }, x); })),
      shelf('lesson', '레슨 목표'),
      (s.theoryBooks || []).length ? shelf('theory', '이론 목표') : null,
      books.length ? h('div', { style: { marginTop: 10 } }, h(Label, null, '정한 교재 목표 · 다 하면 체크'),
        books.map(function (b, i) {
          return h('label', { key: i, style: { display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, padding: '3px 0' } },
            h('input', { type: 'checkbox', checked: !!b.done, onChange: function () { setBooks(books.map(function (x, j) { return j === i ? Object.assign({}, x, { done: !x.done }) : x; })); } }),
            bookLabel(b), b.kind === 'theory' ? badge('이론', C.violet) : null);
        })) : null,
      h(Field, { label: '글로 쓰는 목표', area: true, value: note, placeholder: '예: 발표회 곡 양손 완성, 고음 발성 안정, 리듬 치기 매일 5분', onChange: setNote }),
      h('div', { style: Object.assign({ marginTop: 10 }, S.row) }, h('button', { type: 'button', style: S.btn, onClick: save }, '목표 저장')),
      h(Msg, { text: msg, err: !/✅|중/.test(msg) }),
      h(Label, null, '인쇄 · 아이 책에 붙여 주는 종이 (선생님 이름은 안 들어가요)'),
      h(PrintBar, { label: true, text: '목표표 인쇄', onPrint: printGoal }));
  }
  function ContestCard(p) {
    var kid = p.kid;
    var q = useQuery(function () { return sb().from('mm_goal').select('*').eq('studio_id', kid.studio_id).eq('member_id', kid.member_id).eq('period_type', 'contest').eq('period_key', 'current').maybeSingle(); }, [kid.member_id]);
    var c0 = (q.data && q.data.contest) || {};
    var _c = useState(null), c = _c[0], setC = _c[1];
    var cur = c || c0;
    var _o = useState(false), open = _o[0], setOpen = _o[1];
    var _m = useState(''), msg = _m[0], setMsg = _m[1];
    function set(k, v) { var n = Object.assign({}, cur); n[k] = v; setC(n); }
    function save(clear) {
      var row = { studio_id: kid.studio_id, member_id: kid.member_id, period_type: 'contest', period_key: 'current', contest: clear ? null : cur, updated_at: new Date().toISOString() };
      sb().from('mm_goal').upsert(row, { onConflict: 'studio_id,member_id,period_type,period_key' }).then(function (r) {
        if (r.error) return setMsg(errText(r.error));
        if (clear) setC({}); setMsg(clear ? '콩쿨 정보를 비웠어요' : '콩쿨 정보를 저장했어요 ✅'); q.reload();
      });
    }
    var hasData = c0 && c0.name;
    if (!open && !hasData) return h('div', { style: { marginBottom: 14 } }, h('button', { type: 'button', style: S.btn2, onClick: function () { setOpen(true); } }, '🏆 콩쿨·대회 준비 적기 (콩쿨반 아이만)'));
    return h(Card, { title: '🏆 콩쿨·대회 준비' },
      h('div', { style: S.row },
        h('input', { style: Object.assign({}, S.input, { flex: 2, minWidth: 160 }), placeholder: '대회 이름', value: cur.name || '', onChange: function (e) { set('name', e.target.value); } }),
        h('input', { type: 'date', style: Object.assign({}, S.input, { width: 'auto' }), value: cur.date || '', onChange: function (e) { set('date', e.target.value); } })),
      h('div', { style: { marginTop: 6 } }, h(Field, { value: cur.piece, placeholder: '연주곡 / 노래', onChange: function (v) { set('piece', v); } })),
      h(Field, { area: true, value: cur.note, placeholder: '준비 사항·목표 (예: 암보 완성 10/25까지, 템포 ♩=120, 무대 리허설 2회)', onChange: function (v) { set('note', v); } }),
      h('div', { style: Object.assign({ marginTop: 8 }, S.row) },
        h('button', { type: 'button', style: S.btn, onClick: function () { save(false); } }, '콩쿨 저장'),
        hasData ? h('button', { type: 'button', style: S.btn2, onClick: function () { save(true); } }, '콩쿨 끝남 (비우기)') : null,
        cur.date ? h('span', { style: S.mute }, 'D-' + Math.max(0, Math.round((new Date(cur.date + 'T00:00:00+09:00') - new Date(kstDate() + 'T00:00:00+09:00')) / 864e5))) : null),
      h(Msg, { text: msg, err: !/✅|비웠/.test(msg) }));
  }

  /* ═════════ ③ 새 책 시작 (책 고르고 아이를 누르면 기록, 다시 누르면 취소) ═════════ */
  function NewBookTab(p) {
    var s = p.s, roster = p.roster, studio = p.studio;
    var _d = useState(kstDate()), date = _d[0], setDate = _d[1];
    var _k = useState('lesson'), kind = _k[0], setKind = _k[1];
    var _b = useState(''), book = _b[0], setBook = _b[1];
    var _v = useState(''), vol = _v[0], setVol = _v[1];
    var _q = useState(''), q = _q[0], setQ = _q[1];
    var _m = useState(''), msg = _m[0], setMsg = _m[1];
    var since = addDays(kstDate(), -60);
    var list = useQuery(function () { return sb().from('mm_newbook').select('*').eq('studio_id', studio).gte('start_date', since).order('start_date', { ascending: false }).limit(300); }, [studio]);
    var bk = (book || '').trim();
    var mine = {}; (list.data || []).forEach(function (r) { if (r.book === bk && r.vol === (vol || '')) mine[r.member_id] = r; });
    var names = {}; (roster.data || []).forEach(function (k) { names[k.member_id] = k.name; });
    function tap(k) {
      if (!bk) { setMsg('위에서 책을 먼저 골라 주세요'); return; }
      var ex = mine[k.member_id];
      (ex ? sb().from('mm_newbook').delete().eq('id', ex.id)
        : sb().from('mm_newbook').insert({ studio_id: k.studio_id, member_id: k.member_id, book: bk, vol: vol || '', kind: kind, start_date: date })
      ).then(function (r) {
        if (r.error) return setMsg(tableHint(errText(r.error)));
        setMsg(k.name + (ex ? ' · 취소했어요' : ' · ' + bookLabel({ book: bk, vol: vol }) + ' 시작 ✅')); list.reload();
      });
    }
    var kids = (roster.data || []).filter(function (k) { return nameMatch(k.name, q); });
    var byDate = {}; (list.data || []).forEach(function (r) { (byDate[r.start_date] = byDate[r.start_date] || []).push(r); });
    return h('div', null,
      h(Card, { title: '📚 새로 나간 책' },
        h('div', { style: S.row },
          h('input', { type: 'date', style: Object.assign({}, S.input, { width: 'auto' }), value: date, onChange: function (e) { setDate(e.target.value); } }),
          h(Chips, { items: [['lesson', '레슨 교재'], ['theory', '이론 교재']], value: kind, onChange: function (v) { setKind(v); setBook(''); setVol(''); } })),
        h(BookPick, { s: s, subject: '', kind: kind, book: book, vol: vol, onChange: function (b, v) { setBook(b); setVol(v); } }),
        h('div', { style: Object.assign({ marginTop: 6 }, S.mute) }, '책을 고른 뒤 아래에서 아이 이름(초성도 돼요)을 누르면 "새 책 시작"으로 기록돼요. 한 번 더 누르면 취소돼요.'),
        h(Msg, { text: msg || tableHint(list.err), err: /먼저|없습니다|실행|오류|policy/.test(msg || list.err || '') })),
      h(Card, null,
        h('input', { style: S.input, placeholder: '이름 또는 초성', value: q, onChange: function (e) { setQ(e.target.value); } }),
        h('div', { style: Object.assign({ marginTop: 8 }, S.row) }, kids.map(function (k) {
          var on = !!mine[k.member_id];
          return h('button', { key: k.member_id, type: 'button', style: on ? S.chipOn : S.chip, onClick: function () { tap(k); } }, (on ? '✓ ' : '') + k.name);
        }))),
      h(Card, { title: '최근 60일 새 책 기록' },
        Object.keys(byDate).length ? Object.keys(byDate).sort().reverse().map(function (d) {
          return h('div', { key: d, style: { padding: '6px 0', borderBottom: '1px solid ' + C.line, fontSize: 13 } },
            h('b', null, md(d)), ' ', byDate[d].map(function (r) { return (names[r.member_id] || '?') + ' ' + bookLabel(r); }).join(', '));
        }) : h('div', { style: S.mute }, '아직 새 책 기록이 없어요.')));
  }

  /* ═════════ ④ 학부모 피드백 글 만들기 ═════════ */
  var TONES = [['warm', '다정하게'], ['kind', '친절하게'], ['pro', '전문적으로'], ['short', '짧게'], ['consult', '상담용']];
  function toFormal(t) {
    return t.replace(/있어요/g, '있습니다').replace(/없어요/g, '없습니다').replace(/좋아요/g, '좋습니다').replace(/했어요/g, '했습니다')
      .replace(/([았었였혔겼졌웠렸쳤켰])어요/g, '$1습니다').replace(/겠어요/g, '겠습니다').replace(/거예요/g, '것입니다')
      .replace(/돼요/g, '됩니다').replace(/해요/g, '합니다').replace(/이에요/g, '입니다').replace(/에요/g, '입니다').replace(/예요/g, '입니다')
      .replace(/져요/g, '집니다').replace(/내요/g, '냅니다').replace(/(주|보내|알려)세요/g, '$1십시오');
  }
  function buildFeedback(o) {
    var s = o.s, kid = o.kid, logs = o.logs, alt = o.alt || 0, tone = o.tone;
    var periodName = o.range === 'month' ? Number(o.start.slice(5, 7)) + '월 한 달' : o.range === 'w2' ? '지난 2주' : '이번 주';
    var L = [];
    var bullet = tone === 'warm' ? '🎵 ' : '• ';
    L.push(String(s.opening || DEFAULTS.opening).replace(/\{학원\}/g, s.academyName || '저희 학원').replace(/\{이름\}/g, kid.name).replace(/\{기간\}/g, periodName));
    if (tone === 'warm') L[0] += ' 😊';
    L.push('');
    var items = []; logs.forEach(function (l) { (l.items || []).forEach(function (it) { items.push(it); }); });
    L.push(tone === 'pro' ? '[레슨 진도] 총 ' + logs.length + '회' : tone === 'short' ? '■ 진도' : '■ 이번 기간 진도 (레슨 ' + logs.length + '회)');
    if (items.length) {
      var seen = {};
      items.forEach(function (it) {
        var t = itemText(it); if (!t || (seen[t] && !it.fix)) return; seen[t] = 1;
        L.push(bullet + t);
        if (it.fix && tone !== 'short') L.push('   └ ' + it.fix);
      });
    } else L.push(bullet + '기록된 진도가 없습니다');
    if (o.newbooks.length) L.push(bullet + '새로 시작한 책: ' + o.newbooks.map(bookLabel).join(', ') + (tone === 'warm' ? ' 🎉' : ''));
    var goods = uniq(logs.map(function (l) { return (l.good || '').trim(); }));
    var av = avgRatings(logs), rk = Object.keys(av);
    if (goods.length || rk.length) {
      L.push(''); L.push(tone === 'pro' ? '[평가]' : '■ 잘하고 있는 점');
      (tone === 'short' ? goods.slice(0, 1) : goods).forEach(function (g) { L.push(bullet + g); });
      if (tone !== 'short') rk.filter(function (k) { return av[k] >= 3; }).sort(function (a, b) { return av[b] - av[a]; }).forEach(function (k, i) { L.push(bullet + rateSentence(k, av[k], alt + i)); });
    }
    var imp = uniq(logs.map(function (l) { return (l.improve || '').trim(); }));
    var lowS = tone === 'short' ? [] : rk.filter(function (k) { return av[k] < 3; }).map(function (k, i) { return rateSentence(k, av[k], alt + i); });
    if (imp.length || lowS.length) { L.push(''); L.push(tone === 'pro' ? '[가정 연습 과제]' : '■ 집에서 연습할 점'); (tone === 'short' ? imp.slice(0, 2) : imp).concat(lowS).forEach(function (x) { L.push(bullet + x); }); }
    if (o.goal && ((o.goal.books || []).length || o.goal.note) && tone !== 'short') {
      L.push(''); L.push(tone === 'pro' ? '[목표 현황]' : '■ 목표');
      (o.goal.books || []).forEach(function (b) { L.push(bullet + bookLabel(b) + (b.done ? ' — 완료 ✓' : ' — 진행 중')); });
      if (o.goal.note) L.push(bullet + o.goal.note);
    }
    if (o.contest && o.contest.name && tone !== 'short') {
      L.push(''); L.push(tone === 'pro' ? '[대회 준비]' : '■ 대회 준비' + (tone === 'warm' ? ' 🏆' : ''));
      L.push(bullet + o.contest.name + (o.contest.date ? ' (' + md(o.contest.date) + ')' : '') + (o.contest.piece ? ' · ' + o.contest.piece : ''));
      if (o.contest.note) L.push(bullet + o.contest.note);
    }
    if (tone === 'consult') {
      var lows = rk.filter(function (k) { return av[k] < 3; });
      var undone = ((o.goal && o.goal.books) || []).filter(function (b) { return !b.done; });
      L.push(''); L.push('■ 상담 때 함께 나누면 좋을 이야기');
      if (lows.length) L.push(bullet + lows.join(', ') + ' 부분을 집에서 어떻게 도와주실 수 있을지');
      if (undone.length) L.push(bullet + '남은 목표: ' + undone.map(bookLabel).join(', '));
      L.push(bullet + '아이가 요즘 음악을 대하는 마음과 집 연습 시간');
    }
    var cl = o.range === 'month' ? s.closingM : o.range === 'w2' ? s.closing2 : s.closing1;
    cl = (cl || []).filter(Boolean);
    if (cl.length && tone !== 'short') { L.push(''); L.push(cl[alt % cl.length] + (tone === 'warm' ? ' 💛' : '')); }
    var text = L.join('\n');
    return tone === 'pro' ? toFormal(text) : text;
  }
  function FeedbackTab(p) {
    var s = p.s, roster = p.roster;
    var _k = useState(''), sel = _k[0], setSel = _k[1];
    var kid = (roster.data || []).filter(function (k) { return k.member_id === sel; })[0];
    return h('div', null,
      h(KidPicker, { kids: roster.data, value: sel, onChange: setSel }),
      kid ? h(FeedbackMaker, { key: kid.member_id, kid: kid, s: s }) : h('div', { style: S.mute }, '학생을 고르면 레슨 기록으로 학부모 글을 자동으로 만들어 드려요.'));
  }
  function FeedbackMaker(p) {
    var kid = p.kid, s = p.s;
    var _r = useState('w1'), range = _r[0], setRange = _r[1];
    var _ws = useState(mondayOf(kstDate())), ws = _ws[0], setWs = _ws[1];
    var _mo = useState(kstDate().slice(0, 7)), mo = _mo[0], setMo = _mo[1];
    var _t = useState('kind'), tone = _t[0], setTone = _t[1];
    var _al = useState(0), alt = _al[0], setAlt = _al[1];
    var _tx = useState(''), text = _tx[0], setText = _tx[1];
    var _ch = useState(true), chartOn = _ch[0], setChartOn = _ch[1];
    var _ps = useState([]), pick = _ps[0], setPick = _ps[1];
    var _m = useState(''), msg = _m[0], setMsg = _m[1];
    var start = range === 'month' ? mo + '-01' : ws;
    var end = range === 'month' ? monthEnd(mo) : addDays(ws, range === 'w2' ? 13 : 6);
    var title = range === 'month' ? Number(mo.slice(5)) + '월 레슨 소식' : md(start) + '~' + md(end) + ' 레슨 소식';
    var logs = useQuery(function () { return sb().from('mm_lesson_log').select('*').eq('studio_id', kid.studio_id).eq('member_id', kid.member_id).gte('lesson_date', start).lte('lesson_date', end).order('lesson_date'); }, [start, end]);
    var nbs = useQuery(function () { return sb().from('mm_newbook').select('*').eq('studio_id', kid.studio_id).eq('member_id', kid.member_id).gte('start_date', start).lte('start_date', end); }, [start, end]);
    var goalType = range === 'month' ? 'month' : 'week';
    var goal = useQuery(function () { return sb().from('mm_goal').select('*').eq('studio_id', kid.studio_id).eq('member_id', kid.member_id).in('period_key', [start.slice(0, 7), ws, 'current']); }, [start, ws]);
    var posted = useQuery(function () { return sb().from('mm_feedback').select('*').eq('studio_id', kid.studio_id).eq('member_id', kid.member_id).order('created_at', { ascending: false }).limit(24); }, [kid.member_id]);
    var gWeek = (goal.data || []).filter(function (x) { return x.period_type === 'week' && x.period_key === ws; })[0];
    var gMonth = (goal.data || []).filter(function (x) { return x.period_type === 'month' && x.period_key === start.slice(0, 7); })[0];
    var g = goalType === 'week' && gWeek && ((gWeek.books || []).length || gWeek.note) ? gWeek : gMonth;   // 주 목표가 없으면 그 달 목표
    var contest = ((goal.data || []).filter(function (x) { return x.period_type === 'contest'; })[0] || {}).contest;
    var av = avgRatings(logs.data);
    var photos = []; (logs.data || []).forEach(function (l) { photos = photos.concat(l.photos || []); });
    var ready = !logs.loading && !nbs.loading && !goal.loading;
    function make(t, a) {
      return buildFeedback({ s: s, kid: kid, logs: logs.data || [], newbooks: nbs.data || [], goal: g, contest: contest, range: range, start: start, tone: t, alt: a });
    }
    useEffect(function () { if (ready) { setText(make(tone, alt)); setPick(photos.slice(0, 4)); } }, [ready, start, end, tone, alt]);
    function copy() {
      var done = function () { setMsg('복사했어요. 카톡에 붙여 넣으세요 ✅'); };
      if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, function () { setMsg('복사가 막혀 있어요. 글을 길게 눌러 복사해 주세요'); });
      else setMsg('글을 길게 눌러 복사해 주세요');
    }
    function publish() {
      setMsg('올리는 중…');
      sb().from('mm_feedback').insert({ studio_id: kid.studio_id, member_id: kid.member_id, title: title, start_date: start, end_date: end, body: text,
        chart: chartOn && Object.keys(av).length ? av : null, photos: pick, published: true }).then(function (r) {
        if (r.error) return setMsg(tableHint(errText(r.error)));
        setMsg('학부모 페이지에 올렸어요 ✅ (학부모 화면 "우리 아이 기록"에서 보여요)'); posted.reload();
      });
    }
    function print(size) {
      var body = '<h1>' + esc(kid.name) + ' · ' + esc(title) + '</h1><div class="pre">' + esc(text) + '</div>' +
        (chartOn && Object.keys(av).length ? '<h2>평가 그래프</h2>' + chartSvg(av) : '');
      printHtml(kid.name + ' ' + title, body, size);
    }
    return h('div', null,
      h(Card, { title: '✉️ ' + kid.name + ' 학부모 글 만들기' },
        h(Label, null, '어느 기간으로'),
        h(Chips, { items: [['w1', '1주'], ['w2', '2주'], ['month', '한 달']], value: range, onChange: setRange }),
        range === 'month'
          ? h('input', { type: 'month', style: Object.assign({}, S.input, { width: 'auto' }), value: mo, onChange: function (e) { setMo(e.target.value); } })
          : h('div', { style: S.row }, h('input', { type: 'date', style: Object.assign({}, S.input, { width: 'auto' }), value: ws, onChange: function (e) { setWs(mondayOf(e.target.value)); } }), h('span', { style: S.mute }, md(start) + ' ~ ' + md(end) + ' · 레슨 ' + (logs.data || []).length + '회')),
        h(Label, null, '말투 · 누르면 바로 다시 써져요'),
        h(Chips, { items: TONES, value: tone, onChange: setTone }),
        h(Msg, { text: tableHint(logs.err), err: true }),
        h(Label, null, '보낼 글 · 고쳐서 쓰세요 (선생님 이름은 들어가지 않아요)'),
        h('textarea', { style: Object.assign({}, S.input, { minHeight: 280, lineHeight: 1.6 }), value: text, onChange: function (e) { setText(e.target.value); } }),
        h('div', { style: Object.assign({ marginTop: 8 }, S.row) },
          h('button', { type: 'button', style: S.btn2, onClick: function () { setText(make(tone, alt)); } }, '↻ 다시 만들기'),
          h('button', { type: 'button', style: S.btn2, onClick: function () { setAlt(alt + 1); } }, '✨ 다르게 써 보기'),
          h('button', { type: 'button', style: S.btn2, onClick: copy }, '📋 복사하기')),
        Object.keys(av).length ? h('div', null,
          h('label', { style: Object.assign({ marginTop: 10 }, S.row, { fontSize: 13 }) }, h('input', { type: 'checkbox', checked: chartOn, onChange: function () { setChartOn(!chartOn); } }), '평가 그래프 넣기 (이 기간 평가로 자동)'),
          chartOn ? h(Chart, { data: av }) : null) : null,
        photos.length ? h('div', null, h(Label, null, '같이 올릴 사진 · 누르면 빼기/넣기'),
          h(Photos, { paths: photos, selected: pick, onToggle: function (x) { setPick(pick.indexOf(x) >= 0 ? pick.filter(function (y) { return y !== x; }) : pick.concat([x])); } })) : null,
        h(Label, null, '인쇄 · 올리기'),
        h(PrintBar, { text: '이 글을 인쇄', onPrint: print }),
        h('div', { style: Object.assign({ marginTop: 10 }, S.row) }, h('button', { type: 'button', style: S.btn, onClick: publish, disabled: !text.trim() }, '📤 학부모 페이지에 올리기')),
        h('div', { style: S.mute }, '"올리기"를 눌러야 학부모 화면에 보여요. 올린 글은 아래에 쌓입니다.'),
        h(Msg, { text: msg, err: !/✅|중/.test(msg) })),
      h(Card, { title: '올린 피드백 ' + (posted.data || []).length + '개' },
        (posted.data || []).length ? (posted.data || []).map(function (f) {
          return h('div', { key: f.id, style: Object.assign({ borderBottom: '1px solid ' + C.line, padding: '8px 0' }, S.row) },
            h('b', { style: { fontSize: 13 } }, f.title || md(f.start_date)), f.published ? badge('보이는 중', C.green) : badge('내림', C.mute),
            h('span', { style: S.mute }, md(kstDate(new Date(f.created_at))) + ' 올림'), h('span', { style: { flex: 1 } }),
            h('button', { type: 'button', style: S.btn2, onClick: function () { sb().from('mm_feedback').update({ published: !f.published }).eq('id', f.id).then(posted.reload); } }, f.published ? '내리기' : '다시 올리기'));
        }) : h('div', { style: S.mute }, '아직 올린 글이 없어요')));
  }

  /* ═════════ ⑤ 설정 (교재·평가 항목·과목·문구) + 엑셀 + 폰 잠금 ═════════ */
  function lines(v) { return String(v || '').split('\n').map(function (x) { return x.trim(); }).filter(Boolean); }
  function NoteSettings(p) {
    var a = p.account, studio = p.studio, s0 = p.s;
    var _s = useState(JSON.parse(JSON.stringify(s0))), s = _s[0], setS = _s[1];
    var _m = useState(''), msg = _m[0], setMsg = _m[1];
    var _nb = useState({ name: '', vols: '', subject: '' }), nb = _nb[0], setNb = _nb[1];
    var _nt = useState({ name: '', vols: '' }), nt = _nt[0], setNt = _nt[1];
    var _sj = useState(''), ns = _sj[0], setNs = _sj[1];
    function put(k, v) { var n = Object.assign({}, s); n[k] = v; setS(n); }
    function save() {
      setMsg('저장 중…');
      sb().from('mm_note_settings').upsert({ studio_id: studio, data: s, updated_at: new Date().toISOString() }).then(function (r) {
        if (r.error) return setMsg(tableHint(errText(r.error)));
        setMsg('설정을 저장했어요 ✅'); p.onSaved();
      });
    }
    function bookRows(key) {
      return (s[key] || []).map(function (b, i) {
        return h('div', { key: key + i, style: Object.assign({ padding: '4px 0', borderBottom: '1px solid ' + C.line, fontSize: 13 }, S.row) },
          h('span', { style: { flex: 1 } }, b.name, b.vols ? h('span', { style: S.mute }, ' · ' + b.vols + '권') : null, b.subject ? ' ' : null, b.subject ? badge(b.subject, C.blue) : null),
          h('button', { type: 'button', style: Object.assign({}, S.btn2, { padding: '2px 8px' }), onClick: function () { put(key, s[key].filter(function (_, j) { return j !== i; })); } }, '삭제'));
      });
    }
    if (!isAdmin(a)) return h(Card, null, h('div', { style: S.mute }, '성장노트 설정은 원장·실장만 바꿀 수 있어요.'), h(LockCard, null));
    return h('div', null,
      h(Card, { title: '🏫 학원 이름 · 과목' },
        h('input', { style: S.input, placeholder: '학원 이름 (학부모 글 첫 줄에 들어가요)', value: s.academyName || '', onChange: function (e) { put('academyName', e.target.value); } }),
        h(Label, null, '과목 (기록 구분)'),
        h('div', { style: S.row }, s.subjects.map(function (x) {
          return h('button', { key: x, type: 'button', style: S.chip, title: '눌러서 삭제', onClick: function () { put('subjects', s.subjects.filter(function (y) { return y !== x; })); } }, x + ' ✕');
        })),
        h('div', { style: Object.assign({ marginTop: 6 }, S.row) },
          h('input', { style: Object.assign({}, S.input, { width: 180 }), placeholder: '과목 추가 (예: 우쿨렐레)', value: ns, onChange: function (e) { setNs(e.target.value); } }),
          h('button', { type: 'button', style: S.btn2, onClick: function () { if (ns.trim()) { put('subjects', uniq(s.subjects.concat([ns.trim()]))); setNs(''); } } }, '추가'))),
      h(Card, { title: '📖 레슨 교재' },
        bookRows('lessonBooks'),
        h('div', { style: Object.assign({ marginTop: 6 }, S.row) },
          h('input', { style: Object.assign({}, S.input, { flex: 2, minWidth: 130 }), placeholder: '교재 이름', value: nb.name, onChange: function (e) { setNb(Object.assign({}, nb, { name: e.target.value })); } }),
          h('input', { style: Object.assign({}, S.input, { width: 110 }), placeholder: '권수 (예: 1-4)', value: nb.vols, onChange: function (e) { setNb(Object.assign({}, nb, { vols: e.target.value })); } }),
          h('select', { style: Object.assign({}, S.input, { width: 'auto' }), value: nb.subject, onChange: function (e) { setNb(Object.assign({}, nb, { subject: e.target.value })); } },
            h('option', { value: '' }, '모든 과목'), s.subjects.map(function (x) { return h('option', { key: x, value: x }, x); })),
          h('button', { type: 'button', style: S.btn2, onClick: function () { if (nb.name.trim()) { put('lessonBooks', (s.lessonBooks || []).concat([{ name: nb.name.trim(), vols: nb.vols.trim(), subject: nb.subject }])); setNb({ name: '', vols: '', subject: '' }); } } }, '추가'))),
      h(Card, { title: '📘 이론 교재' },
        bookRows('theoryBooks'),
        h('div', { style: Object.assign({ marginTop: 6 }, S.row) },
          h('input', { style: Object.assign({}, S.input, { flex: 2, minWidth: 130 }), placeholder: '교재 이름', value: nt.name, onChange: function (e) { setNt(Object.assign({}, nt, { name: e.target.value })); } }),
          h('input', { style: Object.assign({}, S.input, { width: 110 }), placeholder: '권수 (예: 1-14)', value: nt.vols, onChange: function (e) { setNt(Object.assign({}, nt, { vols: e.target.value })); } }),
          h('button', { type: 'button', style: S.btn2, onClick: function () { if (nt.name.trim()) { put('theoryBooks', (s.theoryBooks || []).concat([{ name: nt.name.trim(), vols: nt.vols.trim(), subject: '' }])); setNt({ name: '', vols: '' }); } } }, '추가'))),
      h(Card, { title: '⭐ 평가 항목 (레슨 기록에서 1~5로 누르는 항목, 한 줄에 하나)' },
        h('textarea', { style: Object.assign({}, S.input, { minHeight: 120 }), value: (s.ratingItems || []).join('\n'), onChange: function (e) { put('ratingItems', lines(e.target.value)); } }),
        h('div', { style: S.mute }, Object.keys(RT).join('·') + ' 은 문장이 미리 준비돼 있고, 새 항목은 "항목: 잘하고 있어요" 식으로 나가요.')),
      h(Card, { title: '✉️ 학부모 피드백 문구' },
        h(Label, null, '첫 인사 ({학원} {이름} {기간} 이 자동으로 바뀌어요)'),
        h('textarea', { style: Object.assign({}, S.input, { minHeight: 50 }), value: s.opening || '', onChange: function (e) { put('opening', e.target.value); } }),
        h(Label, null, '1주 맺음말 (한 줄에 하나, 번갈아 나가요)'),
        h('textarea', { style: Object.assign({}, S.input, { minHeight: 60 }), value: (s.closing1 || []).join('\n'), onChange: function (e) { put('closing1', lines(e.target.value)); } }),
        h(Label, null, '2주 맺음말'),
        h('textarea', { style: Object.assign({}, S.input, { minHeight: 60 }), value: (s.closing2 || []).join('\n'), onChange: function (e) { put('closing2', lines(e.target.value)); } }),
        h(Label, null, '한 달 맺음말'),
        h('textarea', { style: Object.assign({}, S.input, { minHeight: 60 }), value: (s.closingM || []).join('\n'), onChange: function (e) { put('closingM', lines(e.target.value)); } })),
      h('div', { style: Object.assign({ marginBottom: 14 }, S.row) }, h('button', { type: 'button', style: S.btn, onClick: save }, '설정 저장'), h(Msg, { text: msg, err: !/✅|중/.test(msg) })),
      h(ExportCard, { studio: studio, roster: p.roster }),
      h(LockCard, null));
  }

  function loadSheetJS() {
    if (window.XLSX) return Promise.resolve();
    return new Promise(function (res, rej) {
      var sc = document.createElement('script');
      sc.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
      sc.onload = res; sc.onerror = function () { rej(new Error('엑셀 도구를 불러오지 못했습니다(인터넷 확인)')); };
      document.head.appendChild(sc);
    });
  }
  function ExportCard(p) {
    var _w = useState('this'), which = _w[0], setWhich = _w[1];
    var _mo = useState(kstDate().slice(0, 7)), mo = _mo[0], setMo = _mo[1];
    var _m = useState(''), msg = _m[0], setMsg = _m[1];
    function go() {
      var now = kstDate().slice(0, 7), last = addDays(now + '-01', -1).slice(0, 7);
      var m = which === 'this' ? now : which === 'last' ? last : which === 'pick' ? mo : null;
      var names = {}; ((p.roster && p.roster.data) || []).forEach(function (k) { names[k.member_id] = k.name; });
      setMsg('만드는 중…');
      var q = sb().from('mm_lesson_log').select('*').eq('studio_id', p.studio).order('lesson_date');
      if (m) q = q.gte('lesson_date', m + '-01').lte('lesson_date', monthEnd(m));
      Promise.all([loadSheetJS(), q.limit(5000)]).then(function (r) {
        var res = r[1]; if (res.error) throw res.error;
        var rows = (res.data || []).map(function (l) {
          var o = { '날짜': l.lesson_date, '학생': names[l.member_id] || l.member_id, '과목': l.subject || '', '선생님': l.teacher_name || '',
            '진도': (l.items || []).map(itemText).join(' / '), '진도별 고칠 점': (l.items || []).map(function (it) { return it.fix; }).filter(Boolean).join(' / '),
            '잘한 점': l.good || '', '연습할 점': l.improve || '' };
          Object.keys(l.ratings || {}).forEach(function (k) { o['평가:' + k] = l.ratings[k]; });
          return o;
        });
        if (!rows.length) { setMsg('이 기간의 기록이 없습니다.'); return; }
        var wb = window.XLSX.utils.book_new();
        window.XLSX.utils.book_append_sheet(wb, window.XLSX.utils.json_to_sheet(rows), '레슨기록');
        window.XLSX.writeFile(wb, '레슨기록_' + (m || '전체') + '.xlsx');
        setMsg(rows.length + '건을 파일로 받았어요 ✅ (구글 시트에서도 열 수 있어요)');
      }).catch(function (e) { setMsg(tableHint(errText(e))); });
    }
    return h(Card, { title: '📤 레슨 기록 내보내기 (엑셀 · 구글 시트)' },
      h(Chips, { items: [['this', '이번 달'], ['last', '지난달'], ['all', '전체'], ['pick', '달 고르기']], value: which, onChange: setWhich }),
      which === 'pick' ? h('input', { type: 'month', style: Object.assign({}, S.input, { width: 'auto', marginBottom: 6 }), value: mo, onChange: function (e) { setMo(e.target.value); } }) : null,
      h('div', null, h('button', { type: 'button', style: S.btn2, onClick: go }, '파일 만들기')),
      h(Msg, { text: msg, err: !/✅|중/.test(msg) }));
  }

  /* ───────── 폰 앱 잠금 (이 기기에서만 · 4자리) ───────── */
  var LOCK_KEY = 'mm_note_lock_pin';
  function getPin() { try { return localStorage.getItem(LOCK_KEY) || ''; } catch (e) { return ''; } }
  function setPinStore(v) { try { if (v) localStorage.setItem(LOCK_KEY, v); else localStorage.removeItem(LOCK_KEY); } catch (e) { /* ignore */ } }
  function LockCard() {
    var _p = useState(getPin()), pin = _p[0], setPin = _p[1];
    var _n = useState(''), np = _n[0], setNp = _n[1];
    var _m = useState(''), msg = _m[0], setMsg = _m[1];
    return h(Card, { title: '🔒 이 폰 앱 잠금' },
      h('div', { style: S.mute }, pin ? '켜져 있어요. 앱을 열거나 1분 넘게 나갔다 오면 번호를 물어요.' : '꺼져 있어요. 켜 두면 아이들이 선생님 폰을 만져도 기록을 못 봐요.'),
      h('div', { style: Object.assign({ marginTop: 8 }, S.row) },
        h('input', { type: 'password', inputMode: 'numeric', maxLength: 4, style: Object.assign({}, S.input, { width: 110 }), placeholder: '숫자 4자리', value: np, onChange: function (e) { setNp(e.target.value.replace(/\D/g, '').slice(0, 4)); } }),
        h('button', { type: 'button', style: S.btn2, onClick: function () { if (np.length !== 4) return setMsg('숫자 4자리로 정해 주세요'); setPinStore(np); setPin(np); setNp(''); setMsg('잠금을 켰어요 ✅'); } }, '잠금 번호 정하기'),
        pin ? h('button', { type: 'button', style: S.btn2, onClick: function () { setPinStore(''); setPin(''); setMsg('잠금을 껐어요 ✅'); } }, '잠금 끄기') : null),
      h(Msg, { text: msg, err: !/✅/.test(msg) }));
  }
  function MMLock(p) {
    var a = p.account;
    var _l = useState(!!getPin()), locked = _l[0], setLocked = _l[1];
    var _v = useState(''), v = _v[0], setV = _v[1];
    var _m = useState(''), msg = _m[0], setMsg = _m[1];
    useEffect(function () {
      var hiddenAt = 0;
      function onVis() {
        if (document.visibilityState === 'hidden') hiddenAt = Date.now();
        else if (hiddenAt && Date.now() - hiddenAt > 60000 && getPin()) setLocked(true);
      }
      document.addEventListener('visibilitychange', onVis);
      return function () { document.removeEventListener('visibilitychange', onVis); };
    }, []);
    if (!isStaff(a) || !locked || !getPin()) return null;
    function tryPin(x) {
      setV(x); setMsg('');
      if (x.length === 4) { if (x === getPin()) { setLocked(false); setV(''); } else { setMsg('번호가 달라요'); setV(''); } }
    }
    return h('div', { role: 'dialog', 'aria-modal': true, style: { position: 'fixed', inset: 0, zIndex: 99999, background: '#0f0c1e', color: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24 } },
      h('div', { style: { fontSize: 34 } }, '🔒'),
      h('div', { style: { fontWeight: 800, fontSize: 18 } }, '잠금 번호를 눌러 주세요'),
      h('input', { autoFocus: true, type: 'password', inputMode: 'numeric', maxLength: 4, value: v, onChange: function (e) { tryPin(e.target.value.replace(/\D/g, '').slice(0, 4)); },
        style: { fontSize: 28, letterSpacing: 12, textAlign: 'center', width: 160, padding: 10, borderRadius: 12, border: 'none' } }),
      msg ? h('div', { style: { color: '#fca5a5', fontSize: 13 } }, msg) : null,
      h('button', { type: 'button', style: { background: 'transparent', color: '#9ca3af', border: 'none', fontSize: 12, textDecoration: 'underline', cursor: 'pointer' },
        onClick: function () { setPinStore(''); var c = sb(); (c ? c.auth.signOut() : Promise.resolve()).then(function () { location.reload(); }); } }, '번호를 잊었어요 (로그아웃 후 다시 로그인)'));
  }

  /* ═════════ 운영자·강사 화면: 성장노트 ═════════ */
  function MMNoteBoard(p) {
    var a = p.account, studio = String(a.studioId);
    var st = useSettings(studio);
    var roster = useRoster();
    var _t = useState('log'), tab = _t[0], setTab = _t[1];
    var tabs = [['log', '레슨 기록'], ['goal', '목표'], ['newbook', '새 책'], ['feedback', '학부모 글'], ['settings', '노트 설정']];
    return h('div', null,
      h(Chips, { items: tabs, value: tab, onChange: setTab }),
      st.err ? h(Card, null, h(Msg, { text: tableHint(st.err), err: true })) : null,
      tab === 'log' ? h(LogTab, { account: a, s: st.s, roster: roster }) : null,
      tab === 'goal' ? h(GoalTab, { s: st.s, roster: roster, studio: studio }) : null,
      tab === 'newbook' ? h(NewBookTab, { s: st.s, roster: roster, studio: studio }) : null,
      tab === 'feedback' ? h(FeedbackTab, { s: st.s, roster: roster }) : null,
      tab === 'settings' ? h(NoteSettings, { key: JSON.stringify(st.s).length + ':' + st.loading, account: a, studio: studio, s: st.s, roster: roster, onSaved: st.reload }) : null);
  }

  /* ═════════ 학생·학부모 화면: 피드백 · 목표 · 콩쿨 · 새 책 ═════════ */
  function MMNoteParent(p) {
    var kid = p.kid;
    var fb = useQuery(function () { return sb().from('mm_feedback').select('*').eq('studio_id', kid.studio_id).eq('member_id', kid.member_id).eq('published', true).order('created_at', { ascending: false }).limit(12); }, [kid.member_id]);
    var month = kstDate().slice(0, 7), week = mondayOf(kstDate());
    var goals = useQuery(function () { return sb().from('mm_goal').select('*').eq('studio_id', kid.studio_id).eq('member_id', kid.member_id).in('period_key', [month, week, 'current']); }, [kid.member_id]);
    var nbs = useQuery(function () { return sb().from('mm_newbook').select('*').eq('studio_id', kid.studio_id).eq('member_id', kid.member_id).order('start_date', { ascending: false }).limit(10); }, [kid.member_id]);
    var _o = useState(0), open = _o[0], setOpen = _o[1];
    var gm = (goals.data || []).filter(function (g) { return g.period_type === 'month' && g.period_key === month; })[0];
    var gw = (goals.data || []).filter(function (g) { return g.period_type === 'week' && g.period_key === week; })[0];
    var ct = ((goals.data || []).filter(function (g) { return g.period_type === 'contest'; })[0] || {}).contest;
    if (fb.err && /relation|does not exist|schema cache/i.test(fb.err)) return null;   // 아직 성장노트를 켜지 않은 학원
    function goalBox(g, title) {
      if (!g || (!(g.books || []).length && !g.note)) return null;
      return h('div', { style: { marginBottom: 8 } }, h('div', { style: { fontWeight: 700, fontSize: 13 } }, title),
        (g.books || []).map(function (b, i) { return h('div', { key: i, style: { fontSize: 13 } }, (b.done ? '☑ ' : '☐ ') + bookLabel(b)); }),
        g.note ? h('div', { style: { fontSize: 13, whiteSpace: 'pre-wrap', marginTop: 2 } }, g.note) : null);
    }
    var hasGoal = goalBox(gm, '') || goalBox(gw, '') || (ct && ct.name);
    return h('div', null,
      h(Card, { title: '✉️ 선생님이 보낸 레슨 소식' },
        (fb.data || []).length ? (fb.data || []).map(function (f, i) {
          var on = open === i;
          return h('div', { key: f.id, style: { borderBottom: '1px solid ' + C.line, padding: '8px 0' } },
            h('button', { type: 'button', onClick: function () { setOpen(on ? -1 : i); }, style: { background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontWeight: 700, fontSize: 14, color: C.ink, textAlign: 'left' } },
              (on ? '▾ ' : '▸ ') + (f.title || '레슨 소식'), h('span', { style: Object.assign({ marginLeft: 8, fontWeight: 400 }, S.mute) }, md(kstDate(new Date(f.created_at))))),
            on ? h('div', null,
              h('div', { style: { fontSize: 14, whiteSpace: 'pre-wrap', lineHeight: 1.7, marginTop: 6 } }, f.body),
              f.chart ? h('div', { style: { marginTop: 8 } }, h(Chart, { data: f.chart })) : null,
              h(Photos, { paths: f.photos, size: 96 })) : null);
        }) : h('div', { style: S.mute }, fb.loading ? '불러오는 중…' : '아직 올라온 소식이 없어요')),
      hasGoal ? h(Card, { title: '🎯 이번 목표' },
        goalBox(gm, Number(month.slice(5)) + '월 목표'), goalBox(gw, '이번 주 목표'),
        ct && ct.name ? h('div', { style: { fontSize: 13, background: C.soft, borderRadius: 8, padding: 8 } },
          '🏆 ' + ct.name + (ct.date ? ' · ' + md(ct.date) : '') + (ct.piece ? '\n🎼 ' + ct.piece : '') + (ct.note ? '\n' + ct.note : '')) : null) : null,
      (nbs.data || []).length ? h(Card, { title: '📚 새로 시작한 책' },
        (nbs.data || []).map(function (r) { return h('div', { key: r.id, style: { fontSize: 13 } }, md(r.start_date) + ' · ' + bookLabel(r)); })) : null);
  }

  window.MMNoteBoard = MMNoteBoard;
  window.MMNoteParent = MMNoteParent;
  window.MMLock = MMLock;
  window.MMNote = { chosung: chosung, nameMatch: nameMatch, parseVols: parseVols, buildFeedback: buildFeedback, chartSvg: chartSvg, toFormal: toFormal, mondayOf: mondayOf, monthEnd: monthEnd, DEFAULTS: DEFAULTS };
})();
