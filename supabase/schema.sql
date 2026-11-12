-- FarejaLivro 1.5 — banco das indicações
-- Rodar uma vez no SQL Editor do Supabase (projeto farejalivro).
-- Regras:
--   • Leitor (sem login): só envia indicação. Ela entra como "pendente".
--   • Qualquer pessoa: só lê indicações publicadas e no ar.
--   • Equipe (login + e-mail na tabela admins): faz tudo.

set client_min_messages = warning;

-- ---------- Tabelas ----------
create table if not exists public.categorias (
  id     text primary key,
  nome   text not null,
  ordem  int  not null default 0,
  ativa  boolean not null default true
);

create table if not exists public.admins (
  email text primary key
);

create table if not exists public.palavras_bloqueadas (
  palavra text primary key
);

create table if not exists public.indicacoes (
  id             uuid primary key default gen_random_uuid(),
  tipo           text not null check (tipo in ('equipe','leitor')),
  status         text not null default 'pendente' check (status in ('pendente','publicada','recusada')),
  no_ar          boolean not null default true,
  titulo         text not null check (char_length(titulo) between 1 and 200),
  autor          text not null check (char_length(autor) between 1 and 200),
  categoria      text not null references public.categorias(id),
  texto          text not null default '' check (char_length(texto) <= 280),
  indicado_por   text check (indicado_por is null or char_length(indicado_por) <= 60),
  link_afiliado  text check (link_afiliado is null or link_afiliado ~* '^https://([a-z0-9-]+\.)*(meli\.la|mercadolivre\.com\.br|mercadolivre\.com)(/|$)'),
  capa_url       text check (capa_url is null or capa_url ~* '^https://'),
  mais_leitores  int  not null default 0,
  instalacao     text check (instalacao is null or char_length(instalacao) <= 64),
  bloqueio       text,
  criada_em      timestamptz not null default now(),
  publicada_em   timestamptz
);

create index if not exists indicacoes_publicadas_idx on public.indicacoes (status, no_ar, publicada_em desc);
create index if not exists indicacoes_instalacao_idx on public.indicacoes (instalacao, criada_em);

