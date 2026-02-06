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

### 1) 监听配置

- `启用插件 / 监听地址 / 监听端口`：决定本插件监听在哪个地址

### 2) 路由（支持多组、互不影响）

插件通过请求路径（`path`）区分不同的 Komari 推送关系；每个路由都可以配置独立的：

- Komari Webhook 表单字段：`url * / method / content_type / headers / body / username / password`
- 校验：BasicAuth（可选）、headers/content_type/method
- 转发目标：QQ群/私聊用户
- 消息模板

Guoba 面板提供两种方式维护路由：

1) 直接编辑 `路由列表（JSON）`（无限条路由）

2) 使用 `路由操作` 执行：

- `新增`：填写“新增路由 ……”的一组字段后保存
- `删除`：填入要删除的 `id` 后保存

说明：

- 本插件不使用 secret/token（Komari 不支持）；仅支持 Basic Auth（username/password）
- `username/password` 留空会自动生成并持久化（用于 Basic Auth 校验）

> OneBot v11 连接方式通常无法像 icqq 一样获取“好友/群列表”，因此面板里的 QQ/群下拉可能没有数据；此时仍可直接在下拉框内输入纯数字 ID（支持输入并回车添加）。

示例配置（仅示例，请按你的实际端口/群号填写；`url` 不要带反引号/多余空格）：

```json
{
  "enable": true,
  "listenHost": "0.0.0.0",
  "listenPort": 26001,
  "routes": [
    {
      "id": "0001",
      "name": "通知1",
      "enable": true,
      "path": "/komari/webhook",
      "komari": {
        "url": "http://你的公网IP:26001/komari/webhook",
        "method": "POST",
        "content_type": "application/json",
        "headers": "",
        "body": "",
        "username": "komari_xxxxxx",
        "password": "xxxxxxxxxxxxxxxxxx"
      },
      "targets": {
        "groups": ["*********"],
        "users": []
      },
      "message": {
        "prefix": "[komari]",
        "template": "{prefix} {title}\n{message}"
      }
    }
  ],
  "security": {
    "maxBodyBytes": 1048576
  }
}
```

Komari 后台填写建议：

- `url`：填上面的完整地址（与 `listenHost/listenPort/path` 对应）
- `username/password`：需要与本插件路由里的 `komari.username/komari.password` 一致
- `body`：建议使用 JSON（见文末示例），便于生成标题/正文

### 3) 消息模板

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

    routes[].path: Webhook 路径（按路径命中路由）
    routes[].komari.*: Komari Webhook 表单对应字段与校验项
    routes[].targets.groups: 转发到的QQ群列表
    routes[].targets.users: 转发到的私聊用户列表

## 配置（手动改文件）

> [!WARNING]
>
> 非常不建议手动修改配置文件，本插件已兼容 Guoba-plugin ，请使用锅巴插件对配置项进行修改
>

配置文件：`config/config.json`

修改后可发送 `#komari重载` 让配置立即生效（仅主人可用）。

## 指令

- `#komari状态` / `#komari配置`：查看运行状态与当前配置摘要（非主人会打码敏感信息）
- `#komari重载`：重新加载配置并按需重启监听（仅主人可用）

## Komari Webhook body 示例

建议在 Komari 的 Webhook `body` 填 JSON（与默认配置一致），这样插件可以直接解析并转发：

```json
{"title":"{{title}}","message":"{{message}}"}
```

如果 Komari 发送的不是 JSON，插件会把请求体当作文本转发。

