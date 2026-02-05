# komari-report-to-yunzai

将 Komari 的 Webhook 通知转发到 TRSS-Yunzai 的指定 QQ 群 / 私聊用户，并支持在 Guoba 面板中可视化配置。

## 功能

- 接收 Komari Webhook 请求
- 将通知内容转发到：
  - 指定 QQ 群（多个群号）
  - 指定私聊用户（多个 QQ 号）
- 支持在 Guoba 面板修改配置并立即生效（无需手动改文件）
- 支持对 Komari Webhook 请求进行校验：
  - method
  - content_type
  - headers（JSON）
  - Basic Auth（username/password）
  - Token（可选，使用 `token` query 或 `x-komari-token` / `x-webhook-token` header）

## 安装

### 安装插件

1. 克隆仓库

Github

```bash
git clone https://github.com/VupHub/komari-report-to-yunzai.git ./plugins/komari-report-to-yunzai
```

CNB

```bash
git clone https://cnb.cool/VupHub/komari-report-to-yunzai.git ./plugins/komari-report-to-yunzai
```

2. 安装依赖

如果你的云崽使用 pnpm 安装依赖：

```bash
pnpm install --filter=komari-report-to-yunzai
```

3. 重启 TRSS-Yunzai

## 配置（推荐：Guoba 面板）

> [!WARNING]
>
> 非常不建议手动修改配置文件，本插件已兼容 Guoba-plugin ，请使用锅巴插件对配置项进行修改

1. 安装并启动 Guoba 插件后，在插件配置里找到「Komari Webhook 转发」。
2. 在面板内配置以下内容：

### 1) Komari Webhook（需要在 Komari 后台填写）

以下字段与 Komari 的 Webhook 表单一一对应：

- `url *`
- `method`
- `content_type`
- `headers`（JSON 格式）
- `body`
- `username`
- `password`

说明：

- `url`：填写本插件监听地址（面板里会给出默认值）
- `headers/body`：这里主要用于“保存一份你在 Komari 里填写的内容”，同时插件也会按这些设置进行请求校验（例如要求某些 headers 必须存在且值匹配）

### 2) 监听与鉴权（插件侧）

- `监听地址 / 监听端口 / Webhook 路径`：决定本插件实际监听在哪个地址
- `鉴权 Token`（可选）：
  - Komari 请求 URL 携带：`?token=xxx`
  - 或请求头携带：`x-komari-token: xxx` / `x-webhook-token: xxx`

### 3) 转发目标

- `通知QQ群`：多个群号用英文逗号分隔
- `通知私聊用户`：多个 QQ 号用英文逗号分隔

### 4) 消息模板

模板变量：

- `{prefix}`：消息前缀
- `{title}`：标题（优先取 `payload.title`，其次 `event/type`）
- `{message}`：正文（优先取 `payload.message`，其次 `text/content`，都没有则转 JSON）

默认模板：

```
{prefix} {title}
{message}
```

配置项说明（常用）：

    komari.url: Komari Webhook 的 url（*必填，通常填本插件监听地址）
    komari.method: Komari Webhook 的 method（默认 POST）
    komari.content_type: Komari Webhook 的 content_type（默认 application/json）
    komari.headers: Komari Webhook 的 headers（HTTP headers in JSON format）
    komari.body: Komari Webhook 的 body（建议填 JSON，便于解析）
    komari.username: Komari Webhook 的 username（用于 Basic Auth 校验）
    komari.password: Komari Webhook 的 password（用于 Basic Auth 校验）
    targets.groups: 转发到的QQ群列表（多个用逗号分隔）
    targets.users: 转发到的私聊用户列表（多个用逗号分隔）

## 配置（手动改文件）

> [!WARNING]
>
> 非常不建议手动修改配置文件，本插件已兼容 Guoba-plugin ，请使用锅巴插件对配置项进行修改
>

配置文件：`config/config.json`

修改后可发送 `#komari重载` 让配置立即生效（仅主人可用）。

## 指令

仅主人可用：

- `#komari状态` / `#komari配置`：查看运行状态与当前配置摘要
- `#komari重载`：重新加载配置并按需重启监听

## Komari Webhook body 示例

建议在 Komari 的 Webhook `body` 填 JSON（与默认配置一致），这样插件可以直接解析并转发：

```json
{"title":"{{title}}","message":"{{message}}"}
```

如果 Komari 发送的不是 JSON，插件会把请求体当作文本转发。

