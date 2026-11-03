/* ScheduleMate 확장: 등원/하원 · 연습/수업 녹음 · AI 요약 · 앱 이탈 기록 · 푸시 · 강사 권한 · 레슨일지 연결(mm-note.js) · 역할별 권한
 * 의존: React(전역), getSb()(index.html), phoneToEmail()(index.html), mm-config.js
 * 모든 데이터는 새 테이블(mm_*)에 저장되며 권한은 서버(RLS)가 판단합니다. */
(function () {
  'use strict';
  var R = window.React, h = R.createElement;
  var useState = R.useState, useEffect = R.useEffect, useRef = R.useRef, useCallback = R.useCallback;
  var CFG = window.MM_CONFIG || {};

  /* ───────── 공통 도우미 ───────── */
  function sb() { return window.getSb && window.getSb(); }
  function kstDate(d) { return (d || new Date()).toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' }); }
  function kstStart(dateStr) { return dateStr + 'T00:00:00+09:00'; }
  function hhmm(ts) { return ts ? new Date(ts).toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false }) : '-'; }
  function mdhm(ts) { return new Date(ts).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }); }
  function mail(phone) { return phone && window.phoneToEmail ? window.phoneToEmail(phone).toLowerCase() : null; }
  function isAdmin(a) { return a && (a.role === '원장' || a.role === '실장' || a.role === '슈퍼어드민'); }
  function isOwner(a) { return a && (a.role === '원장' || a.role === '슈퍼어드민'); }
  /* ───────── 권한표 (설정 > 권한 체크리스트) ───────── */
  function mmPerm(key, role) {
    if (role === '원장' || role === '슈퍼어드민') return true;
    var ps = window.__mmPerm || {}, v = ps[key] && ps[key][role];
    if (v === undefined && typeof window.initPermSettings === 'function') { var d = window.initPermSettings()[key]; v = d ? d[role] : undefined; }
    return v !== false;
  }
  window.mmPerm = mmPerm;
  // 스케줄 수업 상세에서 수업 내용(레슨 메모·AI 분석·자료)을 보여 줄지
  window.mmCanSeeLessonContent = function (a, cls, instructors) {
    var role = a && a.role;
    if (role !== '실장' && role !== '강사') return true;
    if (mmPerm('canViewLessonNotes', role)) return true;
    var nm = ((a && a.name) || '').replace(/ \(.*\)/, '');
    var mine = [a && a.id].concat((instructors || []).filter(function (i) { return nm && i.name === nm; }).map(function (i) { return i.id; }));
    return !!(cls && mine.indexOf(cls.instructorId) >= 0);
  };
  function syncRoster(studio, rows) {
    return sb().rpc('mm_roster_sync', { p_studio: studio, p_rows: rows }).then(function (r) {
      if (r.error && /function|schema cache|does not exist/i.test(r.error.message || '')) return sb().from('mm_roster').upsert(rows, { onConflict: 'studio_id,member_id' });
      return r;
    });
  }
  function errText(e) { return (e && (e.message || e.error_description || e.msg)) || String(e || '알 수 없는 오류'); }

  var C = { bg: '#fff', line: '#e5e7eb', mute: '#6b7280', pink: '#E07B8B', green: '#10b981', amber: '#f59e0b', red: '#ef4444', ink: '#111827', soft: '#f9fafb' };
  var S = {
    wrap: { padding: 16, maxWidth: 980, margin: '0 auto', color: C.ink, fontFamily: 'inherit' },
    card: { background: C.bg, border: '1px solid ' + C.line, borderRadius: 14, padding: 16, marginBottom: 14 },
    h2: { fontSize: 18, fontWeight: 800, margin: '0 0 10px' },
    h3: { fontSize: 14, fontWeight: 700, margin: '0 0 8px' },
    mute: { color: C.mute, fontSize: 12 },
    btn: { border: 'none', borderRadius: 10, padding: '9px 14px', fontWeight: 700, cursor: 'pointer', background: C.pink, color: '#fff', fontSize: 13 },
    btn2: { border: '1px solid ' + C.line, borderRadius: 10, padding: '8px 12px', fontWeight: 600, cursor: 'pointer', background: '#fff', color: C.ink, fontSize: 13 },
    input: { border: '1px solid ' + C.line, borderRadius: 8, padding: '8px 10px', fontSize: 13, width: '100%', boxSizing: 'border-box' },
    row: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
    th: { textAlign: 'left', fontSize: 12, color: C.mute, padding: '6px 8px', borderBottom: '1px solid ' + C.line },
    td: { padding: '8px', borderBottom: '1px solid ' + C.line, fontSize: 13 },
  };
  function badge(text, color) { return h('span', { style: { background: color + '22', color: color, borderRadius: 999, padding: '2px 9px', fontSize: 12, fontWeight: 700 } }, text); }
  function Card(props) { return h('div', { style: S.card }, props.title ? h('h3', { style: S.h3 }, props.title) : null, props.children); }
  function Msg(props) { return props.text ? h('div', { style: { fontSize: 12, color: props.err ? C.red : C.green, margin: '6px 0' } }, props.text) : null; }
  function Tabs(props) {
    return h('div', { style: { display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' } }, props.items.map(function (t) {
      var on = props.value === t[0];
      return h('button', { key: t[0], onClick: function () { props.onChange(t[0]); }, style: Object.assign({}, on ? S.btn : S.btn2) }, t[1]);
    }));
  }

  /* ───────── 녹음 도우미 ───────── */
  function pickMime() {
    if (!window.MediaRecorder) return null;
    var list = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
    for (var i = 0; i < list.length; i++) if (MediaRecorder.isTypeSupported(list[i])) return list[i];
    return '';
  }
  function useRecorder() {
    var _s = useState('idle'), state = _s[0], setState = _s[1];
    var _e = useState(0), secs = _e[0], setSecs = _e[1];
    var ref = useRef({ mr: null, chunks: [], t0: 0, timer: null, stream: null });
    var start = useCallback(function () {
      var mime = pickMime();
      if (mime === null) return Promise.reject(new Error('이 기기는 녹음을 지원하지 않습니다'));
      return navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
        var r = ref.current; r.stream = stream; r.chunks = [];
        r.mr = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 64000 } : { audioBitsPerSecond: 64000 });
        r.mr.ondataavailable = function (ev) { if (ev.data && ev.data.size) r.chunks.push(ev.data); };
        r.mr.start(1000); r.t0 = Date.now(); setSecs(0); setState('rec');
        r.timer = setInterval(function () { setSecs(Math.round((Date.now() - r.t0) / 1000)); }, 500);
      });
    }, []);
    var stop = useCallback(function () {
      return new Promise(function (resolve) {
        var r = ref.current;
        if (!r.mr || r.mr.state === 'inactive') return resolve(null);
        r.mr.onstop = function () {
          clearInterval(r.timer);
          r.stream && r.stream.getTracks().forEach(function (t) { t.stop(); });
          var type = (r.mr.mimeType || 'audio/webm').split(';')[0];
          var blob = new Blob(r.chunks, { type: type });
          setState('idle');
          resolve({ blob: blob, type: type, duration: Math.round((Date.now() - r.t0) / 1000), ext: type.indexOf('mp4') >= 0 ? 'm4a' : 'webm' });
        };
        r.mr.stop();
      });
    }, []);
    useEffect(function () { return function () { var r = ref.current; clearInterval(r.timer); r.stream && r.stream.getTracks().forEach(function (t) { t.stop(); }); }; }, []);
    return { state: state, secs: secs, start: start, stop: stop };
  }
  function fmtDur(s) { return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2); }

  function SignedAudio(props) {
    var _u = useState(null), url = _u[0], setUrl = _u[1];
    var _er = useState(''), er = _er[0], setEr = _er[1];
    function load() {
      sb().storage.from(props.bucket).createSignedUrl(props.path, 3600).then(function (r) {
        if (r.error) setEr(r.error.message); else setUrl(r.data.signedUrl);
      });
    }
    if (url) return h('audio', { src: url, controls: true, autoPlay: true, style: { width: '100%', height: 36 } });
    return h('div', null, h('button', { style: S.btn2, onClick: load }, '▶ 재생'), er ? h('span', { style: { color: C.red, fontSize: 12, marginLeft: 8 } }, er) : null);
  }

  /* ───────── 푸시 알림 ───────── */
  function b64ToU8(b64) {
    var pad = '='.repeat((4 - b64.length % 4) % 4);
    var raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
    var out = new Uint8Array(raw.length); for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i); return out;
  }
  function enablePush(email) {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return Promise.reject(new Error('이 브라우저는 앱 알림을 지원하지 않습니다. 아이폰은 사파리에서 "홈 화면에 추가" 후 사용하세요.'));
    if (!CFG.vapidPublicKey) return Promise.reject(new Error('알림 설정(VAPID 공개키)이 아직 등록되지 않았습니다. 운영자에게 문의하세요.'));
    return Notification.requestPermission().then(function (p) {
      if (p !== 'granted') throw new Error('알림 권한이 허용되지 않았습니다');
      return navigator.serviceWorker.ready;
    }).then(function (reg) {
      return reg.pushManager.getSubscription().then(function (s) {
        return s || reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(CFG.vapidPublicKey) });
      });
    }).then(function (sub) {
      var j = sub.toJSON();
      return sb().from('mm_push_sub').upsert({ endpoint: j.endpoint, email: email.toLowerCase(), p256dh: j.keys.p256dh, auth: j.keys.auth });
    }).then(function (r) { if (r.error) throw r.error; return true; });
  }
  function PushButton(props) {
    var _m = useState(''), msg = _m[0], setMsg = _m[1];
    var _ok = useState(false), ok = _ok[0], setOk = _ok[1];
    return h('div', null,
      h('button', { style: S.btn2, onClick: function () { setMsg(''); enablePush(props.email).then(function () { setOk(true); setMsg('알림이 켜졌어요 🔔'); }).catch(function (e) { setOk(false); setMsg(errText(e)); }); } }, '🔔 이 기기에서 알림 받기'),
      h(Msg, { text: msg, err: !ok && !!msg }));
  }

  /* ───────── 앱 전역: 이탈 기록 · QR 딥링크 ───────── */
  function MMGlobal(props) {
    var a = props.account;
    window.__mmPerm = props.permSettings || window.__mmPerm;
    var permSig = JSON.stringify(['canViewAllMembers', 'canViewLessonNotes'].map(function (k) { return [mmPerm(k, '실장'), mmPerm(k, '강사')]; }));
    useEffect(function () {
      if (!a || (a.role !== '원장' && a.role !== '슈퍼어드민') || !a.studioId || !sb() || !props.permSettings) return;
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-/.test(String(a.studioId))) return;
      var rows = ['실장', '강사'].map(function (r) { return { studio_id: String(a.studioId), role: r, view_all: mmPerm('canViewAllMembers', r), view_notes: mmPerm('canViewLessonNotes', r), updated_at: new Date().toISOString() }; });
      var t = setTimeout(function () { sb().from('mm_role_perm').upsert(rows, { onConflict: 'studio_id,role' }).then(function () {}, function () {}); }, 1500);
      return function () { clearTimeout(t); };
    }, [permSig, a && a.studioId, a && a.role]);
    useEffect(function () {
      try {
        var p = new URLSearchParams(location.search);
        if (p.get('mm') === 'checkin') { sessionStorage.setItem('mm_checkin', p.get('s') || '1'); history.replaceState({}, '', location.pathname); }
      } catch (e) { /* ignore */ }
      if (a && a.role === '학생' && sessionStorage.getItem('mm_checkin') && props.setPage) props.setPage('mm-student');
    }, [a && a.email]);
    useEffect(function () {
      if (!a || a.role !== '학생' || !a.studioId || !sb()) return;
      var log = function (ev) {
        sb().from('mm_app_events').insert({ studio_id: String(a.studioId), member_id: String(a.id), event: ev, context: window.__mmContext || null }).then(function () {});
      };
      log('open');
      var hidden = false;
      function onVis() {
        if (document.visibilityState === 'hidden' && !hidden) { hidden = true; log('leave'); }
        else if (document.visibilityState === 'visible' && hidden) { hidden = false; log('return'); }
      }
      document.addEventListener('visibilitychange', onVis);
      return function () { document.removeEventListener('visibilitychange', onVis); };
    }, [a && a.email, a && a.studioId]);
    // 운영자: 회원·강사 정보가 바뀌면 잠시 뒤 서버 명단에 자동 반영(퇴원 처리 → 접근 차단까지 자동)
    var sig = JSON.stringify((props.members || []).map(function (m) { return [m.id, m.name, m.phone, m.parentPhone, m.instructorId, m.status, m.subject]; })) + JSON.stringify((props.instructors || []).map(function (i) { return [i.id, i.phone]; }));
    useEffect(function () {
      if (!a || !isAdmin(a) || !a.studioId || !sb() || !props.members || !props.members.length) return;
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-/.test(String(a.studioId))) return;   // 실제 학원(uuid)만
      var t = setTimeout(function () {
        var rows = rosterRows(String(a.studioId), props.members, props.instructors);
        syncRoster(String(a.studioId), rows).then(function () {}, function () {});
      }, 4000);
      return function () { clearTimeout(t); };
    }, [sig, a && a.studioId]);
    return window.MMLock && a ? h(window.MMLock, { account: a }) : null;
  }

  /* ───────── 데이터 로더 ───────── */
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

  function leaveCounts(events) {
    var byDay = {};
    (events || []).forEach(function (e) {
      var d = kstDate(new Date(e.at)); byDay[d] = byDay[d] || { leave: 0, practiceLeave: 0 };
      if (e.event === 'leave') { byDay[d].leave++; if (e.context === 'practice') byDay[d].practiceLeave++; }
    });
    return byDay;
  }

  /* ───────── 학생/학부모 화면 ───────── */
  function MMStudent(props) {
    var a = props.account, isStu = a.role === '학생';
    var roster = useQuery(function () { return sb().from('mm_roster').select('*').order('name'); }, [a.email]);
    var _sel = useState(null), sel = _sel[0], setSel = _sel[1];
    var kids = roster.data || [];
    var kid = kids.filter(function (k) { return k.member_id === sel; })[0] || kids[0];
    if (roster.loading) return h('div', { style: S.wrap }, '불러오는 중…');
    if (roster.err) return h('div', { style: S.wrap }, h(Card, null, h(Msg, { text: roster.err, err: true })));
    if (!kid) return h('div', { style: S.wrap }, h(Card, { title: '아직 연결된 학생이 없어요' }, h('div', { style: S.mute }, '학원에 학생·학부모 연락처 등록을 요청해 주세요. (등록 후 운영자가 "명단 동기화"를 실행하면 보입니다)')));
    return h('div', { style: S.wrap },
      h('h2', { style: S.h2 }, isStu ? '📒 내 레슨일지' : '📒 우리 아이 레슨일지'),
      kids.length > 1 ? h('div', { style: Object.assign({ marginBottom: 12 }, S.row) }, kids.map(function (k) {
        return h('button', { key: k.member_id, style: k.member_id === kid.member_id ? S.btn : S.btn2, onClick: function () { setSel(k.member_id); } }, k.name);
      })) : null,
      window.MMNoteParent ? h(window.MMNoteParent, { kid: kid, key: 'note' + kid.member_id }) : null,
      h(AttendancePanel, { kid: kid, canScan: isStu, account: a }),
      isStu ? h(PracticePanel, { kid: kid }) : null,
      h(KidTimeline, { kid: kid, showPractice: !isStu }),
      h(Card, { title: '알림' }, h(PushButton, { email: a.email })));
  }

  function AttendancePanel(props) {
    var kid = props.kid;
    var today = kstDate();
    var q = useQuery(function () {
      return sb().from('mm_attendance').select('*').eq('studio_id', kid.studio_id).eq('member_id', kid.member_id).gte('at', kstStart(today)).order('at');
    }, [kid.member_id]);
    var _m = useState(''), msg = _m[0], setMsg = _m[1];
    var _b = useState(false), busy = _b[0], setBusy = _b[1];
    var rows = q.data || [];
    var last = rows[rows.length - 1];
    var inside = last && last.kind === 'in';
    var qrPending = !!sessionStorage.getItem('mm_checkin');
    function toggle() {
      setBusy(true); setMsg('');
      var kind = inside ? 'out' : 'in';
      sb().from('mm_attendance').insert({ studio_id: kid.studio_id, member_id: kid.member_id, kind: kind, source: 'qr' }).then(function (r) {
        setBusy(false);
        if (r.error) return setMsg(errText(r.error));
        sessionStorage.removeItem('mm_checkin');
        setMsg((kind === 'in' ? '등원' : '하원') + ' 처리됐어요. 학부모님께 알림이 갑니다 ✅');
        q.reload();
        // 푸시 즉시 발송 요청(실패해도 무방: 서버가 주기적으로도 처리)
        try { sb().functions.invoke('mm-push', { body: {} }); } catch (e) { /* ignore */ }
      });
    }
    return h(Card, { title: '오늘 등·하원' },
      h('div', { style: S.row }, inside ? badge('등원 중', C.green) : last ? badge('하원 완료', C.mute) : badge('아직 등원 전', C.amber),
        h('span', { style: S.mute }, rows.map(function (r) { return (r.kind === 'in' ? '등원 ' : '하원 ') + hhmm(r.at); }).join(' · '))),
      props.canScan ? h('div', { style: { marginTop: 10 } },
        qrPending ? h('div', { style: { fontSize: 13, marginBottom: 8 } }, '📷 학원 QR을 확인했어요. 아래 버튼을 눌러 완료하세요.') : h('div', { style: S.mute }, '학원 입구의 QR을 휴대폰 카메라로 비추면 이 화면이 열려요.'),
        h('button', { style: S.btn, disabled: busy, onClick: toggle }, inside ? '🏠 하원하기' : '🎵 등원하기')) : null,
      h(Msg, { text: msg, err: /오류|실패|policy|permission/i.test(msg) }));
  }

  function PracticePanel(props) {
    var kid = props.kid, rec = useRecorder();
    var _m = useState(''), msg = _m[0], setMsg = _m[1];
    var _bad = useState(false), bad = _bad[0], setBad = _bad[1];
    function begin() {
      setMsg(''); window.__mmContext = 'practice';
      rec.start().catch(function (e) { setBad(true); setMsg(errText(e)); window.__mmContext = null; });
    }
    function end() {
      rec.stop().then(function (r) {
        window.__mmContext = null;
        if (!r || r.duration < 2) return setMsg('너무 짧아서 저장하지 않았어요');
        var path = kid.studio_id + '/' + kid.member_id + '/' + Date.now() + '.' + r.ext;
        setMsg('저장 중…'); setBad(false);
        sb().storage.from('mm-practice').upload(path, r.blob, { contentType: r.type }).then(function (u) {
          if (u.error) throw u.error;
          return sb().from('mm_practice').insert({ studio_id: kid.studio_id, member_id: kid.member_id, storage_path: path, duration_sec: r.duration });
        }).then(function (i) { if (i.error) throw i.error; setMsg('연습 녹음이 저장됐어요. 선생님과 부모님이 들을 수 있어요 🎧'); })
          .catch(function (e) { setBad(true); setMsg(errText(e)); });
      });
    }
    return h(Card, { title: '연습 녹음' },
      rec.state === 'rec'
        ? h('div', { style: S.row }, badge('● 녹음 중 ' + fmtDur(rec.secs), C.red), h('button', { style: S.btn, onClick: end }, '■ 끝내고 저장'))
        : h('button', { style: S.btn, onClick: begin }, '🎙 연습 녹음 시작'),
      h('div', { style: Object.assign({ marginTop: 6 }, S.mute) }, '녹음 중 앱을 나갔다 오면 횟수가 기록돼요.'),
      h(Msg, { text: msg, err: bad }));
  }

  function KidTimeline(props) {
    var kid = props.kid;
    var since = new Date(Date.now() - 14 * 864e5).toISOString();
    var att = useQuery(function () { return sb().from('mm_attendance').select('*').eq('member_id', kid.member_id).gte('at', since).order('at', { ascending: false }); }, [kid.member_id]);
    var prac = useQuery(function () { return sb().from('mm_practice').select('*').eq('member_id', kid.member_id).order('created_at', { ascending: false }).limit(20); }, [kid.member_id]);
    var sums = useQuery(function () { return sb().from('mm_class_summary').select('*').eq('member_id', kid.member_id).order('lesson_date', { ascending: false }).limit(20); }, [kid.member_id]);
    var evs = useQuery(function () { return sb().from('mm_app_events').select('*').eq('member_id', kid.member_id).gte('at', since).order('at', { ascending: false }).limit(500); }, [kid.member_id]);
    var lc = leaveCounts(evs.data);
    var days = Object.keys(lc).sort().reverse().slice(0, 7);
    return h('div', null,
      h(Card, { title: '수업 요약 (AI 자동 정리)' },
        (sums.data || []).length ? (sums.data || []).map(function (s) {
          return h('div', { key: s.audio_id, style: { borderBottom: '1px solid ' + C.line, padding: '8px 0' } },
            h('div', { style: S.mute }, s.lesson_date),
            h('div', { style: { fontSize: 14, whiteSpace: 'pre-wrap' } }, s.summary),
            s.homework ? h('div', { style: { fontSize: 13, marginTop: 6, background: C.soft, borderRadius: 8, padding: 8, whiteSpace: 'pre-wrap' } }, '📝 연습 포인트\n' + s.homework) : null);
        }) : h('div', { style: S.mute }, sums.err || '아직 수업 요약이 없어요')),
      props.showPractice ? h(Card, { title: '연습 녹음' },
        (prac.data || []).length ? (prac.data || []).map(function (p) {
          return h('div', { key: p.id, style: { borderBottom: '1px solid ' + C.line, padding: '8px 0' } },
            h('div', { style: S.mute }, mdhm(p.created_at) + ' · ' + fmtDur(p.duration_sec || 0)),
            h(SignedAudio, { bucket: 'mm-practice', path: p.storage_path }));
        }) : h('div', { style: S.mute }, prac.err || '아직 연습 녹음이 없어요')) : null,
      h(Card, { title: '최근 14일 등·하원' },
        (att.data || []).length ? h('div', { style: { fontSize: 13, lineHeight: 1.9 } }, (att.data || []).slice(0, 20).map(function (r) {
          return h('div', { key: r.id }, mdhm(r.at) + ' · ' + (r.kind === 'in' ? '등원' : '하원'));
        })) : h('div', { style: S.mute }, att.err || '기록 없음')),
      h(Card, { title: '앱 이용 (나갔다 들어온 횟수)' },
        days.length ? days.map(function (d) {
          return h('div', { key: d, style: { fontSize: 13, padding: '3px 0' } }, d + ' · 앱 이탈 ' + lc[d].leave + '회' + (lc[d].practiceLeave ? ' (연습 중 ' + lc[d].practiceLeave + '회)' : ''));
        }) : h('div', { style: S.mute }, evs.err || '기록 없음')));
  }

  /* ───────── 운영자·강사 화면 ───────── */
  function MMBoard(props) {
    var a = props.account, _t = useState(window.MMNoteBoard ? 'note' : 'today'), tab = _t[0], setTab = _t[1];
    var tabs = [['today', '오늘 출결'], ['student', '학생별 기록'], ['lesson', '수업 녹음·요약']];
    if (window.MMNoteBoard) tabs.unshift(['note', '📒 레슨일지']);
    if (isAdmin(a)) tabs.push(['settings', '설정']);
    return h('div', { style: S.wrap },
      h('h2', { style: S.h2 }, '레슨일지 · 출결'),
      h(Tabs, { items: tabs, value: tab, onChange: setTab }),
      tab === 'today' ? h(TodayBoard, { account: a }) : null,
      tab === 'student' ? h(StudentRecords, { account: a }) : null,
      tab === 'lesson' ? h(LessonPanel, { account: a }) : null,
      tab === 'note' && window.MMNoteBoard ? h(window.MMNoteBoard, { account: a, members: props.members, instructors: props.instructors, permSettings: props.permSettings }) : null,
      tab === 'settings' && isAdmin(a) ? h(SettingsPanel, props) : null);
  }

  function TodayBoard(props) {
    var a = props.account;
    var board = useQuery(function () { return sb().from('mm_today_board').select('*').eq('studio_id', String(a.studioId)).order('name'); }, [a.studioId]);
    var _f = useState('all'), flt = _f[0], setFlt = _f[1];
    var _m = useState(''), msg = _m[0], setMsg = _m[1];
    useEffect(function () { var t = setInterval(board.reload, 30000); return function () { clearInterval(t); }; }, []);
    var rows = (board.data || []).filter(function (r) { return flt === 'all' || r.state === flt; });
    var cnt = { present: 0, left: 0, absent: 0 };
    (board.data || []).forEach(function (r) { cnt[r.state] = (cnt[r.state] || 0) + 1; });
    function manual(r, kind) {
      sb().from('mm_attendance').insert({ studio_id: r.studio_id, member_id: r.member_id, kind: kind, source: 'manual' }).then(function (x) {
        if (x.error) setMsg(errText(x.error)); else { setMsg(''); board.reload(); try { sb().functions.invoke('mm-push', { body: {} }); } catch (e) { /* ignore */ } }
      });
    }
    var stateBadge = { present: badge('등원 중', C.green), left: badge('하원', C.mute), absent: badge('미등원', C.amber) };
    return h(Card, null,
      h('div', { style: Object.assign({ marginBottom: 10 }, S.row) },
        h('button', { style: flt === 'all' ? S.btn : S.btn2, onClick: function () { setFlt('all'); } }, '전체 ' + (board.data || []).length),
        h('button', { style: flt === 'present' ? S.btn : S.btn2, onClick: function () { setFlt('present'); } }, '등원 중 ' + cnt.present),
        h('button', { style: flt === 'left' ? S.btn : S.btn2, onClick: function () { setFlt('left'); } }, '하원 ' + cnt.left),
        h('button', { style: flt === 'absent' ? S.btn : S.btn2, onClick: function () { setFlt('absent'); } }, '미등원 ' + cnt.absent),
        h('button', { style: S.btn2, onClick: board.reload }, '↻')),
      h(Msg, { text: board.err || msg, err: true }),
      board.loading && !board.data ? '불러오는 중…' : h('div', { style: { overflowX: 'auto' } }, h('table', { style: { width: '100%', borderCollapse: 'collapse' } },
        h('thead', null, h('tr', null, ['학생', '과목', '상태', '등원', '하원', '수동'].map(function (t) { return h('th', { key: t, style: S.th }, t); }))),
        h('tbody', null, rows.map(function (r) {
          return h('tr', { key: r.member_id },
            h('td', { style: S.td }, r.name), h('td', { style: S.td }, r.subject || '-'),
            h('td', { style: S.td }, stateBadge[r.state]), h('td', { style: S.td }, hhmm(r.first_in)), h('td', { style: S.td }, r.state === 'left' ? hhmm(r.last_out) : '-'),
            h('td', { style: S.td }, h('button', { style: S.btn2, onClick: function () { manual(r, r.state === 'present' ? 'out' : 'in'); } }, r.state === 'present' ? '하원' : '등원')));
        })))),
      !rows.length && !board.loading ? h('div', { style: S.mute }, '표시할 학생이 없습니다. (설정 > 명단 동기화를 먼저 실행하세요)') : null);
  }

  function StudentRecords(props) {
    var roster = useQuery(function () { return sb().from('mm_roster').select('*').eq('active', true).order('name'); }, []);
    var _s = useState(''), sel = _s[0], setSel = _s[1];
    var kids = roster.data || [];
    var kid = kids.filter(function (k) { return k.member_id === sel; })[0];
    return h('div', null,
      h(Card, null, h('select', { style: S.input, value: sel, onChange: function (e) { setSel(e.target.value); } },
        [h('option', { key: '', value: '' }, '학생 선택…')].concat(kids.map(function (k) { return h('option', { key: k.member_id, value: k.member_id }, k.name + (k.subject ? ' · ' + k.subject : '')); }))),
        h(Msg, { text: roster.err, err: true })),
      kid ? h(KidTimeline, { kid: kid, showPractice: true, key: kid.member_id }) : null);
  }

  function LessonPanel(props) {
    var a = props.account, rec = useRecorder();
    var roster = useQuery(function () { return sb().from('mm_roster').select('*').eq('active', true).order('name'); }, []);
    var list = useQuery(function () { return sb().from('mm_class_audio').select('*').order('created_at', { ascending: false }).limit(30); }, []);
    var sums = useQuery(function () { return sb().from('mm_class_summary').select('audio_id,summary,homework').limit(60); }, []);
    var _s = useState(''), sel = _s[0], setSel = _s[1];
    var _m = useState(''), msg = _m[0], setMsg = _m[1];
    var _b = useState(false), bad = _b[0], setBad = _b[1];
    var kids = roster.data || [];
    var names = {}; kids.forEach(function (k) { names[k.member_id] = k.name; });
    var sumBy = {}; (sums.data || []).forEach(function (s) { sumBy[s.audio_id] = s; });
    useEffect(function () {
      var running = (list.data || []).some(function (r) { return r.status === 'summarizing' || r.status === 'uploaded'; });
      if (!running) return;
      var t = setInterval(function () { list.reload(); sums.reload(); }, 8000);
      return function () { clearInterval(t); };
    }, [list.data]);
    function submit(blob, type, ext, duration) {
      var kid = kids.filter(function (k) { return k.member_id === sel; })[0];
      if (!kid) { setBad(true); return setMsg('학생을 먼저 선택하세요'); }
      var path = kid.studio_id + '/' + kid.member_id + '/' + Date.now() + '.' + ext;
      setBad(false); setMsg('올리는 중… (긴 녹음은 시간이 걸려요)');
      sb().storage.from('mm-class-original').upload(path, blob, { contentType: type }).then(function (u) {
        if (u.error) throw u.error;
        return sb().from('mm_class_audio').insert({ studio_id: kid.studio_id, member_id: kid.member_id, teacher_email: a.email.toLowerCase(), storage_path: path, duration_sec: duration || null }).select().single();
      }).then(function (i) {
        if (i.error) throw i.error;
        setMsg('AI가 수업을 요약하는 중이에요. 몇 분 걸릴 수 있어요…');
        return sb().functions.invoke('mm-summarize', { body: { audio_id: i.data.id } });
      }).then(function (f) { if (f && f.error) throw f.error; list.reload(); })
        .catch(function (e) { setBad(true); setMsg(errText(e)); list.reload(); });
    }
    function stop() { rec.stop().then(function (r) { if (r) submit(r.blob, r.type, r.ext, r.duration); }); }
    function onFile(ev) {
      var f = ev.target.files && ev.target.files[0]; if (!f) return;
      var ext = (f.name.split('.').pop() || 'm4a').toLowerCase();
      submit(f, f.type || 'audio/mp4', ext, null); ev.target.value = '';
    }
    var statusLabel = { uploaded: ['올림', C.amber], summarizing: ['요약 중…', C.amber], done: ['요약 완료', C.green], error: ['오류', C.red] };
    return h('div', null,
      h(Card, { title: '수업 녹음 → 자동 요약' },
        h('select', { style: S.input, value: sel, onChange: function (e) { setSel(e.target.value); } },
          [h('option', { key: '', value: '' }, '학생 선택…')].concat(kids.map(function (k) { return h('option', { key: k.member_id, value: k.member_id }, k.name); }))),
        h('div', { style: Object.assign({ marginTop: 10 }, S.row) },
          rec.state === 'rec'
            ? [h('span', { key: 'b' }, badge('● 녹음 중 ' + fmtDur(rec.secs), C.red)), h('button', { key: 's', style: S.btn, onClick: stop }, '■ 끝내고 요약하기')]
            : [h('button', { key: 'r', style: S.btn, onClick: function () { setMsg(''); rec.start().catch(function (e) { setBad(true); setMsg(errText(e)); }); } }, '🎙 수업 녹음 시작'),
               h('label', { key: 'f', style: Object.assign({}, S.btn2, { display: 'inline-block' }) }, '📁 파일 올리기', h('input', { type: 'file', accept: 'audio/*', style: { display: 'none' }, onChange: onFile }))]),
        h('div', { style: Object.assign({ marginTop: 8 }, S.mute) }, '원본은 운영자만 볼 수 있게 보관되고, 요약은 선생님·학생·학부모가 볼 수 있어요. 수업 녹음은 학생/학부모에게 사전 동의를 받아 주세요.'),
        h(Msg, { text: msg, err: bad })),
      h(Card, { title: '최근 수업 녹음' },
        (list.data || []).length ? (list.data || []).map(function (r) {
          var st = statusLabel[r.status] || ['-', C.mute], sm = sumBy[r.id];
          return h('div', { key: r.id, style: { borderBottom: '1px solid ' + C.line, padding: '10px 0' } },
            h('div', { style: S.row }, h('b', null, names[r.member_id] || r.member_id), h('span', { style: S.mute }, r.lesson_date + ' · ' + fmtDur(r.duration_sec || 0)), badge(st[0], st[1]),
              r.status === 'error' ? h('button', { style: S.btn2, onClick: function () { sb().functions.invoke('mm-summarize', { body: { audio_id: r.id } }).then(list.reload); } }, '다시 요약') : null),
            r.error ? h('div', { style: { color: C.red, fontSize: 12 } }, r.error) : null,
            sm ? h('div', { style: { fontSize: 13, marginTop: 6, whiteSpace: 'pre-wrap' } }, sm.summary) : null,
            isAdmin(a) ? h('div', { style: { marginTop: 6 } }, h(SignedAudio, { bucket: 'mm-class-original', path: r.storage_path })) : null);
        }) : h('div', { style: S.mute }, list.err || '아직 없습니다')));
  }

  /* ───────── 설정 (운영자) ───────── */
  function SettingsPanel(props) {
    var a = props.account, members = props.members || [], instructors = props.instructors || [];
    var studio = String(a.studioId);
    return h('div', null,
      isAdmin(a) ? h(ImportCard, props) : null,
      isAdmin(a) ? h(NameFixCard, { members: members, setMembers: props.setMembers }) : null,
      isOwner(a) ? h(AiKeyCard, { studio: studio }) : null,
      h(RosterCard, { studio: studio, members: members, instructors: instructors }),
      h(ResetPwCard, { studio: studio }),
      isOwner(a) ? h(ScopeCard, { studio: studio, members: members, instructors: instructors }) : null,
      h(QrCard, { studio: studio }));
  }

  function AiKeyCard(props) {
    var _h = useState(null), has = _h[0], setHas = _h[1];
    var _k = useState(''), key = _k[0], setKey = _k[1];
    var _m = useState(''), msg = _m[0], setMsg = _m[1];
    var _bad = useState(false), bad = _bad[0], setBad = _bad[1];
    function call(action, extra) {
      return sb().functions.invoke('mm-set-key', { body: Object.assign({ studio_id: props.studio, action: action }, extra || {}) }).then(function (r) {
        if (r.error) { var c = r.error.context; return (c && c.json ? c.json() : Promise.resolve({})).then(function (j) { throw new Error(j.error || r.error.message); }); }
        return r.data;
      });
    }
    useEffect(function () { call('status').then(function (d) { setHas(d.has_key); }).catch(function (e) { setBad(true); setMsg(errText(e)); }); }, []);
    return h(Card, { title: '🤖 AI 요약 API 키 (학원 공용 1개)' },
      h('div', { style: S.mute }, '학생·학부모는 키가 필요 없습니다. 여기에 등록한 Gemini 키 하나로 모든 수업 요약이 만들어지고, 키는 서버에만 저장돼 화면에 다시 표시되지 않습니다.'),
      h('div', { style: { margin: '8px 0' } }, has === null ? '확인 중…' : has ? badge('등록됨', C.green) : badge('미등록', C.amber)),
      h('div', { style: S.row },
        h('input', { type: 'password', style: Object.assign({}, S.input, { flex: 1, minWidth: 200 }), placeholder: 'Gemini API 키 붙여넣기 (AIza…)', value: key, onChange: function (e) { setKey(e.target.value); }, autoComplete: 'off' }),
        h('button', { style: S.btn, onClick: function () { setMsg('확인 중…'); setBad(false); call('save', { gemini_key: key }).then(function (d) { setHas(d.has_key); setKey(''); setMsg('저장했어요'); }).catch(function (e) { setBad(true); setMsg(errText(e)); }); } }, '저장'),
        has ? h('button', { style: S.btn2, onClick: function () { call('delete').then(function (d) { setHas(d.has_key); setMsg('삭제했어요'); }); } }, '삭제') : null),
      h(Msg, { text: msg, err: bad }));
  }

  function ResetPwCard(props) {
    var _p = useState(''), phone = _p[0], setPhone = _p[1];
    var _w = useState(''), pw = _w[0], setPw = _w[1];
    var _m = useState(''), msg = _m[0], setMsg = _m[1];
    var _bad = useState(false), bad = _bad[0], setBad = _bad[1];
    function go() {
      var email = mail(phone);
      if (!email) { setBad(true); return setMsg('전화번호를 입력하세요'); }
      setBad(false); setMsg('변경 중…');
      sb().functions.invoke('mm-admin-reset-password', { body: { studio_id: props.studio, email: email, new_password: pw } }).then(function (r) {
        if (r.error) { var c = r.error.context; return (c && c.json ? c.json() : Promise.resolve({})).then(function (j) { throw new Error(j.error || r.error.message); }); }
        setPw(''); setMsg('비밀번호를 변경했어요. 본인에게 새 비밀번호를 알려주세요.');
      }).catch(function (e) { setBad(true); setMsg(errText(e)); });
    }
    return h(Card, { title: '🔑 회원 비밀번호 재설정' },
      h('div', { style: S.mute }, '전화번호로 가입한 회원이 비밀번호를 잊었을 때 운영자가 대신 바꿔 줍니다.'),
      h('div', { style: Object.assign({ marginTop: 8 }, S.row) },
        h('input', { style: Object.assign({}, S.input, { flex: 1, minWidth: 140 }), placeholder: '회원 전화번호', value: phone, onChange: function (e) { setPhone(e.target.value); } }),
        h('input', { type: 'password', style: Object.assign({}, S.input, { flex: 1, minWidth: 140 }), placeholder: '새 비밀번호(6자 이상)', value: pw, onChange: function (e) { setPw(e.target.value); }, autoComplete: 'new-password' }),
        h('button', { style: S.btn, onClick: go }, '변경')),
      h(Msg, { text: msg, err: bad }));
  }

  /* ───────── 스튜디오메이트 엑셀 가져오기 (회원 + 수강권 + 강사) ───────── */
  function loadSheetJS() {
    if (window.XLSX) return Promise.resolve();
    return new Promise(function (res, rej) {
      var sc = document.createElement('script');
      sc.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
      sc.onload = res; sc.onerror = function () { rej(new Error('엑셀 읽기 도구를 불러오지 못했습니다(인터넷 확인)')); };
      document.head.appendChild(sc);
    });
  }
  function ymd(v) {
    if (!v) return '';
    if (v instanceof Date) return v.getFullYear() + '-' + ('0' + (v.getMonth() + 1)).slice(-2) + '-' + ('0' + v.getDate()).slice(-2);
    var s = String(v).trim(), m;
    if ((m = s.match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/))) return m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2);
    return '';
  }
  function digits(v) { return String(v || '').replace(/\D/g, ''); }
  function fmtPhone(v) {
    var d = digits(v); if (d.length === 11) return d.slice(0, 3) + '-' + d.slice(3, 7) + '-' + d.slice(7);
    if (d.length === 10) return d.slice(0, 3) + '-' + d.slice(3, 6) + '-' + d.slice(6); return String(v || '');
  }
  var IMP_COLORS = ['#E07B8B', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#06b6d4', '#ef4444', '#84cc16'];

  function buildImport(rows, cur) {
    var warn = [], today = kstDate();
    var existingKey = {}; (cur.members || []).forEach(function (m) { existingKey[(m.name || '') + '|' + digits(m.phone)] = true; });
    var instByName = {}; (cur.instructors || []).forEach(function (i) { instByName[i.name] = i; });
    var newInst = [], members = [], memberByKey = {}, passes = [], skippedExisting = 0, trials = 0, noTeacher = 0, strippedNames = 0, noPhone = 0;
    var seq = Date.now().toString(36);

    rows.forEach(function (r, idx) {
      var phone = fmtPhone(r['전화번호']), d4 = digits(r['전화번호']).slice(-4);
      var name = String(r['이름'] || '').trim(); if (!name) return;
      if (/체험수업/.test(name)) { trials++; return; }   // '1회체험수업','2체험수업' 같은 임시 항목 제외
      // 스튜디오메이트는 동명이인 구분을 위해 이름 끝에 전화 뒷4자리를 붙이는 경우가 있음
      if (d4 && name.length > 4 && name.slice(-4) === d4) { name = name.slice(0, -4).trim(); strippedNames++; }
      var key = name + '|' + digits(phone) + (phone ? '' : '|row' + idx);
      var tName = '', tSub = '';
      if (r['담당강사']) { var parts = String(r['담당강사']).trim().split(/\s+/); tName = parts[0]; tSub = parts.slice(1).join(' ').replace(/강사$/, ''); }
      var inst = null;
      if (tName) {
        inst = instByName[tName];
        if (!inst) {
          inst = { id: 'ti_' + seq + '_' + newInst.length, name: tName, subject: tSub || '음악', phone: '', payType: '수업당', payAmount: 0,
            joinDate: today, color: IMP_COLORS[(newInst.length + (cur.instructors || []).length) % IMP_COLORS.length], personalRate: 0, groupRate: 0,
            contractSigned: false, contractSignature: '', contractSignedAt: '' };
          newInst.push(inst); instByName[tName] = inst;
        }
      }
      var mem = memberByKey[key];
      if (!mem) {
        if (existingKey[name + '|' + digits(phone)]) { skippedExisting++; memberByKey[key] = false; return; }
        if (!phone) noPhone++;
        mem = { id: 'sm_' + seq + '_' + members.length, name: name, phone: phone, parentPhone: '', birthdate: ymd(r['생년월일']),
          type: '음악', subject: tSub || '', instructorId: inst ? inst.id : '', joinDate: ymd(r['등록일']) || today, status: 'active',
          memo: r['메모'] ? String(r['메모']) : '', adminMemo: '', consentSigned: false, consentSignedAt: '' };
        members.push(mem); memberByKey[key] = mem;
      }
      if (mem === false) return;
      if (!mem.instructorId && inst) { mem.instructorId = inst.id; mem.subject = mem.subject || tSub; }
      if (r['수강권명']) {
        var total = Number(r['전체횟수']) || 0, rem = Number(r['잔여횟수']);
        if (total >= 900) { trials++; return; }               // '1회 체험수업'(999회) 같은 임시 수강권은 제외
        passes.push({ id: 'sp_' + seq + '_' + passes.length, memberId: mem.id, templateId: '', name: String(r['수강권명']),
          category: r['수강권종류'] === '그룹' ? '그룹레슨' : '개인레슨', color: IMP_COLORS[passes.length % IMP_COLORS.length],
          total: total, remaining: isNaN(rem) ? total : rem, price: Number(r['결제금액']) || 0,
          startDate: ymd(r['수강권시작일']) || today, expiry: ymd(r['수강권종료일']) || '' });
      }
    });
    members.forEach(function (m) { if (!m.instructorId) noTeacher++; });
    if (skippedExisting) warn.push('이미 등록된 회원 ' + skippedExisting + '명은 건너뜁니다');
    if (trials) warn.push('체험수업용 임시 수강권 ' + trials + '건은 제외했습니다');
    if (noTeacher) warn.push('담당 강사가 없는 회원 ' + noTeacher + '명 (등록 후 앱에서 지정하세요)');
    if (noPhone) warn.push('전화번호가 없는 회원 ' + noPhone + '명');
    if (strippedNames) warn.push('이름 끝의 전화 뒷4자리 ' + strippedNames + '건을 제거했습니다');
    warn.push('학부모 전화번호는 엑셀에 없습니다. 등록 후 회원 정보에서 입력해야 학부모 알림이 갑니다');
    return { members: members, instructors: newInst, passes: passes, warn: warn };
  }

  function ImportCard(props) {
    var _p = useState(null), plan = _p[0], setPlan = _p[1];
    var _m = useState(''), msg = _m[0], setMsg = _m[1];
    var _bad = useState(false), bad = _bad[0], setBad = _bad[1];
    var _d = useState(false), done = _d[0], setDone = _d[1];
    var can = !!(props.setMembers && props.setPasses && props.setInstructors);
    function onFile(ev) {
      var f = ev.target.files && ev.target.files[0]; if (!f) return;
      setBad(false); setMsg('읽는 중…'); setDone(false); setPlan(null);
      loadSheetJS().then(function () { return f.arrayBuffer(); }).then(function (buf) {
        var wb = window.XLSX.read(buf, { type: 'array', cellDates: true });
        var rows = window.XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: null });
        if (!rows.length || !('이름' in rows[0])) throw new Error('스튜디오메이트 회원 목록 엑셀이 아닙니다 ("이름" 열을 찾을 수 없음)');
        var p = buildImport(rows, { members: props.members, instructors: props.instructors });
        setPlan(p); setMsg('');
      }).catch(function (e) { setBad(true); setMsg(errText(e)); });
      ev.target.value = '';
    }
    function apply() {
      props.setInstructors(function (p) { return (p || []).concat(plan.instructors); });
      props.setMembers(function (p) { return (p || []).concat(plan.members); });
      props.setPasses(function (p) { return (p || []).concat(plan.passes); });
      setDone(true); setPlan(null);
      setMsg('등록했어요. 이제 아래 "명단 동기화"를 눌러 주세요.');
    }
    if (!can) return h(Card, { title: '📥 스튜디오메이트 엑셀 가져오기' }, h('div', { style: S.mute }, '이 화면에서는 사용할 수 없습니다(원장 화면에서 열어 주세요).'));
    return h(Card, { title: '📥 스튜디오메이트 엑셀 가져오기' },
      h('div', { style: S.mute }, '스튜디오메이트 "회원 목록 엑셀"을 올리면 회원 · 수강권(잔여횟수·기간) · 담당 강사를 미리보기로 보여드립니다. 확인 후 [등록]을 눌러야 반영됩니다.'),
      h('div', { style: { marginTop: 8 } }, h('label', { style: Object.assign({}, S.btn2, { display: 'inline-block' }) }, '📁 엑셀 파일 선택', h('input', { type: 'file', accept: '.xlsx,.xls', style: { display: 'none' }, onChange: onFile }))),
      plan ? h('div', { style: { marginTop: 12 } },
        h('div', { style: S.row }, badge('회원 ' + plan.members.length + '명', C.green), badge('수강권 ' + plan.passes.length + '건', C.green), badge('새 강사 ' + plan.instructors.length + '명', C.amber)),
        h('ul', { style: { margin: '8px 0', paddingLeft: 18, fontSize: 12, color: C.mute } }, plan.warn.map(function (w, i) { return h('li', { key: i }, w); })),
        h('div', { style: { overflowX: 'auto', maxHeight: 220 } }, h('table', { style: { width: '100%', borderCollapse: 'collapse' } },
          h('thead', null, h('tr', null, ['이름', '연락처', '담당', '수강권(잔여/전체)'].map(function (t) { return h('th', { key: t, style: S.th }, t); }))),
          h('tbody', null, plan.members.slice(0, 12).map(function (m) {
            var ps = plan.passes.filter(function (x) { return x.memberId === m.id; });
            var inst = plan.instructors.filter(function (i) { return i.id === m.instructorId; })[0] || (props.instructors || []).filter(function (i) { return i.id === m.instructorId; })[0];
            return h('tr', { key: m.id }, h('td', { style: S.td }, m.name), h('td', { style: S.td }, m.phone ? m.phone.slice(0, 4) + '****' + m.phone.slice(-2) : '-'),
              h('td', { style: S.td }, inst ? inst.name : '-'), h('td', { style: S.td }, ps.map(function (x) { return x.name + ' ' + x.remaining + '/' + x.total; }).join(', ') || '-'));
          })))),
        plan.members.length > 12 ? h('div', { style: S.mute }, '… 외 ' + (plan.members.length - 12) + '명 (연락처는 일부 가려서 표시)') : null,
        h('div', { style: Object.assign({ marginTop: 10 }, S.row) },
          h('button', { style: S.btn, onClick: apply, disabled: !plan.members.length }, plan.members.length + '명 등록하기'),
          h('button', { style: S.btn2, onClick: function () { setPlan(null); } }, '취소'))) : null,
      h(Msg, { text: msg, err: bad }));
  }

  function instEmail(i) { return (i && (i.email || mail(i.phone))) || null; }

  /* ───────── 이름 정리: "기타 김효린", "김도윤 피아노취미", "강민준6105" → 이름만 ───────── */
  var SUBJ_WORDS = ['재즈피아노', '클래식피아노', '실용음악', '미디작곡', '피아노', '바이올린', '플루트', '우쿨렐레', '일렉', '베이스', '보컬', '드럼', '기타', '미디', '작곡', '취미', '입시', '첼로', '플룻', '성악', '클래식', '재즈', '키보드', '랩'].sort(function (a, b) { return b.length - a.length; });
  function cleanName(raw) {
    var n = String(raw || '').trim(); if (!n) return { name: n, subj: '' };
    var keep = [], subj = [];
    n.split(/\s+/).forEach(function (t) {
      var rest = t, hit = [], moved = true;
      while (rest && moved) { moved = false; for (var i = 0; i < SUBJ_WORDS.length; i++) { if (rest.indexOf(SUBJ_WORDS[i]) === 0) { hit.push(SUBJ_WORDS[i]); rest = rest.slice(SUBJ_WORDS[i].length); moved = true; break; } } }
      if (!rest && hit.length) subj = subj.concat(hit); else keep.push(t);
    });
    var name = keep.length ? keep.join(' ') : n;
    name = name.replace(/(\D{2,4})\d{4}$/, '$1').replace(/^(\D{2,4})님$/, '$1');
    if (name.length >= 3 && /님$/.test(name)) name = name.slice(0, -1);
    return { name: name.trim() || n, subj: subj.join(' ') };
  }
  function rosterRows(studio, members, instructors) {
    var instBy = {}; (instructors || []).forEach(function (i) { instBy[i.id] = i; });
    return (members || []).filter(function (m) { return m && m.id; }).map(function (m) {
      var active = !m.status || m.status === 'active' || m.status === '활성';
      return {
        studio_id: studio, member_id: String(m.id), name: cleanName(m.name).name || '(이름없음)', subject: m.subject || m.type || null,
        teacher_email: instEmail(instBy[m.instructorId]), student_email: mail(m.phone),
        parent_emails: m.parentPhone ? [mail(m.parentPhone)] : [], active: active, updated_at: new Date().toISOString(),
      };
    });
  }

  function NameFixCard(props) {
    var _m = useState(''), msg = _m[0], setMsg = _m[1];
    var fixes = (props.members || []).map(function (m) { var c = cleanName(m.name); return c.name !== m.name || (c.subj && !m.subject) ? { m: m, c: c } : null; }).filter(Boolean);
    function apply() {
      var by = {}; fixes.forEach(function (f) { by[f.m.id] = f.c; });
      props.setMembers(function (ms) { return (ms || []).map(function (m) { var c = by[m.id]; return c ? Object.assign({}, m, { name: c.name, subject: m.subject || c.subj || m.subject || '' }) : m; }); });
      setMsg(fixes.length + '명 이름을 정리했습니다. 명단은 자동으로 서버에 반영됩니다.');
    }
    return h(Card, { title: '✏️ 회원 이름 정리' },
      h('div', { style: S.mute }, '"기타 김효린", "김도윤 피아노취미", "강민준6105"처럼 이름에 악기·전화 뒷자리가 붙은 회원을 이름만 남기고 정리합니다(악기는 과목 칸으로 이동). 학부모 알림에 "기타 김효린 학생이 등원했어요"처럼 나가는 것을 막습니다.'),
      fixes.length
        ? h('div', null,
            h('div', { style: { marginTop: 8, fontSize: 13 } }, '정리 대상 ' + fixes.length + '명 · 예: ' + fixes.slice(0, 6).map(function (f) { return f.m.name + ' → ' + f.c.name; }).join(', ')),
            h('div', { style: { marginTop: 8 } }, h('button', { style: S.btn, onClick: apply }, '이름 정리 적용')))
        : h('div', { style: { marginTop: 8, fontSize: 13 } }, '정리할 이름이 없습니다 ✅'),
      h(Msg, { text: msg, err: false }));
  }

  function RosterCard(props) {
    var _m = useState(''), msg = _m[0], setMsg = _m[1];
    var _bad = useState(false), bad = _bad[0], setBad = _bad[1];
    function sync() {
      var rows = rosterRows(props.studio, props.members, props.instructors);
      if (!rows.length) { setBad(true); return setMsg('동기화할 회원이 없습니다'); }
      setBad(false); setMsg('동기화 중…');
      syncRoster(props.studio, rows).then(function (r) {
        if (r.error) { setBad(true); setMsg(errText(r.error)); } else setMsg(rows.length + '명 동기화 완료');
      });
    }
    return h(Card, { title: '👥 명단 동기화' },
      h('div', { style: S.mute }, '회원 정보(학생·학부모 연락처, 담당 강사)를 서버 권한 표에 반영합니다. 회원/강사를 추가·수정한 뒤에 한 번 눌러 주세요. 학생·학부모·강사는 각자 전화번호로 가입한 계정으로 연결됩니다.'),
      h('div', { style: { marginTop: 8 } }, h('button', { style: S.btn, onClick: sync }, '지금 동기화')),
      h(Msg, { text: msg, err: bad }));
  }

  function ScopeCard(props) {
    var sc = useQuery(function () { return sb().from('mm_staff_scope').select('*').eq('studio_id', props.studio); }, []);
    var _m = useState(''), msg = _m[0], setMsg = _m[1];
    var by = {}; (sc.data || []).forEach(function (s) { by[s.email.toLowerCase()] = s; });
    var subjects = []; (props.members || []).forEach(function (m) { if (m.type && subjects.indexOf(m.type) < 0) subjects.push(m.type); });
    function save(email, scope, subs) {
      sb().from('mm_staff_scope').upsert({ studio_id: props.studio, email: email, scope: scope, subjects: subs }).then(function (r) { setMsg(r.error ? errText(r.error) : '저장됨'); sc.reload(); });
    }
    var teachers = (props.instructors || []).filter(function (i) { return instEmail(i); });
    return h(Card, { title: '🔐 강사별 열람 권한' },
      h('div', { style: S.mute }, '전체 학생 / 내 담당 학생만 / 지정 과목 학생만 — 강사마다 다르게 정할 수 있어요. (기본: 담당 학생만)'),
      teachers.length ? teachers.map(function (i) {
        var em = instEmail(i), cur = by[em] || { scope: 'own', subjects: [] };
        return h('div', { key: i.id, style: Object.assign({ padding: '8px 0', borderBottom: '1px solid ' + C.line }, S.row) },
          h('b', { style: { minWidth: 70 } }, i.name),
          h('select', { style: Object.assign({}, S.input, { width: 'auto' }), value: cur.scope, onChange: function (e) { save(em, e.target.value, cur.subjects || []); } },
            h('option', { value: 'own' }, '담당 학생만'), h('option', { value: 'all' }, '전체 학생'), h('option', { value: 'subjects' }, '지정 과목')),
          cur.scope === 'subjects' ? subjects.map(function (s) {
            var on = (cur.subjects || []).indexOf(s) >= 0;
            return h('button', { key: s, style: on ? S.btn : S.btn2, onClick: function () { save(em, 'subjects', on ? cur.subjects.filter(function (x) { return x !== s; }) : (cur.subjects || []).concat([s])); } }, s);
          }) : null);
      }) : h('div', { style: Object.assign({ marginTop: 8 }, S.mute) }, '전화번호가 등록된 강사가 없습니다. 강사 정보에 전화번호를 넣어 주세요.'),
      h(Msg, { text: msg, err: /오류|policy|permission/i.test(msg) }));
  }

  function QrCard(props) {
    var box = useRef(null);
    var url = (CFG.appUrl || location.origin + location.pathname) + '?mm=checkin&s=' + encodeURIComponent(props.studio);
    useEffect(function () {
      function draw() { if (box.current && window.QRCode) { box.current.innerHTML = ''; new window.QRCode(box.current, { text: url, width: 220, height: 220 }); } }
      if (window.QRCode) return draw();
      var s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js'; s.onload = draw; document.head.appendChild(s);
    }, [url]);
    return h(Card, { title: '📷 등·하원 QR (학원 입구에 출력해 두세요)' },
      h('div', { ref: box, style: { display: 'inline-block', padding: 8, background: '#fff' } }),
      h('div', { style: Object.assign({ marginTop: 6, wordBreak: 'break-all' }, S.mute) }, url),
      h('div', { style: S.mute }, '학생이 휴대폰 카메라로 비추면 앱이 열리고 [등원하기/하원하기]를 누르면 끝. 같은 QR로 등원과 하원을 모두 처리합니다. 사진으로 찍어 집에서 누를 수 있으므로 필요하면 운영자 화면에서 수동 수정하세요.'));
  }

  window.MMGlobal = MMGlobal;
  window.MMStudent = MMStudent;
  window.MMBoard = MMBoard;
})();
