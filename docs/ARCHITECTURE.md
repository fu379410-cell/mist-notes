# 架构与数据流

## 主客户端

Electron 主进程是唯一的数据和系统集成入口。React/Tiptap 窗口通过 `client/electron/preload.ts` 暴露的类型化 API 发起请求；`main.ts` 校验发送方为受管理窗口、主 frame 和对应文件来源。生产渲染器使用隔离与沙箱，禁用 Node 集成，并以 CSP 限制网络连接。

| 模块 | 责任 |
| --- | --- |
| `src/App.tsx` | 窗口状态、保存队列、面板与编辑事件协调 |
| `src/editor.ts`、`FontPanel.tsx` | 编辑器文档、格式与单次手势历史 |
| `src/shared/themes.ts` | 稳定配色 ID、颜色节点、自定义配色及静态可读性 |
| `src/shared/dynamic-gradient.ts` | 动态混色的对比度界、完整线性渐变及循环关键帧 |
| `src/DynamicBackground.tsx` | 同步 WAAPI 时间轴、减少动态效果及生命周期 |
| `src/one-click-ai.ts` | 等待保存、取消、快照检查与旧结果丢弃 |
| `electron/storage.ts` | schema 2 JSON 校验、原子写入、上一有效版本 |
| `electron/migration.ts`、`rtf-fonts.ts` | 旧 macOS 数据与富文本迁移 |
| `electron/ai.ts` | 固定 HTTPS 请求、结构化结果、超时及安全错误 |
| `electron/ai-credentials.ts` | 异步系统加密存储及串行凭据操作 |
| `electron/main.ts` | IPC、窗口、托盘、系统菜单、登录项和导入导出 |

## 编辑与保存

Tiptap 文档包含标题及全局字号元数据，文字样式保存在文档节点中。拖动字号期间预览，松手提交一次历史事务。AI 应用将标题和新正文作为同一事务写入；撤销恢复原始标题、正文和格式。AI 新正文是纯文本，不保留任意原有局部样式。

React 窗口的保存队列按顺序调用主进程；主进程校验正文与文档一致，再写 `notes.json`，同时保留 `notes.previous.json`。窗口关闭和应用退出会请求渲染器 flush。系统菜单快速导入导出的现存边界见 [KNOWN_ISSUES.md](KNOWN_ISSUES.md)。

## 本机目录与迁移

- macOS：`~/Library/Application Support/MistNotesDesktop/`
- Windows：`%APPDATA%\MistNotesDesktop\`
- 自定义开发目录：`MIST_DATA_DIR`

首次 macOS 迁移从旧 `MistNotes` 数据目录复制，保留旧原件与迁移备份；两个版本随后各自保存。整包导入是合并而非覆盖，导入前保存快照。整包大小上限为 50 MB，包含便签与配色，不包含 API Key。

## 动态背景的可读性

每层是完整线性渐变，颜色来自原主题节点，使用 sRGB 插值和普通 source-over 合成。所有像素落在原节点的凸组合范围内，动态对比度计算对这个范围给出保守边界。必要时改变默认字色或加入统一阅读底层；该底层不随动画呼吸。

颜色轮换层共享 `startTime`。中间层只在被下一层完全遮盖时复位，最后一层回到底层，避免接缝跳色。时间轴依赖稳定内容签名，普通输入和保存不重启。默认文字的检查不覆盖用户任意粘贴的文字色。

## 可选 AI 边界

只有点击小球时发送当前标题、正文及整理指令。主进程取系统解密后的密钥，调用固定 DeepSeek HTTPS 端点；已保存密钥的明文不回传给渲染器；密码框在输入和提交新密钥期间暂时持有用户输入。响应必须符合预期 JSON 结构，处理截断、异常、取消和超时。输入快照改变后，不应用旧响应。提示词要求保留事实，但这不是事实正确性的机械保证。

## 遗留 Swift 实现

`Sources/`、`Tests/` 与根 `build.sh` 保留原生 AppKit 1.2 回退源码。它使用旧 schema 和独立数据目录，不是当前 Electron 的共享业务层。根脚本固定构建 ARM64/macOS 13+，不提供 Intel 通用构建。
