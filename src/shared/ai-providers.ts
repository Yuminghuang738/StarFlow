// 「OpenAI 兼容端点」这件事的领域知识：预设表 + 端点判定 + Base URL 校验。
//
// 放 shared 而不是渲染进程里的原因：主进程要用 isLocalEndpoint 判断「这个端点能不能免 Key」，
// 渲染进程要用预设表和 checkBaseUrl 做界面，两边必须是**同一份判定**——各写一份必然漂移。
// 本文件是纯数据 + 纯函数，没有 React、没有 Node API、没有副作用，所以自检脚本可以直接断言它。
//
// ⚠️ AI_PRESETS 里的模型名会随服务商迭代而过时。这是「点一下就能用」的代价，
//    缓解手段是界面上模型名始终可编辑。改这张表时请顺手核对各家的当前模型名。

/** 一个服务商预设：点一下就把 baseUrl + model 填进设置页 */
export interface AiPreset {
  id: string
  label: string
  /** 空串 = 官方默认端点（对应「Base URL 留空」） */
  baseUrl: string
  /** 空串 = 需要用户自己填（如 LM Studio 的模型取决于本地加载了哪个） */
  model: string
  /** 「去哪拿 Key」的外链。一律给控制台**根域**而不是深层路径，避免路径改版后失效 */
  keyUrl?: string
  /** 选中后在 chips 下面显示的一行补充说明 */
  note?: string
}

export const AI_PRESETS: readonly AiPreset[] = [
  {
    id: 'openai',
    label: 'OpenAI 官方',
    baseUrl: '',
    model: 'gpt-4o-mini',
    keyUrl: 'https://platform.openai.com/api-keys'
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    keyUrl: 'https://platform.deepseek.com'
  },
  {
    id: 'moonshot',
    label: 'Kimi（月之暗面）',
    baseUrl: 'https://api.moonshot.cn/v1',
    model: 'kimi-latest',
    keyUrl: 'https://platform.moonshot.cn'
  },
  {
    id: 'zhipu',
    label: '智谱 GLM',
    // 注意这条用 /v4 而不是 /v1——它正是「/v1 不是唯一正确后缀」的证据，
    // checkBaseUrl 的版本段启发式就是为它（以及 Gemini 兼容层的 /v1beta）写的。
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    model: 'glm-4-plus',
    keyUrl: 'https://open.bigmodel.cn'
  },
  {
    id: 'qwen',
    label: '通义千问',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: 'qwen-plus',
    keyUrl: 'https://bailian.console.aliyun.com'
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'openai/gpt-4o-mini',
    keyUrl: 'https://openrouter.ai/keys'
  },
  {
    id: 'siliconflow',
    label: '硅基流动',
    baseUrl: 'https://api.siliconflow.cn/v1',
    model: 'Qwen/Qwen2.5-7B-Instruct',
    keyUrl: 'https://cloud.siliconflow.cn'
  },
  {
    id: 'ollama',
    label: 'Ollama（本地）',
    baseUrl: 'http://localhost:11434/v1',
    model: 'llama3.2',
    note: '本地端点不需要 API Key，直接保存即可。模型名换成你 ollama pull 过的那个。'
  },
  {
    id: 'lmstudio',
    label: 'LM Studio（本地）',
    baseUrl: 'http://localhost:1234/v1',
    model: '',
    note: '模型名填你在 LM Studio 里已加载的那个标识（界面上显示的那串）。本地端点不需要 Key。'
  }
]

/**
 * 是不是「本机跑的」端点。
 *
 * 存在的理由：Ollama / LM Studio 这类端点**没有 Key 这个概念**，但 openai SDK 要求 apiKey
 * 非空。认出本地端点后就能给 SDK 一个占位串，让本地部署真的能用——否则这一整类用法
 * 都会被「未配置 API Key」挡住。
 */
export function isLocalEndpoint(baseUrl: string): boolean {
  const raw = baseUrl.trim()
  if (!raw) return false
  try {
    // URL 解析对 IPv6 会保留方括号，两种写法都要认
    const host = new URL(raw).hostname.toLowerCase()
    return host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host === '::1'
  } catch {
    // 没协议头、纯手打的半截地址都落到这里：判断不了就当作不是本地
    return false
  }
}

/** 归一化：去空白、去尾斜杠、统一小写。用于「输入框里的地址对应哪家预设」这类比对 */
function normalizeUrl(url: string): string {
  return url.trim().replace(/\/+$/, '').toLowerCase()
}

/**
 * 当前 Base URL 对应哪个预设。
 *
 * 刻意从 **URL 推导**而不是记一个 presetId state：用户手打一个 DeepSeek 地址也应该
 * 让引导块显示 DeepSeek 的拿 Key 链接，记 state 的话就漏了这种情况。
 * 空串不匹配任何预设——它表示「走官方默认」，和 OpenAI 预设的显示文案有别。
 */
export function matchPreset(baseUrl: string): AiPreset | undefined {
  if (baseUrl.trim() === '') return undefined
  const target = normalizeUrl(baseUrl)
  return AI_PRESETS.find((p) => p.baseUrl !== '' && normalizeUrl(p.baseUrl) === target)
}

/** Base URL 的一条提示 */
export interface BaseUrlIssue {
  /** danger = 基本可以肯定填错了（缺协议头）；warning = 可能有问题，以服务商文档为准 */
  level: 'danger' | 'warning'
  message: string
  /** 有值时才在提示旁边画一个「补 /v1」按钮 */
  suggestV1?: string
}

/**
 * 路径是否已经以版本段结尾（/v1、/v4、/v1beta 都算）。
 *
 * 这是「/v1 不是唯一正确后缀」这条结论的通用写法：与其维护一张「哪家不用 /v1」的名单
 * （永远在漏），不如认「已经带了版本号的地址就是完整的」。智谱的 /api/paas/v4 和
 * Gemini 兼容层的 /v1beta 都因此不再误报。
 */
function hasVersionSegment(url: string): boolean {
  try {
    return /\/v\d+[a-z]*\/?$/i.test(new URL(url).pathname)
  } catch {
    return false
  }
}

/**
 * 校验 Base URL，返回**只提示不拦截**的问题列表（各家中转地址五花八门，不能拦）。
 *
 * 三条规则按优先级：缺协议头 > 明文传输 > 可疑的缺 /v1 后缀。
 * 本地端点天然豁免后两条——localhost 本来就是 http、也未必带版本段。
 */
export function checkBaseUrl(raw: string): BaseUrlIssue[] {
  const url = raw.trim()
  if (url === '') return []

  if (!/^https?:\/\//i.test(url)) {
    return [{ level: 'danger', message: '缺少 http(s):// 前缀，例如 https://api.deepseek.com/v1' }]
  }

  const local = isLocalEndpoint(url)
  const issues: BaseUrlIssue[] = []

  // 本地端点走 http 是正常的（Ollama / LM Studio 默认就是明文回环），不该报警
  if (/^http:\/\//i.test(url) && !local) {
    issues.push({
      level: 'warning',
      message: '这是 http:// 地址，API Key 会以明文传输，建议改用 https。'
    })
  }

  if (!local && !hasVersionSegment(url)) {
    issues.push({
      level: 'warning',
      message:
        '地址末尾没有版本段。多数服务商需要 /v1，但智谱用 /v4、Gemini 兼容层用 /v1beta——请以服务商文档为准。',
      suggestV1: `${url.replace(/\/+$/, '')}/v1`
    })
  }

  return issues
}
