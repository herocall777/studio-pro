-- =====================================================================
-- ScheduleMate 확장 001 : 출결 · 녹음 · AI 요약 · 푸시 · 권한(RLS)
-- 실행 위치: Supabase 대시보드 > SQL Editor > New query > 붙여넣고 Run
-- 여러 번 실행해도 안전하도록(idempotent) 작성되어 있습니다.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. 권한 판별 함수
--    기존 user_profiles(email, role, studio_id) 를 기준으로 판단합니다.
--    로그인 이메일은 JWT 의 email 값을 사용합니다(전화번호 로그인도 내부적으로 email 형태).
-- ---------------------------------------------------------------------
create or replace function public.mm_email() returns text
language sql stable as $$ select lower(coalesce(auth.jwt() ->> 'email','')) $$;

create or replace function public.mm_role(p_studio text) returns text
language sql stable security definer set search_path = public as $$
  select role from public.user_profiles
  where lower(email) = public.mm_email() and studio_id::text = p_studio
  limit 1
$$;

create or replace function public.mm_is_admin(p_studio text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.mm_role(p_studio) in ('원장','실장','슈퍼어드민'), false)
$$;

create or replace function public.mm_is_owner(p_studio text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.mm_role(p_studio) in ('원장','슈퍼어드민'), false)
$$;

-- ---------------------------------------------------------------------
-- 1. 명단(roster) : 학생 ↔ 담당강사 ↔ 학부모 연결표
--    앱의 회원 데이터(studio_data)를 이 표로 동기화해 두면, 서버가 권한을 판단합니다.
-- ---------------------------------------------------------------------
create table if not exists public.mm_roster (
  studio_id      text not null,
  member_id      text not null,                 -- 앱 회원 id
  name           text not null,
  subject        text,                          -- 과목(보컬/피아노 등)
  teacher_email  text,                          -- 담당 강사
  student_email  text,                          -- 학생 로그인 이메일
  parent_emails  text[] not null default '{}',  -- 학부모 로그인 이메일(복수 가능)
  active         boolean not null default true,
  updated_at     timestamptz not null default now(),
  primary key (studio_id, member_id)
);

-- 강사별 열람 범위: all=전체 학생 / own=담당 학생만 / subjects=지정 과목 학생
create table if not exists public.mm_staff_scope (
  studio_id  text not null,
  email      text not null,
  scope      text not null default 'own' check (scope in ('all','own','subjects')),
  subjects   text[] not null default '{}',
  primary key (studio_id, email)
);

