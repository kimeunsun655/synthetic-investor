-- 인터뷰 참여자 스크리닝 응답
-- Supabase 대시보드 → SQL Editor 에 붙여 넣고 한 번 실행하세요.
-- 스크리닝 링크(?screen=1)에서 낸 응답이 한 줄로 저장되고, 플랫폼의 '스크리닝' 탭이 이 테이블을 읽습니다.

create table if not exists public.screenings (
  id          text primary key,                  -- 응답 ID (sc_...)
  answers     jsonb not null default '{}'::jsonb, -- 1~6번 답 (보기 번호)
  result      jsonb,                             -- 판정 · 수준 점수 · 특성
  contact     jsonb,                             -- 적합·예비일 때 받은 이름(닉네임) · 가능 일정
  review      jsonb,                             -- 연구팀 최종 선정 · 인터뷰 코드
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists screenings_created_at_idx
  on public.screenings (created_at desc);

-- 기존 테이블과 같은 방식(공개 키로 읽기·쓰기)으로 연다. GRANT가 없으면 HTTP 401
grant select, insert, update on table public.screenings to anon, authenticated;

alter table public.screenings enable row level security;

drop policy if exists "screenings read" on public.screenings;
create policy "screenings read" on public.screenings
  for select to anon, authenticated using (true);

drop policy if exists "screenings insert" on public.screenings;
create policy "screenings insert" on public.screenings
  for insert to anon, authenticated with check (true);

drop policy if exists "screenings update" on public.screenings;
create policy "screenings update" on public.screenings
  for update to anon, authenticated using (true) with check (true);

notify pgrst, 'reload schema';
