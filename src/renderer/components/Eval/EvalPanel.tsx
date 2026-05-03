import React, { useMemo, useState } from 'react';
import styles from './EvalPanel.module.css';
import { getEvalCases, resetEvalCases, updateEvalCase, type EvalCase, type EvalStatus } from '../../services/workspaceStore';

const categoryLabels: Record<EvalCase['category'], string> = {
  rag: 'RAG',
  memory: '记忆',
  tool: '工具',
  safety: '安全',
  planning: '规划',
};

const statusLabels: Record<EvalStatus, string> = {
  untested: '未测',
  pass: '通过',
  fail: '失败',
};

const EvalPanel: React.FC = () => {
  const [cases, setCases] = useState<EvalCase[]>(() => getEvalCases());
  const [category, setCategory] = useState<'all' | EvalCase['category']>('all');

  const filteredCases = useMemo(() => {
    if (category === 'all') return cases;
    return cases.filter((testCase) => testCase.category === category);
  }, [cases, category]);

  const passCount = cases.filter((testCase) => testCase.status === 'pass').length;
  const failCount = cases.filter((testCase) => testCase.status === 'fail').length;
  const testedCount = passCount + failCount;
  const passRate = testedCount ? Math.round((passCount / testedCount) * 100) : 0;

  const setStatus = (caseId: string, status: EvalStatus) => {
    setCases(updateEvalCase(caseId, { status }));
  };

  const handleReset = () => {
    setCases(resetEvalCases());
  };

  const copyEvalSet = () => {
    navigator.clipboard.writeText(JSON.stringify(cases, null, 2));
  };

  return (
    <div className={styles.panel}>
      <div className={styles.metrics}>
        <div>
          <strong>{cases.length}</strong>
          <span>测试问题</span>
        </div>
        <div>
          <strong>{testedCount}</strong>
          <span>已评估</span>
        </div>
        <div>
          <strong>{passRate}%</strong>
          <span>通过率</span>
        </div>
      </div>

      <div className={styles.toolbar}>
        <select value={category} onChange={(event) => setCategory(event.target.value as any)}>
          <option value="all">全部类别</option>
          {Object.entries(categoryLabels).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        <button onClick={copyEvalSet}>复制 Eval Set</button>
        <button onClick={handleReset}>重置</button>
      </div>

      <div className={styles.caseList}>
        {filteredCases.map((testCase) => (
          <article key={testCase.id} className={styles.caseCard}>
            <div className={styles.caseHeader}>
              <span>{categoryLabels[testCase.category]}</span>
              <strong className={styles[testCase.status]}>{statusLabels[testCase.status]}</strong>
            </div>
            <h4>{testCase.question}</h4>
            <p>{testCase.expectedBehavior}</p>
            <div className={styles.actions}>
              <button onClick={() => setStatus(testCase.id, 'pass')}>标记通过</button>
              <button onClick={() => setStatus(testCase.id, 'fail')}>标记失败</button>
              <button onClick={() => setStatus(testCase.id, 'untested')}>未测</button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
};

export default EvalPanel;
