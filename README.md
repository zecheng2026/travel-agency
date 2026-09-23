# HuanYou Travel 焕游旅行官网

> 多日游预订平台，支持目的地、线路、攻略三大模块，数据托管于 Supabase，云端实时同步。

## 快速预览

```bash
# 本地打开
open index.html
```

## 部署到 GitHub + Netlify

### 1. 创建 GitHub 仓库

在 GitHub 新建仓库后，本地执行：

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/<你的用户名>/travel-agency.git
git push -u origin main
```

### 2. 连接 Netlify

1. 登录 [Netlify](https://netlify.com) → **New site from Git**
2. 选择刚创建的 GitHub 仓库
3. 配置：
   - **Build command:** `(留空)`
   - **Publish directory:** `.`
4. 点击 **Deploy site**

### 3. 配置域名（可选）

Netlify 控制台 → Domain settings → Add custom domain，按提示配置 DNS。

## 项目结构

```
├── index.html            # 首页
├── routes.html           # 线路列表（SSR）
├── destinations.html     # 目的地列表（SSR）
├── guides.html           # 攻略列表（SSR）
├── route-detail.html     # 线路详情（SSR）
├── dest-detail.html      # 目的地详情（SSR）
├── guide-detail.html     # 攻略详情（SSR）
├── about.html            # 关于我们
├── contact.html          # 联系我们
├── booking.html          # 预订页面
├── admin.html            # 管理后台
├── css/                  # 样式文件
├── js/                   # 前端脚本
├── data/                 # 本地 JSON 数据
├── supabase/             # Supabase 数据库 schema + 种子数据
├── netlify/              # Netlify Functions (SSR)
│   └── functions/ssr.js  # 服务端渲染函数
├── netlify.toml          # Netlify 重定向配置
└── supabase-config.js    # Supabase 连接配置
```

## Supabase 数据配置

`supabase-config.js` 已内置项目 URL 和 anonKey，部署后数据自动从云端读取。

如需重建数据库，执行：
```bash
cd supabase
# 在 Supabase SQL Editor 中运行 schema.sql
# 然后执行 seed-cloud.js 灌入初始数据
```

## 功能模块

- **首页** — 轮播 Banner、精选目的地/线路/攻略、数量统计动画、用户评价
- **线路预订** — 列表筛选、SSR 详情页、行程安排、费用说明、预订表单
- **目的地** — 目的地介绍、景点推荐、TAG 分类
- **旅行攻略** — Markdown 渲染攻略、分类阅读量展示
- **管理后台** — 内容增删改查、首页设置、公告管理
