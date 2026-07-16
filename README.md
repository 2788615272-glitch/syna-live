<div align="center">
  <img src="website/assets/syna-normal.png" width="230" alt="Syna">
  <h1>Syna Live</h1>
  <p><strong>自定义形象、人设和声音的本地陪伴直播 AI</strong></p>
  <p>
    <a href="https://2788615272-glitch.github.io/syna-live/">在线角色工坊</a> ·
    <a href="https://github.com/2788615272-glitch/syna-live/releases/latest">下载 Windows 版</a> ·
    <a href="README.en.md">English</a>
  </p>
  <p>
    <img alt="License" src="https://img.shields.io/github/license/2788615272-glitch/syna-live">
    <img alt="Release" src="https://img.shields.io/github/v/release/2788615272-glitch/syna-live">
    <img alt="CI" src="https://github.com/2788615272-glitch/syna-live/actions/workflows/ci.yml/badge.svg">
    <img alt="Windows" src="https://img.shields.io/badge/platform-Windows-4d9fef">
  </p>
</div>

Syna Live 让用户把一张角色立绘、一段人设和自己的模型 Key，组合成真正能聊天、说话、接收直播弹幕并出现在 OBS 舞台里的 AI 角色。

项目默认附带可自由使用的 Syna 立绘与人设，下载后就能看到完整效果；也可以全部换成自己的角色。应用本地优先、无账号系统、无遥测，不需要租服务器。

![Syna Live 控制台](docs/control-panel.png)

## 核心能力

| 能力 | 当前支持 |
|---|---|
| 自定义角色 | 名字、用户称呼、关系、性格、表达方式、相处边界 |
| 自定义形象 | 六种可重命名表情立绘、说话立绘、缩放和 OBS 透明舞台 |
| AI 对话 | 流式回复、首段提前朗读、火山方舟及其他 OpenAI 兼容模型 |
| 桌面陪伴 | 透明悬浮立绘、胸口聊天框、打字/按下说话/自动聆听 |
| 桌面视觉 | 可选观察主屏幕、形成对话上下文，并对高显著度变化主动反应 |
| 语音模型 | 独立 ASR/TTS 凭据，支持 OpenAI Audio 兼容接口与火山原生语音协议 |
| 直播互动 | B 站弹幕监听、角色自动回应、字幕同步 |
| 本地记忆 | 可控消息数量与长期笔记，随时清除 |
| 隐私保护 | 系统加密保存 Key，诊断脱敏，无项目方后端 |

## 在线角色工坊

访问 [Syna Live 在线演示](https://2788615272-glitch.github.io/syna-live/)：

- 修改角色名、关系和核心人设；
- 上传自己的 PNG、JPEG 或 WebP 立绘；
- 切换 Syna 的平静、眨眼、生气、疑惑、观察和无语表情；
- 输入台词并即时查看舞台效果。

在线演示不会上传或保存用户选择的图片。

## 下载安装

Windows 用户可从 [GitHub Releases](https://github.com/2788615272-glitch/syna-live/releases/latest) 下载：

- `SynaLive-Setup-*.exe`：安装版；
- `SynaLive-Portable-*.exe`：免安装版。

首次启动：

1. 打开“模型连接”，选择供应商；
2. 填写模型 ID 和 API Key，点击“测试连接”；
3. 在“角色人设”中切换、重命名或替换六种表情立绘，模型会按表情名自动选择；
4. 点击“弹出桌面陪伴立绘”，选择打字、按下说话或自动聆听；
5. 可在“语音”中继续使用免费本机模式，或配置独立 ASR/TTS 模型；
6. 可选在“视觉”中启动主屏幕观察；画面只发送给你配置的模型接口；
7. 在“直播”中复制舞台地址，添加为 OBS 浏览器源；
8. 可选填写 B 站房间号并开启弹幕自动回复。

回复会边生成边显示，第一段可朗读内容会提前送入 TTS。用户开始说话时，当前朗读与同一回复剩余语音会立即停止。

## 模型供应商

| 供应商 | 用途 | 官方入口 |
|---|---|---|
| 火山方舟 / Doubao | 默认推荐 | [获取 API Key](https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey) · [模型文档](https://www.volcengine.com/docs/82379/1263482) |
| OpenAI | OpenAI 兼容接口 | [获取 API Key](https://platform.openai.com/api-keys) |
| DeepSeek | OpenAI 兼容接口 | [获取 API Key](https://platform.deepseek.com/api_keys) |
| Moonshot / Kimi | OpenAI 兼容接口 | [获取 API Key](https://platform.moonshot.cn/console/api-keys) |
| 自定义 | 任意兼容服务 | 在应用中填写接口地址和模型 ID |

模型费用由供应商直接向用户收取。Syna Live 不代理、不转售模型调用，也不会读取用户保存的 Key。

火山语音用户可在“语音”页面直接选择“火山引擎语音合成”和“火山大模型 ASR”，填写 AppID、Access Token、Cluster、音色 ID 与 ASR Resource ID。Access Token 仅加密保存在本机。

## 隐私设计

以下内容只保存在用户自己的应用数据目录：

- API Key 的系统加密密文；
- 角色人设和直播配置；
- 对话记忆与长期笔记；
- 用户上传的角色图片。

仓库不会收集分析数据。诊断导出不包含 Key、Cookie、本机路径、用户名、提示词、聊天内容或上传文件。详见 [PRIVACY.md](PRIVACY.md) 与 [SECURITY.md](SECURITY.md)。

## 从源码运行

需要 Node.js 20 或更高版本：

```bash
npm install
npm start
```

开发模式：

```bash
npm run start:web
npm test
npm run check
```

Windows 打包：

```bash
npm run dist:win
```

## 项目结构

```text
src/runtime/     角色运行时、模型与直播适配器
src/server/      仅监听本机的安全控制服务
web/             Electron 控制台与 OBS 舞台
website/         GitHub Pages 官网和角色工坊
test/            隐私、配置、运行时和服务测试
.github/         CI、Pages 与 Windows Release 工作流
```

架构说明见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)，发布流程见 [docs/RELEASING.md](docs/RELEASING.md)。

## 许可证

- 程序代码：MIT；
- 仓库附带的 Syna 立绘：CC0，可自由使用、修改、再发布或商用，无需署名；
- 用户上传的素材：权利仍归各自所有者。

详见 [ASSET_LICENSE.md](ASSET_LICENSE.md) 与 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
