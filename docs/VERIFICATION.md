# 验证记录

日期：2026-10-26。对象：`2.1.0-beta.6` 的独立开源候选。所有者已确认 MIT + Public 和所列自有素材授权，远程仓库已创建并核实为 Public，发布账号拥有 ADMIN 权限：[fu379410-cell/mist-notes](https://github.com/fu379410-cell/mist-notes)。没有复制个人便签、真实凭据、旧机器报告或原目录的安装器进入源码候选。

## 本轮实际执行

| 检查 | 结果与范围 |
| --- | --- |
| 锁文件安装 | 在独立目录全新 `npm ci`，Node 24.16.0 / npm 11.13.0；473 个锁定依赖条目，不计根包 |
| 依赖规范化 | 显式声明 `@tiptap/pm`、`domhandler`、`@electron/asar`，既有锁定包版本未改变 |
| 自动测试 | `npm test`：59 通过，0 失败；包含本机 textutil 迁移转换，不需要 API Key |
| 类型与构建 | `npm run build` 通过；Vite 提示主 JS chunk 约 668 kB，尚未做分包优化 |
| 依赖审计 | npm 官方 registry 的 `npm audit --json` 返回 0 个已知漏洞；仅代表查询时的公告库结果 |
| 许可清单 | `licenses:generate` 与 `licenses:check` 通过；运行依赖文本保留，boolbase 漏带文本由官方固定来源补齐 |
| 核心源码 | 与规范化前本地版本比较，`client/src`、`electron`、`tests` 内容未变；改动集中在工程、文档及发布检查 |
| 实际运行 | macOS Apple Silicon 上从当前构建启动 Electron 窗口；仅使用隔离合成演示便签，无密钥、无 AI 请求 |
| 真实截图 | `docs/screenshots/macos-demo.png`；演示数据已清理，截图没有私人文字 |
| Mac 打包 | 本轮生成 arm64 unpacked app；ASAR、main/preload/renderer、品牌、架构与许可证资源静态检查通过，严格签名结果在本地审查材料中记录 |
| Swift 回退测试 | `zsh scripts/test-legacy.sh`：现有存储、窗口几何、字体格式三组测试均通过；临时文件已清理 |
| 工作流检查 | CI/release YAML 和内联脚本本地解析检查；Actions 固定官方 commit；未声称已在 GitHub 执行 |

源码、暂存区及全部本地可达 Git 历史通过 `npm run security:scan`。准备阶段的独立仓库没有旧提交，历史扫描数量为 0；这不等于扫描过原目录的备份或无关父仓库。新提交及其暂存内容由每次提交后、推送前的扫描复核。另用临时合成仓库验证了“暂存秘密但工作区已清理”、干净状态和“仅旧提交含秘密”三个扫描案例，全部符合预期，临时仓库已清理。首次提交后、推送前仍须重新扫描；远程 CI 也扫描全部已拉取的可达历史。扫描规则不替代人工审查。

## 证据边界

- 本轮没有在 Windows、Intel Mac 或 Linux 上运行客户端。CI 配置存在不代表远程 CI 已成功。
- 本轮只生成本机 arm64 unpacked app，不声称已重新验收四份公开安装器。发布工作流将按实际平台生成和检查。
- 先前私有迭代曾完成其他平台的构建/静态检查及隔离合成便签的真实 AI 请求；这些没有混算为当前 GitHub CI、实机或社区证据。
- 本轮没有正式发行签名、Apple 公证、自动更新、公开 Release、下载量或用户统计。
- 所有者已于 2026-10-26 确认 MIT + Public、六个运行图标和合成内容截图的授权范围；公开授权和实际仓库状态分别记录，CI 状态见 [Actions](https://github.com/fu379410-cell/mist-notes/actions)，没有将配置存在写成运行通过。

## 发布后必须补核

核对真实远程 URL、仓库可见性、README/文件清单、默认分支、首轮 CI、LICENSE/素材授权和实际 tag；再决定是否运行四包构建、创建 Draft Release。设备验收与公开草稿转正式 Release 分别记录。
