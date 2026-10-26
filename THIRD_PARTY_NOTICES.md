# Third-party notices

项目自有内容已由所有者于 2026-10-26 确认采用 MIT 许可证，见根 [LICENSE](LICENSE)。该许可不会替换第三方依赖的许可或告示要求。

- 全部锁定包的版本、SPDX 许可与开发/可选标记见 [dependency-licenses.json](docs/dependency-licenses.json)。
- 运行依赖的原始许可及告示文本见 [THIRD_PARTY_LICENSES.txt](THIRD_PARTY_LICENSES.txt)。
- Electron 发行包自带 `LICENSE` 和 `LICENSES.chromium.html`；重新分发安装包必须保留这些上游文件。
- Lightning CSS 及其平台可选包使用 MPL-2.0，位于开发工具链；不能把它们描述为项目自己的 MIT 代码。
- `boolbase@1.0.0` 的 npm 包声明 ISC，却未附独立许可证文件；本仓库从其官方上游固定提交保留对应许可，来源和校验值见 `client/scripts/upstream-license-overrides.json`。
- 当前未打包字体程序。历史 PingFang 转轮廓字标和相关组合图没有纳入候选，详见 [素材说明](docs/ASSETS_AND_LICENSES.md)。

更新依赖后，在 `client/` 运行 `npm run licenses:generate`，审查差异，再运行 `npm run licenses:check`。此清单是可核对的工程记录，不代替对新增代码和资产来源的审核。
