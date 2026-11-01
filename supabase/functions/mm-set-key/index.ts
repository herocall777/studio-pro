// 운영자 전용: 학원의 AI(Gemini) API 키를 서버에 안전하게 저장/확인/삭제
// 키는 브라우저·학생 기기에 절대 내려가지 않습니다.
//   POST { studio_id, action: "status" }                 → { has_key }
//   POST { studio_id, action: "save", gemini_key: "..." } → { has_key: true }  (저장 전에 키 유효성 검사)
//   POST { studio_id, action: "delete" }                 → { has_key: false }
import { caller, cors, json, serviceClient } from "../_shared/common.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const me = await caller(req);
  if (!me) return json({ error: "로그인이 필요합니다" }, 401);

  const { studio_id, action, gemini_key } = await req.json().catch(() => ({}));
  if (!studio_id) return json({ error: "studio_id 가 필요합니다" }, 400);

  const { data: isOwner } = await me.client.rpc("mm_is_owner", { p_studio: String(studio_id) });
  if (!isOwner) return json({ error: "원장만 설정할 수 있습니다" }, 403);

  const sb = serviceClient();

  if (action === "save") {
    const key = String(gemini_key ?? "").trim();
    if (key.length < 20) return json({ error: "API 키 형식이 올바르지 않습니다" }, 400);
    const test = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?pageSize=1&key=${encodeURIComponent(key)}`,
    );
    if (!test.ok) return json({ error: "유효하지 않은 API 키입니다 (Google 확인 실패)" }, 400);
    const { error } = await sb.from("mm_secrets").upsert({
      studio_id: String(studio_id), gemini_key: key, updated_at: new Date().toISOString(),
    });
    if (error) return json({ error: error.message }, 500);
    return json({ has_key: true });
  }

  if (action === "delete") {
    await sb.from("mm_secrets").update({ gemini_key: null }).eq("studio_id", String(studio_id));
    return json({ has_key: false });
  }

  const { data } = await sb.from("mm_secrets").select("gemini_key").eq("studio_id", String(studio_id)).maybeSingle();
  return json({ has_key: !!data?.gemini_key });
});
