/**
 * 独立测试 RAG 搜索链路
 * 直接连数据库 + 加载 embedding 模型，模拟完整搜索流程
 */

const path = require('path');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const { app } = require('electron');

// 设置 app name 和正式应用一致
app.setPath('userData', path.join(app.getPath('appData'), 'nova'));

const DB_PATH = path.join(app.getPath('userData'), 'nova-knowledge', 'knowledge.db');

async function main() {
  // 1. 连接数据库
  console.log('数据库路径:', DB_PATH);
  const sv = require('sqlite-vec');
  const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
  await db.loadExtension(sv.getLoadablePath());

  // 2. 查看总 chunk 数
  const total = await db.get('SELECT COUNT(*) as cnt FROM knowledge_chunks');
  console.log('总 chunk 数:', total.cnt);

  // 3. 查看每个文件的 chunk 数
  const sources = await db.all(
    'SELECT source, COUNT(*) as cnt FROM knowledge_chunks GROUP BY source ORDER BY cnt DESC'
  );
  console.log('\n--- 各文件 chunk 分布 ---');
  for (const s of sources) {
    console.log(`  ${s.source}: ${s.cnt} 个 chunk`);
  }

  // 4. 加载 embedding 模型
  console.log('\n加载 embedding 模型...');
  const { pipeline, env } = require('@huggingface/transformers');
  env.remoteHost = 'https://hf-mirror.com';
  env.allowLocalModels = true;
  env.cacheDir = path.join(app.getPath('userData'), 'models');
  const modelPath = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2';
  const extractor = await pipeline('feature-extraction', modelPath, { dtype: 'fp32' });
  console.log('模型加载完成');

  // 5. 测试搜索
  const testQueries = ['小米', '李子豪', '李子豪 简历', '简历', 'api'];

  for (const query of testQueries) {
    console.log(`\n${'='.repeat(50)}`);
    console.log(`搜索: "${query}"`);

    // 向量化
    const output = await extractor(query, { pooling: 'mean', normalize: true });
    const vector = Array.from(output.data);
    const buffer = Buffer.from(new Float32Array(vector).buffer);

    // 向量搜索 (取 50 个候选)
    const rows = await db.all(
      `SELECT id, document, source, category, chunk_id, distance
       FROM knowledge_chunks
       WHERE embedding MATCH ? AND k = ?
       ORDER BY distance`,
      [buffer, 50]
    );

    // 关键词 boost
    function extractTerms(q) {
      const terms = [];
      const segments = q.split(/(?<=[一-鿿])(?=[a-zA-Z0-9])|(?<=[a-zA-Z0-9])(?=[一-鿿])|[\s,;.!?，。；！？、]+/).filter(Boolean);
      for (const seg of segments) {
        if (seg.length >= 2) {
          terms.push(seg);
          if (/[一-鿿]/.test(seg)) {
            for (let len = 2; len <= Math.min(seg.length, 4); len++) {
              for (let i = 0; i <= seg.length - len; i++) {
                const sub = seg.slice(i, i + len);
                if (sub.length >= 2) terms.push(sub);
              }
            }
          }
        }
      }
      if (q.trim().length >= 2 && !terms.includes(q.trim())) terms.push(q.trim());
      return [...new Set(terms)];
    }

    const terms = extractTerms(query);
    console.log(`分词结果: [${terms.join(', ')}]`);

    const queryLower = query.trim().toLowerCase();
    for (const row of rows) {
      const textLower = (row.document || '').toLowerCase();
      const sourceLower = (row.source || '').toLowerCase();
      let matchCount = 0;
      for (const t of terms) {
        if (textLower.includes(t.toLowerCase()) || sourceLower.includes(t.toLowerCase())) matchCount++;
      }
      let boost = matchCount * 0.25;
      if (textLower.includes(queryLower) || sourceLower.includes(queryLower)) boost += 0.3;
      row.distance = Math.max(0, row.distance - boost);
      row._boost = boost;
      row._matches = matchCount;
    }
    rows.sort((a, b) => a.distance - b.distance);

    // 去重 (同 source 最多 40%)
    const nResults = 5;
    const maxPerSource = Math.max(2, Math.ceil(nResults * 0.4));
    const sourceCounts = new Map();
    const results = [];
    for (const row of rows) {
      if (results.length >= nResults) break;
      const count = sourceCounts.get(row.source) || 0;
      if (count >= maxPerSource) continue;
      sourceCounts.set(row.source, count + 1);
      results.push(row);
    }

    console.log(`\nTop ${nResults} 结果:`);
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      const preview = r.document.slice(0, 60).replace(/\n/g, ' ');
      console.log(`  #${i + 1} [距离: ${r.distance.toFixed(4)}] [boost: ${r._boost.toFixed(2)}] [匹配: ${r._matches}] ${r.source}`);
      console.log(`     "${preview}..."`);
    }
  }

  await db.close();
  console.log('\n测试完成');
}

main().catch(e => {
  console.error('错误:', e.message);
  process.exit(1);
});
