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

export function supportGuoba() {
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
          field: 'komari_url',
          label: 'Komari Webhook: url *',
          component: 'Input',
          placeholder: 'http://你的服务器IP:25888/komari/webhook'
        },
        {
          field: 'komari_method',
          label: 'Komari Webhook: method',
          component: 'Input',
          placeholder: 'POST'
        },
        {
          field: 'komari_content_type',
          label: 'Komari Webhook: content_type',
          component: 'Input',
          placeholder: 'application/json'
        },
        {
          field: 'komari_headers',
          label: 'Komari Webhook: headers (JSON)',
          component: 'Input',
          componentProps: { type: 'textarea', autosize: { minRows: 2, maxRows: 6 } },
          placeholder: '{"x-komari-token":"xxx"}'
        },
        {
          field: 'komari_body',
          label: 'Komari Webhook: body',
          component: 'Input',
          componentProps: { type: 'textarea', autosize: { minRows: 2, maxRows: 8 } },
          placeholder: '{"title":"{{title}}","message":"{{message}}"}'
        },
        {
          field: 'komari_username',
          label: 'Komari Webhook: username',
          component: 'Input',
          placeholder: '留空则不启用 Basic Auth 校验'
        },
        {
          field: 'komari_password',
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
          field: 'targets_groups',
          label: '通知QQ群',
          component: 'Input',
          placeholder: '多个群号用逗号分隔，如：123,456'
        },
        {
          field: 'targets_users',
          label: '通知私聊用户',
          component: 'Input',
          placeholder: '多个QQ号用逗号分隔，如：123,456'
        },
        {
          field: 'message_prefix',
          label: '消息前缀',
          component: 'Input',
          placeholder: '[Komari]'
        },
        {
          field: 'message_template',
          label: '消息模板',
          component: 'Input',
          componentProps: { type: 'textarea', autosize: { minRows: 2, maxRows: 6 } },
          placeholder: '{prefix} {title}\\n{message}'
        }
      ],
      getConfigData() {
        const cfg = normalizeConfig(readConfig())
        return {
          komari_url: cfg.komari.url,
          komari_method: cfg.komari.method,
          komari_content_type: cfg.komari.content_type,
          komari_headers: cfg.komari.headers,
          komari_body: cfg.komari.body,
          komari_username: cfg.komari.username,
          komari_password: cfg.komari.password,
          enable: cfg.enable,
          listenHost: cfg.listenHost,
          listenPort: cfg.listenPort,
          path: cfg.path,
          secret: cfg.secret,
          targets_groups: toCommaSeparated(cfg.targets.groups),
          targets_users: toCommaSeparated(cfg.targets.users),
          message_prefix: cfg.message.prefix,
          message_template: cfg.message.template
        }
      },
      async setConfigData(data) {
        const next = {
          komari: {
            url: data?.komari_url,
            method: data?.komari_method,
            content_type: data?.komari_content_type,
            headers: data?.komari_headers,
            body: data?.komari_body,
            username: data?.komari_username,
            password: data?.komari_password
          },
          enable: Boolean(data.enable),
          listenHost: data.listenHost,
          listenPort: data.listenPort,
          path: data.path,
          secret: data.secret,
          targets: {
            groups: fromCommaSeparated(data?.targets_groups),
            users: fromCommaSeparated(data?.targets_users)
          },
          message: {
            prefix: data?.message_prefix,
            template: data?.message_template
          }
        }
        updateConfig(next)
        await server.refresh()
        return true
      }
    }
  }
}

export default supportGuoba

