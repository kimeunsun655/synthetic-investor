export const config = { runtime: 'edge' };

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'API 키가 설정되지 않았습니다.' }), { status: 500 });
  }

  const { messages, stream, system, max_tokens } = await req.json();

  // 프롬프트 캐싱 — 시스템 프롬프트와 대화의 마지막 메시지에 캐시 지점을 둔다.
  // 같은 인터뷰 안에서 다음 턴을 요청할 때 앞부분을 캐시에서 읽어 입력 비용이 줄어든다.
  const cachedMessages = (messages || []).map((m, i, arr) => {
    if (i !== arr.length - 1) return m;
    const blocks = typeof m.content === 'string' ? [{ type: 'text', text: m.content }] : m.content;
    if (!Array.isArray(blocks) || !blocks.length) return m;
    const last = { ...blocks[blocks.length - 1], cache_control: { type: 'ephemeral' } };
    return { ...m, content: [...blocks.slice(0, -1), last] };
  });

  const body = {
    model: 'claude-sonnet-4-6',
    max_tokens: Math.min(Math.max(parseInt(max_tokens, 10) || 2000, 256), 4000),
    stream: !!stream,
    messages: cachedMessages,
  };
  if (system) {
    body.system = typeof system === 'string'
      ? [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }]
      : system;
  }

  const upstream = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });

  if (!upstream.ok) {
    const err = await upstream.json().catch(() => ({}));
    return new Response(
      JSON.stringify({ error: err?.error?.message || `Anthropic 오류 ${upstream.status}` }),
      { status: upstream.status }
    );
  }

  // 스트리밍 응답 그대로 전달
  if (stream) {
    return new Response(upstream.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }

  // 비스트리밍
  const data = await upstream.json();
  return new Response(JSON.stringify(data), {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
