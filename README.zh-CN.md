# Syna Live

[English](README.md)

Syna Live 是一个本地优先、可自定义形象与人设的陪伴直播 AI。用户可以替换角色立绘、名字、关系、性格、模型、语音、记忆与直播设置，不需要修改代码。

默认 Syna 角色可直接使用，并以 CC0 开放。应用没有账号系统、统计 SDK 或项目方托管的后端。

![Syna Live 控制台](docs/control-panel.png)

## 主要能力

- 编辑角色名、用户称呼、关系、性格、表达方式与相处边界
- 上传静态和说话立绘，生成 OBS 透明舞台
- 连接火山方舟及其他 OpenAI 兼容模型
- 本地对话记忆与可选长期笔记
- 系统语音朗读与环境支持时的语音输入
- 可选 B 站弹幕连接和角色自动回复
- 使用 Electron `safeStorage` 加密模型 Key
- 无遥测，诊断信息自动脱敏

## 下载与运行

Windows 用户可从 [GitHub Releases](../../releases/latest) 下载安装版或免安装版。

从源码运行需要 Node.js 20 或更高版本：

```bash
npm install
npm start
```

首次启动后，在“模型连接”中选择供应商，填写模型 ID 和 API Key，并点击“测试连接”。随后可直接聊天，或在“直播”页面复制 OBS 舞台地址。

## 隐私

角色配置、记忆、立绘和加密凭据保存在每个用户自己的应用数据目录，不进入安装目录或源码仓库。模型消息只发送给用户选择的模型供应商。

项目不会代理或转售模型调用。API Key 和供应商账单由用户自己管理。更多说明见 [PRIVACY.md](PRIVACY.md)。

## 开发与发布

```bash
npm test
npm run check
npm run dist:win
```

代码使用 MIT 许可证，默认 Syna 立绘使用 CC0。详见 [ASSET_LICENSE.md](ASSET_LICENSE.md)。
