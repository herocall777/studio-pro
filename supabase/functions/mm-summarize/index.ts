// 수업 녹음 자동 요약
//   POST { audio_id }
// - 호출자: 해당 학원 운영자, 또는 그 녹음을 올린 담당 강사
// - 서버가 저장된 학원 키(mm_secrets)로 Gemini 를 호출합니다. 학생/학부모는 키가 필요 없습니다.
// - 긴 수업(1시간 ≈ 28MB)도 처리하기 위해 Gemini Files API 를 사용하고,
//   응답은 바로 돌려준 뒤 요약은 백그라운드에서 진행합니다(상태: mm_class_audio.status).
// - 원본 파일은 요약 후에도 그대로 보관됩니다(운영자 전용 버킷).
import { caller, cors, json, serviceClient } from "../_shared/common.ts";
import { flushOutbox } from "../_shared/push.ts";

const GEMINI = "https://generativelanguage.googleapis.com";
const MODEL = Deno.env.get("GEMINI_MODEL") ?? "gemini-2.5-flash";

const PROMPT = `당신은 음악학원(보컬·피아노) 수업 기록 도우미입니다. 첨부된 수업 녹음을 듣고 한국어로 정리하세요.
학부모와 학생이 읽는 글이므로 쉽고 따뜻하게, 과장 없이 사실만 쓰세요.
반드시 아래 JSON 형식으로만 답하세요.
{"summary":"오늘 수업에서 한 내용 3~5문장(배운 곡·기술·잘한 점·개선점)","homework":"집에서 연습할 포인트 1~3개를 줄바꿈으로 구분"}
녹음에 수업과 무관한 사적인 대화가 있으면 요약에 넣지 마세요. 알아듣기 어려우면 추측하지 말고 "녹음 상태가 좋지 않아 일부만 정리했어요"라고 쓰세요.`;

async function geminiUpload(key: string, bytes: Uint8Array, mime: string, name: string) {
  const start = await fetch(`${GEMINI}/upload/v1beta/files?key=${key}`, {
    method: "POST",
    headers: {
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": String(bytes.length),
      "X-Goog-Upload-Header-Content-Type": mime,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ file: { display_name: name } }),
  });
  const url = start.headers.get("x-goog-upload-url");
  if (!start.ok || !url) throw new Error("Gemini 업로드 시작 실패 (" + start.status + ")");
  const up = await fetch(url, {
    method: "POST",
    headers: { "X-Goog-Upload-Offset": "0", "X-Goog-Upload-Command": "upload, finalize" },
    body: bytes,
  });
  if (!up.ok) throw new Error("Gemini 업로드 실패 (" + up.status + ")");
  const f = (await up.json()).file;
  // 처리 완료(ACTIVE)까지 대기
  for (let i = 0; i < 60; i++) {
    const st = await (await fetch(`${GEMINI}/v1beta/${f.name}?key=${key}`)).json();
    if (st.state === "ACTIVE") return { uri: st.uri as string, name: f.name as string };
    if (st.state === "FAILED") throw new Error("Gemini 가 오디오를 처리하지 못했습니다");
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error("Gemini 처리 시간 초과");
}

async function run(audioId: string) {
  const sb = serviceClient();
  const fail = async (msg: string) =>
    await sb.from("mm_class_audio").update({ status: "error", error: msg }).eq("id", audioId);
  try {
    const { data: a } = await sb.from("mm_class_audio").select("*").eq("id", audioId).single();
    const { data: sec } = await sb.from("mm_secrets").select("gemini_key").eq("studio_id", a.studio_id).maybeSingle();
    if (!sec?.gemini_key) return await fail("AI 키가 등록되지 않았습니다. 설정 > AI 요약에서 키를 등록하세요.");

    const { data: blob, error: dlErr } = await sb.storage.from("mm-class-original").download(a.storage_path);
    if (dlErr || !blob) return await fail("원본 파일을 찾을 수 없습니다");
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const mime = blob.type && blob.type !== "application/octet-stream"
      ? blob.type.split(";")[0] : (a.storage_path.endsWith(".mp4") || a.storage_path.endsWith(".m4a") ? "audio/mp4" : "audio/webm");

    const file = await geminiUpload(sec.gemini_key, bytes, mime, `lesson-${audioId}`);
    const res = await fetch(`${GEMINI}/v1beta/models/${MODEL}:generateContent?key=${sec.gemini_key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ file_data: { mime_type: mime, file_uri: file.uri } }, { text: PROMPT }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.3 },
      }),
    });
    // Gemini 쪽 임시 파일은 요약 직후 삭제(원본은 우리 저장소에만 남김)
    fetch(`${GEMINI}/v1beta/${file.name}?key=${sec.gemini_key}`, { method: "DELETE" }).catch(() => {});
    if (!res.ok) return await fail("Gemini 요약 실패 (" + res.status + ")");

    const text = (await res.json())?.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
    let parsed: { summary?: string; homework?: string } = {};
    try { parsed = JSON.parse(text); } catch { parsed = { summary: text }; }
    if (!parsed.summary) return await fail("요약 결과가 비어 있습니다");

    await sb.from("mm_class_summary").upsert({
      audio_id: audioId, studio_id: a.studio_id, member_id: a.member_id, lesson_date: a.lesson_date,
      summary: parsed.summary, homework: parsed.homework ?? null,
    });
    await sb.from("mm_class_audio").update({ status: "done", error: null }).eq("id", audioId);

    // 학생·학부모·담당강사에게 알림
    const { data: r } = await sb.from("mm_roster").select("*").eq("studio_id", a.studio_id).eq("member_id", a.member_id).maybeSingle();
    if (r) {
      const to = [...(r.parent_emails ?? []), r.student_email, r.teacher_email].filter(Boolean);
      await sb.from("mm_outbox").insert({
        studio_id: a.studio_id, to_emails: to, title: `${r.name} 수업 요약이 도착했어요`,
        body: String(parsed.summary).slice(0, 80) + "…", url: "/studio-pro/",
      });
      await flushOutbox();
    }
  } catch (e) {
    await fail(String((e as Error).message ?? e).slice(0, 300));
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const me = await caller(req);
  if (!me) return json({ error: "로그인이 필요합니다" }, 401);
  const { audio_id } = await req.json().catch(() => ({}));
  if (!audio_id) return json({ error: "audio_id 가 필요합니다" }, 400);

  const sb = serviceClient();
  const { data: a } = await sb.from("mm_class_audio").select("*").eq("id", audio_id).maybeSingle();
  if (!a) return json({ error: "녹음을 찾을 수 없습니다" }, 404);

  const { data: admin } = await me.client.rpc("mm_is_admin", { p_studio: a.studio_id });
  const isUploader = (a.teacher_email ?? "").toLowerCase() === me.email;
  if (!admin && !isUploader) return json({ error: "권한이 없습니다" }, 403);

  await sb.from("mm_class_audio").update({ status: "summarizing", error: null }).eq("id", audio_id);
  // @ts-ignore EdgeRuntime 은 Supabase Edge 런타임 전역
  EdgeRuntime.waitUntil(run(audio_id));
  return json({ status: "summarizing" }, 202);
});