-- ---------- Quem é da equipe ----------
create or replace function public.eh_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.admins a
    where lower(a.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

-- ---------- Regras automáticas ao enviar ----------
create or replace function public.antes_de_inserir_indicacao() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  n int;
  t text;
begin
  if public.eh_admin() then
    if new.status = 'publicada' and new.publicada_em is null then
      new.publicada_em := now();
    end if;
    return new;
  end if;

  -- Quem não é da equipe só consegue enviar indicação de leitor, pendente e sem link.
  new.tipo          := 'leitor';
  new.status        := 'pendente';
  new.no_ar         := true;
  new.link_afiliado := null;
  new.capa_url      := null;
  new.mais_leitores := 0;
  new.bloqueio      := null;
  new.criada_em     := now();
  new.publicada_em  := null;
  new.titulo        := btrim(new.titulo);
  new.autor         := btrim(new.autor);
  new.texto         := btrim(coalesce(new.texto, ''));
  new.indicado_por  := nullif(btrim(coalesce(new.indicado_por, '')), '');

  if new.instalacao is null or char_length(new.instalacao) < 8 then
    raise exception 'instalacao_invalida';
  end if;
  if not exists (select 1 from public.categorias c where c.id = new.categoria and c.ativa) then
    raise exception 'categoria_invalida';
  end if;

  -- Limite: 3 indicações por instalação a cada 24 horas.
  select count(*) into n from public.indicacoes
   where instalacao = new.instalacao and criada_em > now() - interval '24 hours';
  if n >= 3 then
    raise exception 'limite_diario';
  end if;

  -- Filtro: link ou palavra bloqueada vai direto para "recusada" (não aparece na fila).
  t := lower(new.titulo || ' ' || new.autor || ' ' || new.texto || ' ' || coalesce(new.indicado_por, ''));
  if t ~ '(https?://|www\.|\.com\b|\.com\.br|\.net\b|\.ly\b|bit\.ly|wa\.me)' then
    new.status := 'recusada'; new.bloqueio := 'link';
  elsif exists (select 1 from public.palavras_bloqueadas p where t ~ ('\m' || p.palavra || '\M')) then
    new.status := 'recusada'; new.bloqueio := 'palavrao';
  end if;

  return new;
end $$;

drop trigger if exists antes_de_inserir_indicacao on public.indicacoes;
create trigger antes_de_inserir_indicacao
  before insert on public.indicacoes
  for each row execute function public.antes_de_inserir_indicacao();

create or replace function public.antes_de_atualizar_indicacao() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'publicada' and (old.status is distinct from 'publicada' or new.publicada_em is null) then
    new.publicada_em := coalesce(new.publicada_em, now());
  end if;
  return new;
end $$;

drop trigger if exists antes_de_atualizar_indicacao on public.indicacoes;
create trigger antes_de_atualizar_indicacao
  before update on public.indicacoes
  for each row execute function public.antes_de_atualizar_indicacao();

-- ---------- Segurança por linha ----------
alter table public.categorias          enable row level security;
alter table public.admins              enable row level security;
alter table public.palavras_bloqueadas enable row level security;
alter table public.indicacoes          enable row level security;

drop policy if exists categorias_ler   on public.categorias;
drop policy if exists categorias_admin on public.categorias;
create policy categorias_ler   on public.categorias for select to anon, authenticated using (true);
create policy categorias_admin on public.categorias for all    to authenticated using (public.eh_admin()) with check (public.eh_admin());

drop policy if exists admins_ler on public.admins;
create policy admins_ler on public.admins for select to authenticated using (public.eh_admin());

drop policy if exists palavras_admin on public.palavras_bloqueadas;
create policy palavras_admin on public.palavras_bloqueadas for all to authenticated using (public.eh_admin()) with check (public.eh_admin());

drop policy if exists indicacoes_enviar          on public.indicacoes;
drop policy if exists indicacoes_ler_publicadas  on public.indicacoes;
drop policy if exists indicacoes_admin_ler       on public.indicacoes;
drop policy if exists indicacoes_admin_mudar     on public.indicacoes;
drop policy if exists indicacoes_admin_apagar    on public.indicacoes;
create policy indicacoes_enviar         on public.indicacoes for insert to anon, authenticated with check (true);
create policy indicacoes_ler_publicadas on public.indicacoes for select to anon, authenticated using (status = 'publicada' and no_ar);
create policy indicacoes_admin_ler      on public.indicacoes for select to authenticated using (public.eh_admin());
create policy indicacoes_admin_mudar    on public.indicacoes for update to authenticated using (public.eh_admin()) with check (public.eh_admin());
create policy indicacoes_admin_apagar   on public.indicacoes for delete to authenticated using (public.eh_admin());

-- Permissões explícitas (o projeto não expõe tabelas novas automaticamente).
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.indicacoes          to authenticated;
grant select, insert, update, delete on public.categorias          to authenticated;
grant select                         on public.admins              to authenticated;
grant select, insert, update, delete on public.palavras_bloqueadas to authenticated;
grant execute on function public.eh_admin() to anon, authenticated;

-- Quem não é da equipe não vê a instalação nem o motivo de bloqueio.
revoke select, insert, update, delete on public.indicacoes from anon;
grant  select (id, tipo, status, no_ar, titulo, autor, categoria, texto, indicado_por,
               link_afiliado, capa_url, mais_leitores, publicada_em) on public.indicacoes to anon;
grant  insert (titulo, autor, categoria, texto, indicado_por, instalacao) on public.indicacoes to anon;
grant  select on public.categorias to anon;

-- ---------- Dados iniciais ----------
insert into public.categorias (id, nome, ordem) values
  ('terror','Terror',1), ('romance','Romance',2), ('romantasia','Romantasia',3),
  ('fantasia','Fantasia',4), ('ficcao','Ficção científica',5), ('suspense','Suspense',6),
  ('classicos','Clássicos',7), ('naoficcao','Não ficção',8), ('ya','Jovem adulto',9),
  ('hq','HQ e mangá',10), ('poesia','Poesia',11)
on conflict (id) do nothing;

insert into public.palavras_bloqueadas (palavra) values
  ('porra'),('caralho'),('merda'),('puta'),('puto'),('buceta'),('fdp'),('foda'),('fodase'),
  ('arrombado'),('cuzao'),('viado'),('vagabunda'),('desgraçado'),('otario'),('otário')
on conflict (palavra) do nothing;

-- ---------- Quem é da equipe ----------
-- Troque pelo e-mail que você usa no login do painel:
-- insert into public.admins (email) values ('seu-email@exemplo.com') on conflict do nothing;
