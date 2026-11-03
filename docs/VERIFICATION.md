# 验证记录

## 2026-11-03：2.1.0-beta.7 胶囊升级，本地候选

- `npm test`：68 项通过（新增 9 项胶囊几何、碰撞及独立布局存储测试）；类型检查、构建、473 项锁定依赖许可核对通过。
- macOS Apple Silicon，隔离合成数据：通过原生界面实际拖动收起、点击胶囊/预览展开，检查中文与 Emoji 编辑后的撤销；通过应用 IPC 与窗口 API 验证四边收纳、预览包含原胶囊区域、只读权限、原文与编辑文档保持、多胶囊错位、关闭开关展开全部、胶囊渲染器崩溃恢复、退出重开保持底边位置与文档。原生手动交互与 API 验证分开记录，未将 API 调用称为实际悬停手势验证。
- 生成 arm64 DMG 及 unpacked app；ASAR 内主进程、preload、renderer 与当前源码构建一致，架构、品牌和五份许可资源校验通过；ad-hoc 严格签名验证通过，未进行 Apple 公证。
- 本机安装至用户 Applications 目录并启动新版。升级前正常退出旧客户端、保留旧副本并复制应用数据备份；启动后对比便签完整 JSON 和加密凭据文件，均保持不变。私人数据及路径不进入公开验证材料。
- 仅完成本机 Mac arm64 验收。Windows、Intel Mac、真实多屏拔插和混合缩放比例仍待实机验证；安装包未公开发布。源码更新及三平台 CI 的实际执行状态见仓库 [GitHub Actions](https://github.com/fu379410-cell/mist-notes/actions)。
- 原生系统菜单导入导出的已知保存队列边界仍按 [KNOWN_ISSUES.md](KNOWN_ISSUES.md) 记录；胶囊收起自身会等待当前编辑器的保存队列。
- GitHub 同步期间按新公告更新两项开发传递依赖补丁（`follow-redirects` 1.16.2、`joi` 18.3.1），从锁文件重新 `npm ci` 后，68 项测试、构建和许可核对通过；另以本机合成 HTTP 服务验证 `wait-on` 就绪与超时两条路径。官方 registry 审计结果为 0 critical、0 high、15 moderate；剩余记录及上游公告见 [KNOWN_ISSUES.md](KNOWN_ISSUES.md)。

以下保留此前 beta.6 开源准备的历史记录。

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

## 首次源码发布核验

2026-10-26 已通过 GitHub API 核实仓库 `fu379410-cell/mist-notes` 为 Public、MIT，默认分支为 `main`，发布账号拥有 ADMIN 权限。首次源码发布的提交 `5449b7ad234589a5d6437c408c0446351ee23901` 包含 98 个文件，逐个 Git blob SHA 与本地提交一致；README、英文说明、LICENSE、申请文档及合成截图另做字节比对。

提交后的安全扫描覆盖 2 个可达提交和 99 个历史 blob，无发现；没有发布个人便签、密钥、旧备份或安装器。上述提交标识用于固定该次核验，后续文档提交和 CI 以 [Actions](https://github.com/fu379410-cell/mist-notes/actions) 的实际记录为准，本文没有预先宣布 CI 通过。

## 发布后必须补核

核对真实远程 URL、仓库可见性、README/文件清单、默认分支、首轮 CI、LICENSE/素材授权和实际 tag；再决定是否运行四包构建、创建 Draft Release。设备验收与公开草稿转正式 Release 分别记录。
