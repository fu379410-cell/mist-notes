# 代码与素材授权清单

## 当前状态

项目所有者已于 2026-10-26 明确确认 MIT + Public，并确认有权授权审查清单中的自有代码、六个运行图标和合成内容截图。当前候选按根 [LICENSE](../LICENSE) 的 MIT 条款提供项目自有内容，版权告示为 `Copyright (c) 2026 Mist Notes contributors`。远程仓库已建立并核实为 Public：[fu379410-cell/mist-notes](https://github.com/fu379410-cell/mist-notes)。

## 代码与依赖

当前主客户端及遗留 Swift 源码来自本项目的本地开发记录。所有者在审查清单基础上确认了相关自有代码与素材的授权权利，并选择 MIT；没有将未确认的第三方内容通过整体许可证纳入。

- [MIT 官方许可说明](https://opensource.org/license/mit)：文本简洁，要求保留版权和许可告示。

依赖保留独立许可；见 [第三方告示](../THIRD_PARTY_NOTICES.md)，不将开发链 MPL-2.0 或 Electron/Chromium 许可改标为项目自己的许可。

## 已批准公开的六个运行资产

| 文件 | 来源与用途 | 公开状态 |
| --- | --- | --- |
| `client/resources/icon.png` | 本项目 image_gen 满版玻璃图标输出的缩放版 | 已确认 MIT |
| `client/resources/icon.icns` | 上述图标的 macOS 多尺寸封装 | 已确认 MIT |
| `client/resources/icon.ico` | 上述图标的 Windows 多尺寸封装 | 已确认 MIT |
| `client/resources/brand-mark.png` | 本项目 image_gen 透明顶栏雾带 | 已确认 MIT |
| `client/resources/trayTemplate.png` | 项目内单色雾带矢量适配，18 px | 已确认 MIT |
| `client/resources/trayTemplate@2x.png` | 同一模板的 36 px 版本 | 已确认 MIT |

本地生成记录已核对；公开候选只保留去标识的来源摘要与 [逐文件 SHA-256](asset-provenance.json)，不包含机器原图目录或完整会话记录。上述运行文件不含 PingFang 转轮廓字标。

[OpenAI 条款](https://openai.com/policies/terms-of-use/)中关于 Output 的权利安排发生在用户与 OpenAI 之间，不保证输出独一无二，也不替代第三方输入、字体或商标核对。本项目所有者已确认上述清单的公开授权；第三方标识和系统界面元素仍保留各自权利。

## 暂不公开

历史 `mist-notes-wordmark.svg/.png`、logo lockup 及相关预览使用 `PingFangSC-Semibold` 的轮廓。现有记录不足以确认将可编辑轮廓随开源许可广泛分发的条件，因此没有纳入候选；这不是认定其日常 Logo 使用违法。候选也没有 `.ttf/.otf/.ttc/.woff` 字体程序。

其他历史草稿、重复尺寸预览、品牌构建脚本的机器专用依赖路径、个人备份和旧验证报告均留在原本地目录，不作删除，也不作公开。以后如需公开字标，可先使用明确开放许可的字体重新制作，并保留其许可文本。
