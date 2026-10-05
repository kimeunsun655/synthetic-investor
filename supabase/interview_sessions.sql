-- 심층 인터뷰 기록 저장소
-- Supabase 대시보드 → SQL Editor 에 붙여 넣고 한 번 실행하세요.
-- 인터뷰 한 건(합성·실제)이 한 줄로 저장되고, 팀원 화면과 참가자 링크가 이 테이블을 함께 씁니다.

create table if not exists public.interview_sessions (
  id                 text primary key,               -- 세션 ID (iv_...)
  data               jsonb not null default '{}'::jsonb,  -- 대화 · AI 노트 · 리뷰 전체
  participant_answer jsonb,                          -- 참가자 링크로 들어온 최신 답 { turn, text, at }
  updated_at         timestamptz not null default now()
);

create index if not exists interview_sessions_updated_at_idx
  on public.interview_sessions (updated_at desc);

-- 기존 personas · references_data 테이블과 같은 방식(공개 키로 읽기·쓰기)으로 연다.
-- 최근 Supabase 프로젝트는 새 테이블에 권한을 자동으로 주지 않으므로 GRANT가 필요하다 (없으면 HTTP 401).
grant select, insert, update on table public.interview_sessions to anon, authenticated;

alter table public.interview_sessions enable row level security;

drop policy if exists "interview_sessions read" on public.interview_sessions;
create policy "interview_sessions read" on public.interview_sessions
  for select to anon, authenticated using (true);

drop policy if exists "interview_sessions insert" on public.interview_sessions;
create policy "interview_sessions insert" on public.interview_sessions
  for insert to anon, authenticated with check (true);

drop policy if exists "interview_sessions update" on public.interview_sessions;
create policy "interview_sessions update" on public.interview_sessions
  for update to anon, authenticated using (true) with check (true);

-- 바뀐 권한을 Data API가 바로 읽도록 새로고침
notify pgrst, 'reload schema';
