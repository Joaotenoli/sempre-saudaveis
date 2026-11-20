-- Vigor: uma linha por pessoa com todos os registros dela.
-- Cole este arquivo inteiro em Supabase → SQL Editor → New query → Run.

create table if not exists public.vigor_state (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.vigor_state enable row level security;

-- Cada pessoa só enxerga e altera a própria linha.
drop policy if exists "ler o proprio"      on public.vigor_state;
drop policy if exists "criar o proprio"    on public.vigor_state;
drop policy if exists "alterar o proprio"  on public.vigor_state;
drop policy if exists "apagar o proprio"   on public.vigor_state;

create policy "ler o proprio"     on public.vigor_state for select using (auth.uid() = user_id);
create policy "criar o proprio"   on public.vigor_state for insert with check (auth.uid() = user_id);
create policy "alterar o proprio" on public.vigor_state for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "apagar o proprio"  on public.vigor_state for delete using (auth.uid() = user_id);

-- Atualização ao vivo entre celular e computador.
do $$
begin
  alter publication supabase_realtime add table public.vigor_state;
exception when duplicate_object then null;
end $$;
