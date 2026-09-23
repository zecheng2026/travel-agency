/* =============================================
   TravelWay Supabase 配置（云模式开关）
   =============================================
   填写 Supabase 项目信息后即启用"云模式"（所有访客共享数据、后台改动全网生效）。
   留空 = 本地演示模式（数据存浏览器 localStorage，功能不变）。

   获取方式：Supabase Dashboard → Project Settings → API
   - url:      Project URL，如 https://abcdefg.supabase.co
   - anonKey:  anon / public key（前端公开，安全性由数据库 RLS 策略保证）

   部署前先执行 supabase/schema.sql（建表+权限），再用
   supabase/seed-cloud.js 灌入初始数据并创建管理员账号。
   ============================================= */
window.SUPABASE_CONFIG = {
  url: 'https://zkmfwjsexfosgotaxmnj.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InprbWZ3anNleGZvc2dvdGF4bW5qIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg4NDk4NzgsImV4cCI6MjEwNDQyNTg3OH0.L6KbpVifThZYjg7TSo182qKXaXKvfzyVhfJhzv9sgrk'
};
