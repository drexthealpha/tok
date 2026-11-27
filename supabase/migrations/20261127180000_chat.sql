-- Tok chat: who is in which chat, and the messages. Row level security
-- lets a user read and write only the chats their wallet is a member of.

create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  wallet text not null,
  created_at timestamptz not null default now()
);
create index profiles_wallet on public.profiles (wallet);

create table public.chats (
  id uuid primary key default gen_random_uuid(),
  created_by text not null,
  created_at timestamptz not null default now()
);

create table public.members (
  chat_id uuid not null references public.chats (id) on delete cascade,
  wallet text not null,
  primary key (chat_id, wallet)
);
create index members_wallet on public.members (wallet);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references public.chats (id) on delete cascade,
  sender text not null,
  kind text not null check (kind in ('text', 'pay', 'request', 'voice', 'action')),
  body text,
  amount bigint check (amount is null or amount > 0),
  to_wallet text,
  request_id uuid references public.messages (id),
  split_id uuid,
  signature text,
  audio_path text,
  transcript text,
  preview jsonb,
  created_at timestamptz not null default now()
);
create index messages_chat on public.messages (chat_id, created_at);
-- A request can be paid once from its bubble.
create unique index messages_one_payment_per_request on public.messages (request_id) where kind = 'pay';

-- Wallets the signed-in user has proved they own.
create function public.my_wallets() returns setof text
language sql stable security definer set search_path = public as $$
  select wallet from public.profiles where user_id = auth.uid()
$$;

create function public.is_member(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.members m where m.chat_id = c and m.wallet in (select public.my_wallets()))
$$;

alter table public.profiles enable row level security;
alter table public.chats enable row level security;
alter table public.members enable row level security;
alter table public.messages enable row level security;

-- Profiles are written only by Tok's server after it checks a wallet signature.
create policy profiles_read_own on public.profiles for select using (user_id = auth.uid());

create policy chats_read on public.chats for select using (public.is_member(id) or created_by in (select public.my_wallets()));
create policy chats_create on public.chats for insert with check (created_by in (select public.my_wallets()));

create policy members_read on public.members for select using (public.is_member(chat_id));
-- The chat's creator adds members.
create policy members_add on public.members for insert with check (
  exists (select 1 from public.chats c where c.id = chat_id and c.created_by in (select public.my_wallets()))
);

create policy messages_read on public.messages for select using (public.is_member(chat_id));
create policy messages_send on public.messages for insert with check (
  public.is_member(chat_id) and sender in (select public.my_wallets())
);

-- Voice messages: stored under <chat id>/<file>, readable by members only.
insert into storage.buckets (id, name, public) values ('voice', 'voice', false) on conflict do nothing;
create policy voice_read on storage.objects for select using (
  bucket_id = 'voice' and public.is_member(((storage.foldername(name))[1])::uuid)
);
create policy voice_write on storage.objects for insert with check (
  bucket_id = 'voice' and public.is_member(((storage.foldername(name))[1])::uuid)
);

alter publication supabase_realtime add table public.messages;

-- Explicit grants: row level security above decides which rows.
grant usage on schema public to anon, authenticated;
grant select on public.profiles to authenticated;
grant select, insert on public.chats, public.members, public.messages to authenticated;
grant execute on function public.my_wallets(), public.is_member(uuid) to authenticated;
