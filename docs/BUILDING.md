# 开发、构建与发布

## 环境与本地运行

使用 Node.js 24.x（根 `.nvmrc`）、npm、Git。macOS 需要 Xcode Command Line Tools；Swift 回退源码也需要 macOS 工具链。锁文件必须提交，安装使用 `npm ci`。

```sh
cd client
npm ci
npm test
npm run licenses:check
npm run security:scan
npm run build
MIST_DATA_DIR=/tmp/mist-notes-dev MIST_SKIP_MIGRATION=1 npm start
```

开发热更新使用 `npm run dev`。Windows PowerShell 的环境变量设置见根 README。`MIST_DEV_URL` 由开发脚本设置，不用于正式包。主进程不自动载入 `.env`；API Key 从应用内密码框配置，不使用前端环境变量。

若网络环境或安装策略跳过 Electron 二进制下载，先检查错误和 `node_modules/electron/path.txt`；可显式执行官方包的安装入口 `node node_modules/electron/install.js`，再启动。不要为此修改全局 npm 安全设置，也不要复制来历不明的 Electron 可执行文件。

## 维护许可记录

```sh
npm run licenses:generate
npm run licenses:check
```

生成器读取锁文件和已安装运行依赖的原始许可证。`boolbase@1.0.0` 的 npm 归档漏带独立许可文本，审核过的官方上游固定版本保存在 `scripts/upstream-licenses/`，并有来源及校验记录。新增缺少许可文本的包会报错，需人工核对，不能静默跳过。

## 安装包

```sh
# 在 macOS 的 client/ 内
npm run package:mac
node scripts/verify-built-app.mjs --app 'release/mac-arm64/雾笺.app' --arch arm64
node scripts/verify-built-app.mjs --app 'release/mac/雾笺.app' --arch x64
```

```powershell
# 在 Windows 的 client/ 内
npm run package:windows
node scripts/verify-built-app.mjs --app release/win-unpacked --arch x64
```

输出在 `client/release/`，不进入源码 Git。Mac 生成 arm64、x64 DMG；Windows 生成 x64 NSIS 安装版和免安装版。当前配置是测试签名：macOS ad-hoc、Windows 无正式签名，未配置 Apple 公证或在线自动更新。静态检查不能代替安装、卸载、输入法、多屏、缩放和自启动实机验收。

`verify-built-app.mjs` 校验 ASAR 对应当前 main/preload/renderer、版本、品牌资源、敏感路径与可执行架构。`verify-release.mjs` 是需要 macOS 工具与 7zip 的高级完整四包检查，不是通用 CI 入口。它默认不读取任何私人便签；可选 `MISTNOTES_PRIVATE_ID_FILE` 只接受主动提供的合成哨兵 ID JSON 数组，用于检查测试数据没有被打包。

## GitHub 自动化

- `ci.yml`：push main、PR 或手动运行，Node 24 的 macOS/Windows/Linux 矩阵；测试、许可清单、构建、安全扫描。权限为只读，拉取全部可达历史。
- `release.yml`：`v*` 标签或手动运行，测试后构建四份包，始终 `--publish never`，默认只上传 Actions artifacts。
- 只有手动勾选 `publish_draft` 且给出已有、与 package 版本一致的标签，才创建 **Draft Release**。这一步校验根 LICENSE、package 许可、标签源提交和四包 SHA-256。
- 草稿公开需维护者在核对授权和实机状态后单独操作；工作流不自动将草稿转公开。

所有外部 Actions 固定为官方仓库完整 commit SHA。发布作业单独申请 `contents: write`，构建作业不使用服务商 AI Key。尚未发布的候选不能把本地语法检查称为 GitHub CI 已通过。

正式签名配置模板是 `client/electron-builder.release.example.yml`；证书、密码和公证凭据只能使用系统钥匙串或安全 CI 配置，不提交源文件。不要为了通过构建绕过许可证或泄露真实笔记进行验证。

## Swift 1.2 回退源码

在 macOS/Apple Silicon 的项目根执行 `./build.sh`。它仅在 `build/雾笺.app` 构建 ARM64 应用，不安装、不注册登录项，也不启动。

执行 `zsh scripts/test-legacy.sh` 会编译并运行现有存储、窗口几何和字体格式测试，使用临时目录并在结束后清理。该历史实现没有 Swift Package，不使用 `swift test`。
