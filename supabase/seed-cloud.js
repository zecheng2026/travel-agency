#!/usr/bin/env node
/* ============================================================
   TravelWay · Supabase 运维脚本（Node 18+，零依赖，使用全局 fetch）
   用法（需 Node 18+）：
     node supabase/seed-cloud.js seed <url> <serviceKey> [dir]
         - 把本地 data/*.json 全量写入云端（幂等 upsert，不改则跳过）
     node supabase/seed-cloud.js admin add    <url> <serviceKey> <email> <password> [name] [role]
         - 创建 Supabase Auth 用户 + admins 记录（role: admin | operator，默认 admin）
     node supabase/seed-cloud.js admin list  <url> <serviceKey>
     node supabase/seed-cloud.js admin pwd   <url> <serviceKey> <email> <newPassword>
     node supabase/seed-cloud.js admin rm    <url> <serviceKey> <email>
   示例：
     node supabase/seed-cloud.js seed https://xxxx.supabase.co eyJhbGciOi...
     node supabase/seed-cloud.js admin add https://xxxx.supabase.co eyJhbGciOi... admin@lvtu.com YourPass123 "总管理员" admin
   安全提示：serviceKey（service_role）等同数据库管理员权限，请仅在本地执行，切勿提交到代码库或前端。
   ============================================================ */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

function log(...a) { console.log('[seed-cloud]', ...a); }
function err(...a) { console.error('[seed-cloud ERROR]', ...a); }

function api(url, key, p) {
  return fetch(url + p.path, {
    method: p.method || 'GET',
    headers: {
      apikey: key,
      Authorization: 'Bearer ' + key,
      'Content-Type': 'application/json',
      ...(p.headers || {})
    },
    body: p.body ? JSON.stringify(p.body) : undefined
  });
}

