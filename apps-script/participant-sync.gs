/**
 * 합성 투자자 리서치 플랫폼 → 「3_참가자 관리」 연동 (직접 인터뷰)
 *
 * 설치 (시트 편집 권한이 있는 사람이 한 번만)
 *  1. 구글 시트에서 확장 프로그램 → Apps Script 를 열고, 이 파일 내용을 그대로 붙여 넣고 저장
 *  2. 왼쪽 ⚙ 프로젝트 설정 → 스크립트 속성 → 속성 추가: TOKEN = (아무도 모르는 긴 문자열)
 *  3. 배포 → 새 배포 → 유형: 웹 앱 / 실행 사용자: 나 / 액세스 권한: 모든 사용자 → 배포 → 권한 승인
 *  4. 웹 앱 URL(…/exec)을 Vercel 환경 변수 SHEET_WEBHOOK_URL 에, 2번의 TOKEN 값을 SHEET_TOKEN 에 넣는다
 *
 * 규칙
 *  - 노란 칸(입력 칸)만 쓴다. 회색 칸(수식)·다른 탭은 건드리지 않는다
 *  - 행을 지우거나 옮기지 않는다 (질문지 탭 배정이 꼬인다). 새 사람은 비어 있는 다음 줄에 넣는다
 *  - P00(파일럿) 줄은 쓰지 않는다. '(예시)' 줄은 덮어쓴다
 *  - 플랫폼에서 취소하면 그 줄의 상태만 '취소'로 바꾼다
 *  - 같은 사람은 비고 칸의 [스크리닝 ID] 표시로 찾아 다시 쓴다
 */
var SHEET_NAME = '3_참가자 관리';
var HEADER_ROW = 5;
var FIRST_ROW = 7;    // P01
var LAST_ROW = 20;    // 표 아래 판정 기준 설명(21행~) 앞까지
var COL = { id: 1, name: 2, when: 3, career: 4, product: 5, picking: 6, ai: 7, loss: 12, multiApp: 14, age: 15, place: 16, host: 17, recorder: 18, status: 19, note: 21, tab: 22 };
var STATUSES = ['파일럿', '예정', '확정', '완료', '취소', '노쇼'];

function doPost(e) {
  var body = {};
  try { body = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (err) { return out_({ ok: false, error: '요청을 읽지 못했습니다' }); }
  var token = PropertiesService.getScriptProperties().getProperty('TOKEN');
  if (!token || body.token !== token) return out_({ ok: false, error: '토큰이 맞지 않습니다' });
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sh = SpreadsheetApp.getActive().getSheetByName(SHEET_NAME);
    if (!sh) return out_({ ok: false, error: '「' + SHEET_NAME + '」 탭이 없습니다' });
    if (String(sh.getRange(HEADER_ROW, COL.name).getValue()).indexOf('이름') !== 0) return out_({ ok: false, error: '「' + SHEET_NAME + '」 칸 구성이 예상과 다릅니다' });
    if (body.action === 'ping') return out_({ ok: true, sheet: SHEET_NAME });
    if (body.action === 'upsert') return out_(upsert_(sh, body));
    if (body.action === 'cancel') return out_(cancel_(sh, body));
    return out_({ ok: false, error: '알 수 없는 요청입니다' });
  } catch (err) {
    return out_({ ok: false, error: String(err && err.message || err) });
  } finally {
    lock.releaseLock();
  }
}

function marker_(key) { return '[' + key + ']'; }

// 비고 칸의 [스크리닝 ID]로 같은 사람의 줄을 찾는다
function findRow_(sh, key) {
  var notes = sh.getRange(FIRST_ROW, COL.note, LAST_ROW - FIRST_ROW + 1, 1).getValues();
  for (var i = 0; i < notes.length; i++) if (String(notes[i][0]).indexOf(marker_(key)) >= 0) return FIRST_ROW + i;
  return 0;
}
// 새 사람이 들어갈 줄 — 이름이 비어 있거나 '(예시)'인 첫 줄
function emptyRow_(sh) {
  var names = sh.getRange(FIRST_ROW, COL.name, LAST_ROW - FIRST_ROW + 1, 1).getValues();
  for (var i = 0; i < names.length; i++) {
    var v = String(names[i][0]).trim();
    if (!v || v.indexOf('(예시)') >= 0) return FIRST_ROW + i;
  }
  return 0;
}

function upsert_(sh, b) {
  var row = findRow_(sh, b.key);
  var isNew = !row;
  if (isNew) row = emptyRow_(sh);
  if (!row) return { ok: false, error: '「' + SHEET_NAME + '」에 빈 줄이 없습니다' };
  var wasExample = String(sh.getRange(row, COL.name).getValue()).indexOf('(예시)') >= 0;
  var set = function (col, v) { if (v !== undefined && v !== null) sh.getRange(row, col).setValue(v); };
  set(COL.name, b.name);
  set(COL.when, b.when || '');
  set(COL.career, b.career);
  set(COL.product, b.product);
  set(COL.picking, b.picking);
  set(COL.ai, b.ai);
  set(COL.loss, b.loss);
  set(COL.multiApp, b.multiApp);
  set(COL.place, b.place);
  set(COL.host, b.host || '');
  set(COL.recorder, b.recorder || '');
  set(COL.status, STATUSES.indexOf(b.status) >= 0 ? b.status : '예정');
  set(COL.note, '플랫폼 ' + (b.code || '') + ' ' + marker_(b.key));
  if (wasExample) set(COL.age, '');   // 예시 줄에 있던 연령대는 지운다 (스크리닝에서 묻지 않음)
  SpreadsheetApp.flush();
  return { ok: true, created: isNew, row: row, id: String(sh.getRange(row, COL.id).getValue()), tab: String(sh.getRange(row, COL.tab).getValue()) };
}

function cancel_(sh, b) {
  var row = findRow_(sh, b.key);
  if (!row) return { ok: true, row: 0 };   // 시트에 없으면 할 일 없음
  sh.getRange(row, COL.status).setValue('취소');
  SpreadsheetApp.flush();
  return { ok: true, row: row, id: String(sh.getRange(row, COL.id).getValue()), tab: String(sh.getRange(row, COL.tab).getValue()) };
}

function out_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
