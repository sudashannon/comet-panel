# Worklog 模式迁移方案

**目标**: 将 Worklog 的核心 UX 模式移植到 comet-panel，提升操作效率和视觉一致性。

---

## 1. Command Palette（命令面板）

### 现状
comet-panel 的导航完全依赖侧边栏图标点选，无键盘快捷入口，功能发现性差。

### Worklog 模式
`Ctrl+K` 弹出命令面板，支持四种模式：
- **默认**: fuzzy 搜索所有命令
- **`?`**: 快捷键速查
- **`#`**: 导航到看板/change
- **`/`**: 页面间跳转

fuzzy match 引擎分档 scoring: 精确匹配(1000) > 前缀匹配(800) > 子串(600) > 间隙匹配(300-500)

### 实施方案
```
web/src/components/CommandPalette.tsx    ← 新建：全屏模态命令面板
web/src/hooks/useCommandPalette.ts      ← 新建：命令注册 + fuzzy
web/src/hooks/useKeyboardShortcuts.ts   ← 新建：全局快捷键监听
```

**命令分类**:
| 类别 | 命令 |
|---|---|
| Navigation | 变更视图、图谱、时间线、搜索、最近、Lint、报告、分享、日历、设置 |
| Actions | 打开工作区、新变更、建报告、建分享链接 |
| View | Ctrl+R 刷新、收藏夹 |

**fuzzy match**: 移植 Worklog 的算法（纯 JS，~80 行），不依赖额外库。

**触发**: `Ctrl+K` / `Cmd+K` 全局监听，侧栏底部加 `⌨️` 按钮。

---

## 2. 设计 Token 标准化

### 现状
Tailwind 一把梭，色值在组件里硬编码 `text-[#1d1d1f]` / `bg-[#f5f5f7]` 满天飞，没有语义化变量。

### Worklog 模式
Carbon Design System 的语义 token：`primary`/`success`/`danger`/`warning` + neutral gray scale。

### 实施方案
在 `styles.css` 扩展 CSS 变量：
```css
:root {
  --color-bg: #f5f5f7;
  --color-surface: #ffffff;
  --color-border: #e8e8ed;
  --color-text-primary: #1d1d1f;
  --color-text-secondary: #8e8e93;
  --color-accent: #0063f8;
  --color-accent-hover: #004ec6;
  --color-success: #198038;
  --color-danger: #da1e28;
  --color-warn: #f1c21b;
  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 14px;
  --shadow-card: 0 4px 12px rgba(0,0,0,0.06);
  --shadow-modal: 0 8px 24px rgba(0,0,0,0.12);
}
```

然后批量替换硬编码色值 → CSS 变量引用（Tailwind `text-primary` 映射到 `text-[var(--color-text-primary)]`），**分文件逐一替换，确保每步 TypeScript + test 通过**。

---

## 3. 键盘快捷键系统

### 现状
仅 3 处键盘支持：KPI 卡片 Enter/Space、ChatBubble Enter/Shift+Enter、MarkdownViewer Escape。

### 实施方案
`useKeyboardShortcuts.ts`:
- 全局 `Ctrl+K` → Command Palette
- View 切换快捷键（参考 VS Code）：
  - `Ctrl+1` 变更、`Ctrl+2` 图谱、`Ctrl+3` 时间线、`Ctrl+4` 搜索、`Ctrl+5` 最近、`Ctrl+6` Lint、`Ctrl+7` 日历
- `Ctrl+F` → 搜索面板
- `Ctrl+Shift+F` → 全局语义搜索
- `Escape` → 关闭当前 overlay / 返回上级视图
- `Ctrl+B` → 收藏夹开关

所有快捷键在 Command Palette `?` 模式下可查。

---

## 4. 实施计划

### Phase 1: 基础设施（不改行为，只加能力）
1. 新建 `web/src/hooks/useKeyboardShortcuts.ts` —— 全局 keydown 监听 + 注册表
2. 新建 `web/src/hooks/useCommandPalette.ts` —— fuzzy match + 命令注册
3. 扩展 `styles.css` —— 添加 CSS 变量 token
4. 在 `App.tsx` 集成 `useKeyboardShortcuts`

### Phase 2: Command Palette 组件
5. 新建 `web/src/components/CommandPalette.tsx` —— 模态面板 UI
6. 在 `App.tsx` 挂载，`Ctrl+K` 触发
7. 在 `SideRail.tsx` 底部加 `⌨️` 按钮
8. 写测试 `CommandPalette.test.tsx`

### Phase 3: 颜色 Token 迁移
9. 逐个文件替换硬编码色值为 CSS 变量：
   - `SideRail.tsx` → token
   - `MarkdownViewer.tsx` → token
   - `ChangeDetail.tsx` → token
   - `CalendarPanel.tsx` → token
   - ...其余组件
10. 验证：`npx tsc --noEmit` + `npx vitest run` + 浏览器冒烟

### Phase 4: View 快捷键 + Zoom 控制
11. 在 `useKeyboardShortcuts` 注册 view 切换快捷键
12. 联动 Command Palette 的 `?` 模式显示
13. 新建 `web/src/hooks/useAppZoom.ts` —— zoom 状态持久化到 localStorage
14. 在 `App.tsx` 根 div 设 `style={{ zoom }}`，`Ctrl+=`/`Ctrl+-`/`Ctrl+0` 缩放
15. SideRail 底部加缩放指示器 `90%`

### Phase 5: 分页 / 虚拟列表
16. `wiki/api.go` 已有 page/pageSize，前端 `SemanticSearch.tsx` 已用——**无需后端改动**
17. `ChangeExplorer.tsx` 改为分页加载（当前全量渲染，changes 多时卡）
18. `RecentPanel.tsx` 改为分页（当前一次拉全部）
19. `CalendarPanel` 复用已有 API（月份粒度自然分页——无需改动）

### Phase 6: 冒烟验证
20. `npx tsc --noEmit` + `npx vitest run`
21. 浏览器: 每个 view 切换正常，Ctrl+K 弹面板，Ctrl+1~7 切视图，Ctrl+= 缩放

---

## 5. 不做的事

- **不引入 Carbon 组件库** —— comet-panel 的 React + Tailwind 体系是故意的轻量选择，换成 Carbon React 会引入 500KB+ bundle
- **不重构状态管理** —— React Context 不比当前 `useState` 提升到 App 更好，prop drilling 在此规模下可接受
- **不做 i18n** —— 项目当前只面向中文用户，引入 paraglide 是过度工程