-- 이 학생을 "내가" 볼 수 있는가?  (운영자 / 강사 범위 / 본인 / 학부모)
create or replace function public.mm_can_see(p_studio text, p_member text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare r public.mm_roster; s public.mm_staff_scope; me text := public.mm_email();
begin
  if public.mm_is_admin(p_studio) then return true; end if;
  select * into r from public.mm_roster where studio_id = p_studio and member_id = p_member;
  if not found then return false; end if;
  if lower(coalesce(r.student_email,'')) = me then return true; end if;
  if me = any (select lower(x) from unnest(r.parent_emails) x) then return true; end if;
  if public.mm_role(p_studio) = '강사' then
    if lower(coalesce(r.teacher_email,'')) = me then return true; end if;
    select * into s from public.mm_staff_scope where studio_id = p_studio and lower(email) = me;
    if found then
      if s.scope = 'all' then return true; end if;
      if s.scope = 'subjects' and r.subject = any (s.subjects) then return true; end if;
    end if;
  end if;
  return false;
end $$;

-- ---------------------------------------------------------------------
-- 2. 등원/하원 기록
-- ---------------------------------------------------------------------
create table if not exists public.mm_attendance (
  id         uuid primary key default gen_random_uuid(),
  studio_id  text not null,
  member_id  text not null,
  kind       text not null check (kind in ('in','out')),
  at         timestamptz not null default now(),
  source     text not null default 'qr',
  created_by text default public.mm_email()
);
create index if not exists mm_attendance_lookup on public.mm_attendance (studio_id, at desc);
create index if not exists mm_attendance_member on public.mm_attendance (studio_id, member_id, at desc);

-- ---------------------------------------------------------------------
-- 3. 학생 연습 녹음 (선생님 + 학부모 열람)
-- ---------------------------------------------------------------------
create table if not exists public.mm_practice (
  id            uuid primary key default gen_random_uuid(),
  studio_id     text not null,
  member_id     text not null,
  storage_path  text not null,          -- Storage 버킷 mm-practice 안의 경로
  duration_sec  integer,
  note          text,
  created_at    timestamptz not null default now()
);
create index if not exists mm_practice_member on public.mm_practice (studio_id, member_id, created_at desc);

-- ---------------------------------------------------------------------
-- 4. 수업 녹음 원본(운영자 전용) + AI 요약(강사·학생·학부모 열람)
--    원본 파일 정보는 mm_class_audio, 요약은 mm_class_summary 로 표를 분리해서
--    "요약은 공개 / 원본은 운영자만" 을 서버가 강제합니다.
-- ---------------------------------------------------------------------
create table if not exists public.mm_class_audio (
  id            uuid primary key default gen_random_uuid(),
  studio_id     text not null,
  member_id     text not null,
  teacher_email text,
  storage_path  text not null,          -- Storage 버킷 mm-class-original (비공개, 운영자만)
  duration_sec  integer,
  lesson_date   date not null default current_date,
  status        text not null default 'uploaded' check (status in ('uploaded','summarizing','done','error')),
  error         text,
  created_at    timestamptz not null default now()
);

create table if not exists public.mm_class_summary (
  audio_id     uuid primary key references public.mm_class_audio(id) on delete cascade,
  studio_id    text not null,
  member_id    text not null,
  lesson_date  date not null,
  summary      text not null,           -- 오늘 수업 요약
  homework     text,                    -- 숙제/연습 포인트
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 5. 앱 이용 기록 (앱을 몇 번 나갔다 들어왔는지)
-- ---------------------------------------------------------------------
create table if not exists public.mm_app_events (
  id         uuid primary key default gen_random_uuid(),
  studio_id  text not null,
  member_id  text not null,
  event      text not null check (event in ('open','leave','return')),
  at         timestamptz not null default now(),
  context    text                       -- 예: 'practice' (연습 중 이탈 구분)
);
create index if not exists mm_app_events_member on public.mm_app_events (studio_id, member_id, at desc);

-- ---------------------------------------------------------------------
-- 6. 푸시 구독 / AI 키(서버 전용)
-- ---------------------------------------------------------------------
create table if not exists public.mm_push_sub (
  endpoint   text primary key,
  email      text not null,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now()
);

-- AI 키는 서버(Edge Function, service_role)만 읽고 씁니다. 정책을 일부러 만들지 않습니다.
create table if not exists public.mm_secrets (
  studio_id  text primary key,
  gemini_key text,
  updated_at timestamptz not null default now()
);

-- 알림 발송 대기열(서버 함수가 처리)
create table if not exists public.mm_outbox (
  id         uuid primary key default gen_random_uuid(),
  studio_id  text not null,
  to_emails  text[] not null,
  title      text not null,
  body       text not null,
  url        text,
  created_at timestamptz not null default now(),
  sent_at    timestamptz
);

-- ---------------------------------------------------------------------
-- 7. RLS (행 단위 권한)
-- ---------------------------------------------------------------------
alter table public.mm_roster        enable row level security;
alter table public.mm_staff_scope   enable row level security;
alter table public.mm_attendance    enable row level security;
alter table public.mm_practice      enable row level security;
alter table public.mm_class_audio   enable row level security;
alter table public.mm_class_summary enable row level security;
alter table public.mm_app_events    enable row level security;
alter table public.mm_push_sub      enable row level security;
alter table public.mm_secrets       enable row level security;
alter table public.mm_outbox        enable row level security;

-- 명단: 운영자 전체 관리 / 그 외는 "볼 수 있는" 학생만 조회
drop policy if exists roster_admin on public.mm_roster;
create policy roster_admin on public.mm_roster for all
  using (public.mm_is_admin(studio_id)) with check (public.mm_is_admin(studio_id));
drop policy if exists roster_read on public.mm_roster;
create policy roster_read on public.mm_roster for select
  using (public.mm_can_see(studio_id, member_id));

-- 강사 범위: 원장만 설정, 본인 것은 조회 가능
drop policy if exists scope_owner on public.mm_staff_scope;
create policy scope_owner on public.mm_staff_scope for all
  using (public.mm_is_owner(studio_id)) with check (public.mm_is_owner(studio_id));
drop policy if exists scope_self on public.mm_staff_scope;
create policy scope_self on public.mm_staff_scope for select
  using (lower(email) = public.mm_email());

-- 출결: 볼 수 있는 학생만 조회 / 기록은 운영자·강사·학생 본인(QR 촬영)이 추가
drop policy if exists att_read on public.mm_attendance;
create policy att_read on public.mm_attendance for select
  using (public.mm_can_see(studio_id, member_id));
drop policy if exists att_insert on public.mm_attendance;
create policy att_insert on public.mm_attendance for insert
  with check (
    public.mm_is_admin(studio_id)
    or public.mm_role(studio_id) = '강사'
    or exists (select 1 from public.mm_roster r
               where r.studio_id = mm_attendance.studio_id and r.member_id = mm_attendance.member_id
                 and lower(coalesce(r.student_email,'')) = public.mm_email())
  );
drop policy if exists att_admin_write on public.mm_attendance;
create policy att_admin_write on public.mm_attendance for update
  using (public.mm_is_admin(studio_id)) with check (public.mm_is_admin(studio_id));

-- 연습 녹음: 볼 수 있는 사람이 조회 / 본인(학생)이 업로드
drop policy if exists prac_read on public.mm_practice;
create policy prac_read on public.mm_practice for select
  using (public.mm_can_see(studio_id, member_id));
drop policy if exists prac_insert on public.mm_practice;
create policy prac_insert on public.mm_practice for insert
  with check (exists (select 1 from public.mm_roster r
               where r.studio_id = mm_practice.studio_id and r.member_id = mm_practice.member_id
                 and lower(coalesce(r.student_email,'')) = public.mm_email()));

-- 수업 녹음 원본: 운영자만 조회, 강사는 업로드만
drop policy if exists audio_admin_read on public.mm_class_audio;
create policy audio_admin_read on public.mm_class_audio for select
  using (public.mm_is_admin(studio_id));
drop policy if exists audio_teacher_insert on public.mm_class_audio;
create policy audio_teacher_insert on public.mm_class_audio for insert
  with check (public.mm_is_admin(studio_id)
              or (public.mm_role(studio_id) = '강사' and public.mm_can_see(studio_id, member_id)));

-- 강사는 자기가 올린 녹음의 처리 상태(메타정보)만 조회 (파일 자체는 운영자만 받을 수 있음)
drop policy if exists audio_teacher_read on public.mm_class_audio;
create policy audio_teacher_read on public.mm_class_audio for select
  using (lower(coalesce(teacher_email,'')) = public.mm_email());

-- 수업 요약: 볼 수 있는 모두(강사·학생·학부모·운영자). 쓰기는 서버 함수만(정책 없음).
drop policy if exists sum_read on public.mm_class_summary;
create policy sum_read on public.mm_class_summary for select
  using (public.mm_can_see(studio_id, member_id));

-- 앱 이탈 기록: 본인이 기록, 볼 수 있는 사람이 조회
drop policy if exists ev_read on public.mm_app_events;
create policy ev_read on public.mm_app_events for select
  using (public.mm_can_see(studio_id, member_id));
drop policy if exists ev_insert on public.mm_app_events;
create policy ev_insert on public.mm_app_events for insert
  with check (exists (select 1 from public.mm_roster r
               where r.studio_id = mm_app_events.studio_id and r.member_id = mm_app_events.member_id
                 and lower(coalesce(r.student_email,'')) = public.mm_email()));

-- 푸시 구독: 본인 것만
drop policy if exists push_self on public.mm_push_sub;
create policy push_self on public.mm_push_sub for all
  using (lower(email) = public.mm_email()) with check (lower(email) = public.mm_email());

-- mm_secrets / mm_outbox : 정책 없음 = 일반 사용자 접근 불가(서버 함수 전용)

-- ---------------------------------------------------------------------
-- 8. 등원/하원 기록이 생기면 학부모·강사·학생에게 알림 대기열 추가
-- ---------------------------------------------------------------------
create or replace function public.mm_on_attendance() returns trigger
language plpgsql security definer set search_path = public as $$
declare r public.mm_roster; recipients text[]; label text; t text;
begin
  select * into r from public.mm_roster where studio_id = new.studio_id and member_id = new.member_id;
  if not found then return new; end if;
  recipients := coalesce(r.parent_emails, '{}');
  if r.teacher_email is not null then recipients := recipients || r.teacher_email; end if;
  if r.student_email is not null then recipients := recipients || r.student_email; end if;
  label := case new.kind when 'in' then '등원' else '하원' end;
  t := to_char(new.at at time zone 'Asia/Seoul', 'HH24:MI');
  insert into public.mm_outbox(studio_id, to_emails, title, body, url)
  values (new.studio_id, recipients, r.name || ' ' || label,
          r.name || ' 학생이 ' || t || '에 ' || label || '했습니다.', '/studio-pro/');
  return new;
end $$;

drop trigger if exists mm_attendance_notify on public.mm_attendance;
create trigger mm_attendance_notify after insert on public.mm_attendance
  for each row execute function public.mm_on_attendance();

-- ---------------------------------------------------------------------
-- 9. 편의 뷰: 운영자 "오늘 누가 언제 왔고 갔는지" 한눈에
-- ---------------------------------------------------------------------
create or replace view public.mm_today_board with (security_invoker = true) as
select r.studio_id, r.member_id, r.name, r.subject, r.teacher_email,
       min(a.at) filter (where a.kind = 'in')  as first_in,
       max(a.at) filter (where a.kind = 'out') as last_out,
       case when max(a.at) filter (where a.kind = 'in') is null then 'absent'
            when coalesce(max(a.at) filter (where a.kind = 'out'), 'epoch')
                 < max(a.at) filter (where a.kind = 'in') then 'present'
            else 'left' end as state
from public.mm_roster r
left join public.mm_attendance a
  on a.studio_id = r.studio_id and a.member_id = r.member_id
 and (a.at at time zone 'Asia/Seoul')::date = (now() at time zone 'Asia/Seoul')::date
where r.active
group by r.studio_id, r.member_id, r.name, r.subject, r.teacher_email;

-- ---------------------------------------------------------------------
-- 10. Storage 버킷 (비공개)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public) values
  ('mm-practice', 'mm-practice', false),
  ('mm-class-original', 'mm-class-original', false)
on conflict (id) do nothing;

-- 경로 규칙: {studio_id}/{member_id}/{파일명}
-- 연습 녹음: 학생 본인 업로드, 볼 수 있는 사람 재생
drop policy if exists mm_prac_up on storage.objects;
create policy mm_prac_up on storage.objects for insert to authenticated
  with check (bucket_id = 'mm-practice' and exists (
    select 1 from public.mm_roster r
    where r.studio_id = (storage.foldername(name))[1] and r.member_id = (storage.foldername(name))[2]
      and lower(coalesce(r.student_email,'')) = public.mm_email()));
drop policy if exists mm_prac_dl on storage.objects;
create policy mm_prac_dl on storage.objects for select to authenticated
  using (bucket_id = 'mm-practice'
         and public.mm_can_see((storage.foldername(name))[1], (storage.foldername(name))[2]));

-- 수업 원본: 업로드는 운영자·강사, 재생·다운로드는 운영자만
drop policy if exists mm_orig_up on storage.objects;
create policy mm_orig_up on storage.objects for insert to authenticated
  with check (bucket_id = 'mm-class-original' and
    (public.mm_is_admin((storage.foldername(name))[1])
     or (public.mm_role((storage.foldername(name))[1]) = '강사'
         and public.mm_can_see((storage.foldername(name))[1], (storage.foldername(name))[2]))));
drop policy if exists mm_orig_dl on storage.objects;
create policy mm_orig_dl on storage.objects for select to authenticated
  using (bucket_id = 'mm-class-original' and public.mm_is_admin((storage.foldername(name))[1]));
