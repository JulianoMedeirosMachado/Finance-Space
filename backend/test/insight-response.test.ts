import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { AiService } from '../src/integrations/ai.service';
import { insightReportSchema, insightGenerationSchema } from '../src/integrations/insights.schema';
import { insightOutputContract, parseInsightResponse } from '../src/integrations/insight-response';

const report = {
  title: 'Resumo',
  summary: 'Análise dos dados registrados.',
  findings: [{ title: 'Orçamento', detail: 'Revise os compromissos previstos.', suggestion: '' }],
};

test('insight responses normalize harmless formatting locally without inventing missing analysis', () => {
  for (const value of [
    JSON.stringify(report),
    `\uFEFF  ${JSON.stringify(report)} `,
    '```json\n' + JSON.stringify(report) + '\n```',
  ]) {
    assert.deepEqual(parseInsightResponse(value), report);
  }
  assert.deepEqual(
    parseInsightResponse(
      JSON.stringify({
        ...report,
        metadata: { ignored: true },
        findings: [{ ...report.findings[0], suggestion: null, extra: 'ignored' }],
      }),
    ),
    report,
  );
  assert.deepEqual(
    parseInsightResponse(
      JSON.stringify({
        ...report,
        findings: [{ title: report.findings[0].title, detail: report.findings[0].detail }],
      }),
    ),
    report,
  );
  for (const value of [
    '',
    '{"title":"incomplete"',
    'Intro ' + JSON.stringify(report),
    JSON.stringify({ ...report, summary: 123 }),
    JSON.stringify({ ...report, findings: [] }),
    JSON.stringify({ ...report, summary: 'x'.repeat(2001) }),
    JSON.stringify({ ...report, findings: [{ title: 'Missing detail' }] }),
  ]) {
    assert.throws(() => parseInsightResponse(value));
  }
  assert.ok(insightReportSchema.safeParse(report).success);
  assert.equal(insightGenerationSchema.parse({}).retry, false);
  assert.equal(insightGenerationSchema.safeParse({ retry: 'true' }).success, false);
  const contract = JSON.parse(insightOutputContract);
  assert.equal(contract.properties.summary.maxLength, 2000);
  assert.equal(contract.properties.findings.maxItems, 6);
});

test('insight adapter bounds output, disables DeepSeek thinking and never retries malformed provider responses', async () => {
  const previous = globalThis.fetch;
  const credential = {
    provider: 'deepseek' as const,
    model: 'deepseek-flash',
    apiKey: randomBytes(24).toString('hex'),
  };
  let calls = 0;
  let content: string | null = JSON.stringify(report);
  let finishReason = 'stop';
  let status = 200;
  try {
    globalThis.fetch = async (_url, options) => {
      calls++;
      const body = JSON.parse(String(options?.body));
      assert.deepEqual(body.thinking, { type: 'disabled' });
      assert.equal(body.max_tokens, 2200);
      assert.equal(body.response_format.type, 'json_object');
      assert.ok(body.messages[0].content.includes(insightOutputContract));
      assert.match(body.messages[0].content, /at most 450 words/);
      return new Response(
        JSON.stringify({
          choices: [
            {
              finish_reason: finishReason,
              message: { content, reasoning_content: 'PRIVATE_REASONING' },
            },
          ],
        }),
        { status },
      );
    };
    const ai = new AiService();
    assert.deepEqual(await ai.insights(credential, {}, 'Brazilian Portuguese'), report);
    content = '```json\n' + JSON.stringify({ ...report, additional: true }) + '\n```';
    assert.deepEqual(await ai.insights(credential, {}, 'English'), report);
    for (const scenario of [
      { content: '{"title":"unfinished', finishReason: 'length', message: /limite de tokens/ },
      { content: '', finishReason: 'stop', message: /resposta vazia/ },
      { content: null, finishReason: 'stop', message: /resposta vazia/ },
      { content: JSON.stringify(report), finishReason: 'content_filter', message: /não concluiu/ },
      { content: '{broken', finishReason: 'stop', message: /formato da análise/ },
      {
        content: JSON.stringify({ title: 'Only title' }),
        finishReason: 'stop',
        message: /formato da análise/,
      },
    ]) {
      content = scenario.content;
      finishReason = scenario.finishReason;
      const before = calls;
      await assert.rejects(ai.insights(credential, {}, 'English'), (error) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, scenario.message);
        assert.doesNotMatch(error.message, /PRIVATE_REASONING|unfinished|broken/);
        assert.ok(!error.message.includes(credential.apiKey));
        return true;
      });
      assert.equal(calls, before + 1);
    }
    status = 429;
    const before = calls;
    await assert.rejects(ai.insights(credential, {}, 'English'), /Não foi possível consultar/);
    assert.equal(calls, before + 1);
  } finally {
    globalThis.fetch = previous;
  }
});
