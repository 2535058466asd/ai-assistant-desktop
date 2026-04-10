// ==========================================
// 豆包 TTS 鉴权调试脚本
// 用于测试哪个参数导致 401 错误
// ==========================================

const WebSocket = require('ws')
const crypto = require('crypto')

// 配置 - 尝试不同的组合
const configs = [
  {
    name: '配置1: 实例名作为 resourceId',
    appId: '3206095607',
    accessToken: 'PabCghuQ4DAac8Rc9mP9INimQZ3aueUD',
    resourceId: 'TTS-SeedTTS2.02000000640272909314',
    url: 'wss://openspeech.bytedance.com/api/v3/tts/bidirection'
  },
  {
    name: '配置2: volc.service_type.10029',
    appId: '3206095607',
    accessToken: 'PabCghuQ4DAac8Rc9mP9INimQZ3aueUD',
    resourceId: 'volc.service_type.10029',
    url: 'wss://openspeech.bytedance.com/api/v3/tts/bidirection'
  },
  {
    name: '配置3: seed-tts-2.0',
    appId: '3206095607',
    accessToken: 'PabCghuQ4DAac8Rc9mP9INimQZ3aueUD',
    resourceId: 'seed-tts-2.0',
    url: 'wss://openspeech.bytedance.com/api/v3/tts/bidirection'
  },
  {
    name: '配置4: API Key 替代 Token (实例名)',
    appId: '3206095607',
    accessToken: '6f19c70a-0d33-404f-a82c-8200b89b6205',
    resourceId: 'TTS-SeedTTS2.02000000640272909314',
    url: 'wss://openspeech.bytedance.com/api/v3/tts/bidirection'
  },
  {
    name: '配置5: API Key 替代 Token (10029)',
    appId: '3206095607',
    accessToken: '6f19c70a-0d33-404f-a82c-8200b89b6205',
    resourceId: 'volc.service_type.10029',
    url: 'wss://openspeech.bytedance.com/api/v3/tts/bidirection'
  }
]

async function testConfig(config, index) {
  return new Promise((resolve) => {
    console.log(`\n${'='.repeat(60)}`)
    console.log(`🔧 测试 ${index + 1}: ${config.name}`)
    console.log(`${'='.repeat(60)}`)
    console.log(`   App ID: ${config.appId}`)
    console.log(`   Token/Key: ${config.accessToken.substring(0, 15)}...`)
    console.log(`   Resource ID: ${config.resourceId}`)
    console.log(`   URL: ${config.url}`)

    const headers = {
      'X-Api-App-Key': config.appId,
      'X-Api-Access-Key': config.accessToken,
      'X-Api-Resource-Id': config.resourceId,
      'X-Api-Connect-Id': crypto.randomUUID()
    }

    const ws = new WebSocket(config.url, { headers })

    const timeout = setTimeout(() => {
      ws.close()
      resolve({ index, success: false, error: '超时（5秒无响应）' })
    }, 5000)

    ws.on('open', () => {
      clearTimeout(timeout)
      console.log(`   ✅ 成功！WebSocket 连接已建立`)
      ws.close()
      resolve({ index, success: true })
    })

    ws.on('error', (err) => {
      clearTimeout(timeout)
      console.log(`   ❌ 失败: ${err.message}`)
      resolve({ index, success: false, error: err.message })
    })

    ws.on('unexpected-response', (req, res) => {
      clearTimeout(timeout)
      const status = res.statusCode
      let body = ''
      res.on('data', chunk => body += chunk.toString())
      res.on('end', () => {
        console.log(`   ❌ HTTP Error: ${status} ${res.statusMessage}`)
        if (body) {
          try {
            const json = JSON.parse(body)
            console.log(`   响应内容:`, json)
          } catch {
            console.log(`   响应内容: ${body.substring(0, 200)}`)
          }
        }
        resolve({ index, success: false, error: `HTTP ${status}` })
      })
    })
  })
}

async function main() {
  console.log('🚀 豆包 TTS 鉴权调试工具')
  console.log('正在测试所有配置组合...\n')

  for (let i = 0; i < configs.length; i++) {
    await testConfig(configs[i], i)
    // 等待一下再测下一个
    await new Promise(r => setTimeout(r, 1000))
  }

  console.log(`\n${'='.repeat(60)}`)
  console.log('📊 测试结果汇总')
  console.log(`${'='.repeat(60)}`)

  // 结果会在每个测试中打印
  process.exit(0)
}

main().catch(console.error)
