export const config = { runtime: 'edge' };

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'API 키가 설정되지 않았습니다.' }), { status: 500 });
  }

  const { messages, stream, system, max_tokens, cache } = await req.json();

  // 프롬프트 캐싱 — 대화가 이어지는 호출(cache: true)에만 시스템 프롬프트와 마지막 메시지에 캐시 지점을 둔다.
  // 같은 인터뷰 안에서 다음 턴을 요청할 때 앞부분을 캐시에서 읽어 입력 비용이 줄어든다.
  // 한 번만 보내고 끝나는 호출(설문·워크숍·사용성 평가·리뷰 요약)은 다시 읽을 일이 없어 캐시 쓰기 할증만 생기므로 걸지 않는다.
  const cachedMessages = (messages || []).map((m, i, arr) => {
    if (!cache || i !== arr.length - 1) return m;
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
      ? [cache ? { type: 'text', text: system, cache_control: { type: 'ephemeral' } } : { type: 'text', text: system }]
      : system;
  }

  const callUpstream = () => fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });

  // 스트리밍 응답 그대로 전달
  if (stream) {
    const upstream = await callUpstream();
    if (!upstream.ok) {
      const err = await upstream.json().catch(() => ({}));
      return new Response(
        JSON.stringify({ error: err?.error?.message || `Anthropic 오류 ${upstream.status}` }),
        { status: upstream.status }
      );
    }
    return new Response(upstream.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }

  // 비스트리밍 — 응답을 바로 열어 두고 몇 초마다 공백을 보낸다.
  // Vercel Edge는 25초 안에 응답을 시작하지 않으면 끊는데, 대화가 길어져 AI 답이 늦으면 여기에 걸려 '다음 질문을 불러오지 못했어요'가 났다.
  // 공백은 JSON 앞에 붙어도 JSON.parse가 무시한다. 상태 코드는 먼저 200으로 나가므로 오류는 { error, status } 본문으로 알린다.
  const enc = new TextEncoder();
  const out = new ReadableStream({
    async start(ctrl) {
      const ping = setInterval(() => { try { ctrl.enqueue(enc.encode(' ')); } catch (e) { /* 이미 닫힘 */ } }, 5000);
      try {
        const upstream = await callUpstream();
        const data = await upstream.json().catch(() => ({}));
        if (!upstream.ok) ctrl.enqueue(enc.encode(JSON.stringify({ error: data?.error?.message || `Anthropic 오류 ${upstream.status}`, status: upstream.status })));
        else ctrl.enqueue(enc.encode(JSON.stringify(data)));
      } catch (e) {
        ctrl.enqueue(enc.encode(JSON.stringify({ error: 'AI 서버에 연결하지 못했습니다. (' + (e && e.message || e) + ')', status: 502 })));
      } finally {
        clearInterval(ping);
        ctrl.close();
      }
    },
  });
  return new Response(out, {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
