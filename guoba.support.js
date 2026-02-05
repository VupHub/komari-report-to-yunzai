import { normalizeConfig, normalizeTargets, readConfig, updateConfig } from './utils/config.js'
import { ensureKomariWebhookServer } from './utils/server.js'

const server = ensureKomariWebhookServer()

function toCommaSeparated(list) {
  return (Array.isArray(list) ? list : []).join(',')
}

function fromCommaSeparated(input) {
  return normalizeTargets(
    String(input ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  )
}

export default function supportGuoba() {
  return {
    pluginInfo: {
      name: 'komari-report-to-yunzai',
      title: 'Komari Webhook 转发',
      author: 'Trae',
      authorLink: '',
      link: '',
      isV3: true,
      isV2: false,
      description: '接收 Komari Webhook 并转发到QQ群/私聊'
    },
    configInfo: {
      schemas: [
        {
          field: 'komari.url',
          label: 'Komari Webhook: url *',
          component: 'Input',
          placeholder: 'http://你的服务器IP:25888/komari/webhook'
        },
        {
          field: 'komari.method',
          label: 'Komari Webhook: method',
          component: 'Input',
          placeholder: 'POST'
        },
        {
          field: 'komari.content_type',
          label: 'Komari Webhook: content_type',
          component: 'Input',
          placeholder: 'application/json'
        },
        {
          field: 'komari.headers',
          label: 'Komari Webhook: headers (JSON)',
          component: 'Textarea',
          placeholder: '{"x-komari-token":"xxx"}'
        },
        {
          field: 'komari.body',
          label: 'Komari Webhook: body',
          component: 'Textarea',
          placeholder: '{"title":"{{title}}","message":"{{message}}"}'
        },
        {
          field: 'komari.username',
          label: 'Komari Webhook: username',
          component: 'Input',
          placeholder: '留空则不启用 Basic Auth 校验'
        },
        {
          field: 'komari.password',
          label: 'Komari Webhook: password',
          component: 'Input',
          placeholder: '留空则不启用 Basic Auth 校验'
        },
        {
          field: 'enable',
          label: '启用插件',
          component: 'Switch'
        },
        {
          field: 'listenHost',
          label: '监听地址',
          component: 'Input',
          placeholder: '0.0.0.0'
        },
        {
          field: 'listenPort',
          label: '监听端口',
          component: 'InputNumber',
          placeholder: 25888
        },
        {
          field: 'path',
          label: 'Webhook 路径',
          component: 'Input',
          placeholder: '/komari/webhook'
        },
        {
          field: 'secret',
          label: '鉴权 Token',
          component: 'Input',
          placeholder: '留空则不鉴权'
        },
        {
          field: 'targets.groups',
          label: '通知QQ群',
          component: 'Input',
          placeholder: '多个群号用逗号分隔，如：123,456'
        },
        {
          field: 'targets.users',
          label: '通知私聊用户',
          component: 'Input',
          placeholder: '多个QQ号用逗号分隔，如：123,456'
        },
        {
          field: 'message.prefix',
          label: '消息前缀',
          component: 'Input',
          placeholder: '[Komari]'
        },
        {
          field: 'message.template',
          label: '消息模板',
          component: 'Textarea',
          placeholder: '{prefix} {title}\\n{message}'
        }
      ],
      getConfigData() {
        const cfg = normalizeConfig(readConfig())
        return {
          komari: cfg.komari,
          enable: cfg.enable,
          listenHost: cfg.listenHost,
          listenPort: cfg.listenPort,
          path: cfg.path,
          secret: cfg.secret,
          targets: {
            groups: toCommaSeparated(cfg.targets.groups),
            users: toCommaSeparated(cfg.targets.users)
          },
          message: cfg.message,
          security: cfg.security
        }
      },
      async setConfigData(data) {
        const next = {
          komari: {
            url: data?.komari?.url,
            method: data?.komari?.method,
            content_type: data?.komari?.content_type,
            headers: data?.komari?.headers,
            body: data?.komari?.body,
            username: data?.komari?.username,
            password: data?.komari?.password
          },
          enable: Boolean(data.enable),
          listenHost: data.listenHost,
          listenPort: data.listenPort,
          path: data.path,
          secret: data.secret,
          targets: {
            groups: fromCommaSeparated(data?.targets?.groups),
            users: fromCommaSeparated(data?.targets?.users)
          },
          message: {
            prefix: data?.message?.prefix,
            template: data?.message?.template
          }
        }
        updateConfig(next)
        await server.refresh()
        return true
      }
    }
  }
}

