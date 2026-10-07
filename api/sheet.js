export const config = { runtime: 'edge' };

// 직접 인터뷰 → 구글 시트 「3_참가자 관리」 연동
// 플랫폼은 이 함수로만 시트에 보낸다. 시트 주소(Apps Script 웹 앱 URL)와 비밀 토큰은 Vercel 환경 변수에만 둔다.
//   SHEET_WEBHOOK_URL  Apps Script를 '웹 앱'으로 배포한 주소 (https://script.google.com/macros/s/.../exec)
//   SHEET_TOKEN        Apps Script의 스크립트 속성 TOKEN과 같은 값
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

export default async function handler(req) {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const url = process.env.SHEET_WEBHOOK_URL;
  const token = process.env.SHEET_TOKEN;
  if (!url || !token) return json({ error: '시트 연동이 설정되지 않았습니다 (SHEET_WEBHOOK_URL · SHEET_TOKEN)' }, 501);

  const body = await req.json().catch(() => null);
  if (!body || !['upsert', 'cancel', 'ping'].includes(body.action) || (body.action !== 'ping' && !body.key)) {
    return json({ error: '잘못된 요청입니다' }, 400);
  }

  let res;
  try {
    // Apps Script 웹 앱은 POST에 302로 답하고, 따라간 주소에서 결과를 준다
    res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(Object.assign({}, body, { token })), redirect: 'follow' });
  } catch (e) {
    return json({ error: '시트에 연결하지 못했습니다' }, 502);
  }
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch (e) { return json({ error: `시트 응답을 읽지 못했습니다 (HTTP ${res.status})` }, 502); }
  if (!data || !data.ok) return json({ error: (data && data.error) || '시트 오류' }, 502);
  return json(data);
}
