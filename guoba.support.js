import { normalizeConfig, normalizeTargets, readConfig, updateConfig } from './utils/config.js'
import { ensureKomariWebhookServer } from './utils/server.js'

const server = ensureKomariWebhookServer()

function normalizeTargetsFromGuobaInput(input) {
  if (Array.isArray(input)) return normalizeTargets(input)
  return normalizeTargets(
    String(input ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  )
}

function resolveBots() {
  const b = globalThis.Bot
  if (!b) return []
  if (typeof b === 'object' && (b.uin || b.gl || b.fl)) return [b]
  if (Array.isArray(b)) return b.filter(Boolean)
  if (typeof b === 'object') return Object.values(b).filter(Boolean)
  return []
}

function uniqOptions(options) {
  const seen = new Set()
  const result = []
  for (const o of Array.isArray(options) ? options : []) {
    const value = String(o?.value ?? '')
    if (!value || seen.has(value)) continue
    seen.add(value)
    result.push({ label: String(o?.label ?? value), value })
  }
  return result
}

function ensureOptionValues(options, values) {
  const base = uniqOptions(options)
  const set = new Set(base.map((o) => o.value))
  for (const v of Array.isArray(values) ? values : []) {
    const value = String(v ?? '').trim()
    if (!value || set.has(value)) continue
    set.add(value)
    base.push({ label: value, value })
  }
  return base
}

function getGroupOptionsFromBots(bots) {
  const options = []
  for (const bot of bots) {
    const gl = bot?.gl
    if (gl && typeof gl.forEach === 'function') {
      gl.forEach((info, id) => {
        const gid = String(id ?? '').trim()
        if (!gid) return
        const name = info?.group_name ?? info?.groupName ?? info?.name ?? ''
        options.push({ label: name ? `${name} (${gid})` : gid, value: gid })
      })
      continue
    }
    if (gl && typeof gl === 'object') {
      for (const [id, info] of Object.entries(gl)) {
        const gid = String(id ?? '').trim()
        if (!gid) continue
        const name = info?.group_name ?? info?.groupName ?? info?.name ?? ''
        options.push({ label: name ? `${name} (${gid})` : gid, value: gid })
      }
    }
  }
  return uniqOptions(options).sort((a, b) => a.label.localeCompare(b.label, 'zh-Hans-CN'))
}

function getFriendOptionsFromBots(bots) {
  const options = []
  for (const bot of bots) {
    const fl = bot?.fl
    if (fl && typeof fl.forEach === 'function') {
      fl.forEach((info, id) => {
        const uid = String(id ?? '').trim()
        if (!uid) return
        const name = info?.remark ?? info?.nickname ?? info?.nick ?? info?.name ?? ''
        options.push({ label: name ? `${name} (${uid})` : uid, value: uid })
      })
      continue
    }
    if (fl && typeof fl === 'object') {
      for (const [id, info] of Object.entries(fl)) {
        const uid = String(id ?? '').trim()
        if (!uid) continue
        const name = info?.remark ?? info?.nickname ?? info?.nick ?? info?.name ?? ''
        options.push({ label: name ? `${name} (${uid})` : uid, value: uid })
      }
    }
  }
  return uniqOptions(options).sort((a, b) => a.label.localeCompare(b.label, 'zh-Hans-CN'))
}

export function supportGuoba() {
  const cfg = normalizeConfig(readConfig())
  const bots = resolveBots()
  const groupOptions = ensureOptionValues(getGroupOptionsFromBots(bots), cfg.targets.groups)
  const userOptions = ensureOptionValues(getFriendOptionsFromBots(bots), cfg.targets.users)
  const selectFilterable = { filterable: true, clearable: true }
  const selectMultiCreatable = { ...selectFilterable, multiple: true, allowCreate: true, defaultFirstOption: true }

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
          component: 'Select',
          options: [
            { label: 'POST', value: 'POST' },
            { label: 'GET', value: 'GET' },
            { label: 'PUT', value: 'PUT' },
            { label: 'PATCH', value: 'PATCH' },
            { label: 'DELETE', value: 'DELETE' }
          ],
          componentProps: { ...selectFilterable, placeholder: '请选择' }
        },
        {
          field: 'komari_content_type',
          label: 'Komari Webhook: content_type',
          component: 'Select',
          options: [
            { label: 'application/json', value: 'application/json' },
            { label: 'application/x-www-form-urlencoded', value: 'application/x-www-form-urlencoded' },
            { label: 'text/plain', value: 'text/plain' }
          ],
          componentProps: { ...selectFilterable, allowCreate: true, defaultFirstOption: true, placeholder: '请选择或输入' }
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
          component: 'Select',
          options: [
            { label: '0.0.0.0（所有网卡）', value: '0.0.0.0' },
            { label: '127.0.0.1（仅本机）', value: '127.0.0.1' }
          ],
          componentProps: { ...selectFilterable, allowCreate: true, defaultFirstOption: true, placeholder: '请选择或输入' }
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
          component: 'Select',
          options: [{ label: '/komari/webhook', value: '/komari/webhook' }],
          componentProps: { ...selectFilterable, allowCreate: true, defaultFirstOption: true, placeholder: '请选择或输入' }
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
          component: 'Select',
          options: groupOptions,
          componentProps: { ...selectMultiCreatable, placeholder: '请选择群（可输入群号回车添加）' }
        },
        {
          field: 'targets_users',
          label: '通知私聊用户',
          component: 'Select',
          options: userOptions,
          componentProps: { ...selectMultiCreatable, placeholder: '请选择好友（可输入QQ号回车添加）' }
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
          targets_groups: cfg.targets.groups,
          targets_users: cfg.targets.users,
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
            groups: normalizeTargetsFromGuobaInput(data?.targets_groups),
            users: normalizeTargetsFromGuobaInput(data?.targets_users)
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

