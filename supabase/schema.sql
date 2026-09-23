-- ============================================================
-- TravelWay 旅行社官网 · Supabase 数据库初始化（在 SQL Editor 执行一次）
-- 结构：业务数据整体存 jsonb（与前端数据模型 1:1，改版无需迁移表结构）
-- 权限：匿名访客可读内容/提交订单留言；后台管理写操作需登录（admins 表）
-- ============================================================

-- ---------- 1. 业务表 ----------
create table if not exists public.routes (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
create table if not exists public.destinations (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
create table if not exists public.guides (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
create table if not exists public.orders (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
create table if not exists public.messages (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
create table if not exists public.users (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
create table if not exists public.settings (
  id text primary key default 'site',
  data jsonb not null,
  updated_at timestamptz not null default now()
);

-- 管理员表（id 关联 Supabase Auth 用户；角色决定后台可管理范围）
create table if not exists public.admins (
  id uuid primary key references auth.users (id) on delete cascade,
  username text unique not null,          -- 登录邮箱
  name text not null default '',
  role text not null default 'operator' check (role in ('admin', 'operator')),
  created_at timestamptz not null default now()
);

-- ---------- 2. 角色判断函数（security definer 防 RLS 递归） ----------
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins a where a.id = auth.uid());
$$;

create or replace function public.is_super_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins a where a.id = auth.uid() and a.role = 'admin');
$$;

-- ---------- 3. 行级安全 ----------
alter table public.routes       enable row level security;
alter table public.destinations enable row level security;
alter table public.guides       enable row level security;
alter table public.orders       enable row level security;
alter table public.messages     enable row level security;
alter table public.users        enable row level security;
alter table public.settings     enable row level security;
alter table public.admins       enable row level security;

-- 内容表：人人可读；写需后台登录管理员
drop policy if exists routes_select on public.routes;
create policy routes_select on public.routes for select using (true);
drop policy if exists routes_write on public.routes;
create policy routes_write on public.routes for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists destinations_select on public.destinations;
create policy destinations_select on public.destinations for select using (true);
drop policy if exists destinations_write on public.destinations;
create policy destinations_write on public.destinations for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists guides_select on public.guides;
create policy guides_select on public.guides for select using (true);
drop policy if exists guides_write on public.guides;
create policy guides_write on public.guides for all using (public.is_admin()) with check (public.is_admin());

-- 订单/留言：游客可提交；读取/处理需管理员
drop policy if exists orders_insert on public.orders;
create policy orders_insert on public.orders for insert with check (true);
drop policy if exists orders_manage on public.orders;
create policy orders_manage on public.orders for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages for insert with check (true);
drop policy if exists messages_manage on public.messages;
create policy messages_manage on public.messages for all using (public.is_admin()) with check (public.is_admin());

-- 用户表：仅管理员维护
drop policy if exists users_manage on public.users;
create policy users_manage on public.users for all using (public.is_admin()) with check (public.is_admin());

-- 站点设置：人人可读；写仅超级管理员
drop policy if exists settings_select on public.settings;
create policy settings_select on public.settings for select using (true);
drop policy if exists settings_write on public.settings;
create policy settings_write on public.settings for all using (public.is_super_admin()) with check (public.is_super_admin());

-- 管理员表：登录管理员可读；增删改仅超级管理员
drop policy if exists admins_select on public.admins;
create policy admins_select on public.admins for select using (public.is_admin());
drop policy if exists admins_write on public.admins;
create policy admins_write on public.admins for all using (public.is_super_admin()) with check (public.is_super_admin());

-- ---------- 4. 存储桶（后台图片上传，公开读取） ----------
insert into storage.buckets (id, name, public)
values ('images', 'images', true)
on conflict (id) do nothing;

-- 已登录管理员可上传/删除；游客可读
drop policy if exists images_read on storage.objects;
create policy images_read on storage.objects for select using (bucket_id = 'images');
drop policy if exists images_write on storage.objects;
create policy images_write on storage.objects for insert to authenticated with check (bucket_id = 'images');
drop policy if exists images_update on storage.objects;
create policy images_update on storage.objects for update to authenticated using (bucket_id = 'images') with check (bucket_id = 'images');
drop policy if exists images_delete on storage.objects;
create policy images_delete on storage.objects for delete to authenticated using (bucket_id = 'images');

-- ---------- 5. 性能辅助 ----------
create index if not exists idx_routes_id on public.routes (id);
create index if not exists idx_orders_updated on public.orders (updated_at desc);
create index if not exists idx_messages_updated on public.messages (updated_at desc);
create index if not exists idx_admins_role on public.admins (role);
