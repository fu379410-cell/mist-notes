# 参与雾笺

感谢你愿意帮助改进雾笺。所有者已于 2026-10-26 确认采用 MIT 许可证。参与前请阅读根 [LICENSE](LICENSE) 和[素材说明](docs/ASSETS_AND_LICENSES.md)，只提交你有权按项目许可贡献的内容。

## 开始开发

使用 Node.js 24.x，在 `client/` 执行 `npm ci`。建议设置独立的 `MIST_DATA_DIR` 并设置 `MIST_SKIP_MIGRATION=1`，避免读取自己的日常便签。执行 `npm run dev` 启动界面，退出应用后再清理测试数据。

提交前在 `client/` 执行：

```sh
npm test
npm run build
npm run licenses:check
npm run security:scan
```

修改依赖后使用固定版本并保留锁文件，运行 `npm run licenses:generate` 更新第三方记录。测试使用合成文字和模拟请求，不要提交真实密钥或私人备忘录。

## Issue 与 PR

- Bug 报告提供版本、系统与架构、最小复现步骤、预期和实际结果。日志和截图先脱敏。
- PR 只解决一个明确问题，解释行为变化与验证方式；不要混入无关格式化或重写。
- 编辑历史、迁移、持久化、IPC 或 AI 结果应用变化应有相称的回归测试。小幅文案或样式变化说明人工检查即可。
- 字体、素材或代码来自第三方时，记录来源和许可证；不要复制缺少授权条件的资产。
- 安全问题按 [SECURITY.md](SECURITY.md) 处理，不要公开密钥、私人便签或可利用细节。

GitHub Actions 的绿色状态仅证明其执行的检查，不代替 Windows/Intel 实机操作验收。维护者会按可复现性和用户影响安排工作，目前没有承诺固定响应时间。