async function rest(url, key, table, method, body) {
  const r = await api(url, key, {
    path: '/rest/v1/' + table,
    method,
    headers: body ? { Prefer: 'return=representation,resolution=merge-duplicates' } : {},
    body
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`${table} ${method} -> ${r.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

/* ---------- seed：本地 data/*.json -> 云端 ---------- */
async function seed(url, key, dir) {
  const dirPath = dir || path.join(ROOT, 'data');
  const tables = [
    { file: 'routes.json', table: 'routes', seedOrder: ['R001', 'R002', 'R003', 'R004', 'R005', 'R006'] },
    { file: 'destinations.json', table: 'destinations', seedOrder: ['D001', 'D002', 'D003', 'D004', 'D005', 'D006', 'D007', 'D008'] },
    { file: 'guides.json', table: 'guides', seedOrder: ['G001', 'G002', 'G003', 'G004', 'G005', 'G006'] },
    { file: 'settings.json', table: 'settings' } // 单条，id 固定 'site'
  ];
  // 云端现有 id：seed 若相等则跳过（尊重后台已改内容）
  for (const t of tables) {
    const fp = path.join(dirPath, t.file);
    if (!fs.existsSync(fp)) { log('missing', fp); continue; }
    const list = JSON.parse(fs.readFileSync(fp, 'utf8'));
    const items = Array.isArray(list) ? list : [list];
    if (!items.length) continue;

    let existing = [];
    try {
      const r = await api(url, key, { path: '/rest/v1/' + t.table + '?select=id' });
      if (r.ok) existing = JSON.parse(await r.text()).map(x => x.id);
    } catch (e) { log('list existing failed (ignore):', e.message); }

    const toUpsert = [];
    for (const it of items) {
      if (!it) continue;
      // settings 表是单行表，JSON 文件不带 id，强制使用 'site'
      const rowId = it.id || (t.table === 'settings' ? 'site' : null);
      if (!rowId) continue;
      if (existing.includes(rowId)) {
        const isSeed = t.seedOrder && t.seedOrder.includes(rowId);
        if (isSeed) continue; // 种子数据已被后台改过则保留云端
      }
      toUpsert.push({ id: rowId, data: it, updated_at: new Date().toISOString() });
    }
    if (!toUpsert.length) { log(`${t.table}: 全部与云端一致，跳过`); continue; }
    await rest(url, key, t.table, 'POST', toUpsert);
    log(`${t.table}: upsert ${toUpsert.length} 条（新增或本地版本更新）`);
  }

  // settings 单条 id='site'
  log('seed done. 如需创建管理员：node supabase/seed-cloud.js admin add <url> <key> <email> <pwd>');
}

/* ---------- 管理员管理（Auth Admin API + admins 表） ---------- */
async function adminAdd(url, key, email, password, name, role) {
  role = role || 'admin';
  const r = await api(url, key, {
    path: '/auth/v1/admin/users',
    method: 'POST',
    body: { email, password, email_confirm: true }
  });
  const txt = await r.text();
  if (!r.ok) {
    if (txt.includes('already been registered')) { log('Auth 用户已存在，继续补齐 admins 记录…'); }
    else throw new Error('auth create -> ' + r.status + ' ' + txt.slice(0, 300));
  }
  let userId = null;
  try { userId = JSON.parse(txt).id; } catch (e) {}
  if (!userId) {
    // 已存在 → 查 id
    const g = await api(url, key, { path: '/auth/v1/admin/users?filter=email=eq.' + encodeURIComponent(email) });
    const users = await g.json();
    userId = users.users && users.users[0] && users.users[0].id;
  }
  if (!userId) throw new Error('无法解析用户 id');
  await rest(url, key, 'admins', 'POST', [{ id: userId, username: email, name: name || email.split('@')[0], role }]);
  log(`管理员就绪: ${email} (${role === 'admin' ? '超级管理员' : '运营人员'}) ${name || ''}`);
}

async function adminList(url, key) {
  const rows = await rest(url, key, 'admins?select=id,username,name,role', 'GET');
  for (const a of rows) log(`${a.username} | ${a.name || '-'} | ${a.role}`);
  log(`共 ${rows.length} 个管理员`);
}

async function adminPwd(url, key, email, newPwd) {
  const g = await api(url, key, { path: '/auth/v1/admin/users?filter=email=eq.' + encodeURIComponent(email) });
  const users = (await g.json()).users || [];
  const u = users[0];
  if (!u) throw new Error('用户不存在: ' + email);
  const r = await api(url, key, { path: '/auth/v1/admin/users/' + u.id, method: 'PUT', body: { password: newPwd } });
  if (!r.ok) throw new Error('auth update -> ' + r.status + ' ' + (await r.text()).slice(0, 300));
  log('密码已更新: ' + email);
}

async function adminRm(url, key, email) {
  const g = await api(url, key, { path: '/auth/v1/admin/users?filter=email=eq.' + encodeURIComponent(email) });
  const users = (await g.json()).users || [];
  const u = users[0];
  if (!u) { log('未找到用户: ' + email); return; }
  await rest(url, key, 'admins?username=eq.' + encodeURIComponent(email), 'DELETE');
  const r = await api(url, key, { path: '/auth/v1/admin/users/' + u.id, method: 'DELETE' });
  if (!r.ok && r.status !== 404) throw new Error('auth delete -> ' + r.status);
  log('管理员已删除: ' + email);
}

/* ---------- main ---------- */
(async () => {
  const argv = process.argv.slice(2);
  const cmd = argv[0];
  let url, key, sub, subArgs;
  if (cmd === 'seed') {
    url = argv[1]; key = argv[2];
  } else if (cmd === 'admin') {
    sub = argv[1]; url = argv[2]; key = argv[3]; subArgs = argv.slice(4);
  } else {
    log('用法: node supabase/seed-cloud.js <seed|admin> <supabaseUrl> <serviceKey> [...]');
    log('  seed  : node supabase/seed-cloud.js seed <url> <serviceKey>');
    log('  add   : node supabase/seed-cloud.js admin add <url> <key> <email> <password> [name] [admin|operator]');
    log('  list  : node supabase/seed-cloud.js admin list <url> <key>');
    log('  pwd   : node supabase/seed-cloud.js admin pwd <url> <key> <email> <newPassword>');
    log('  rm    : node supabase/seed-cloud.js admin rm <url> <key> <email>');
    process.exit(1);
  }
  if (!url || !key || !/^https:\/\//.test(url)) {
    log('缺少 supabaseUrl / serviceKey'); process.exit(1);
  }
  if (cmd === 'seed') { await seed(url, key, argv[3]); }
  else if (cmd === 'admin') {
    if (sub === 'add') await adminAdd(url, key, subArgs[0], subArgs[1], subArgs[2], subArgs[3]);
    else if (sub === 'list') await adminList(url, key);
    else if (sub === 'pwd') await adminPwd(url, key, subArgs[0], subArgs[1]);
    else if (sub === 'rm') await adminRm(url, key, subArgs[0]);
    else log('未知 admin 子命令: ' + sub);
  }
})().catch(e => { err(e.message); process.exit(1); });
