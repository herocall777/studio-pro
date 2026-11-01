// 운영자(원장/실장)가 같은 학원 소속 회원의 비밀번호를 대신 변경합니다.
//   POST { studio_id, email, new_password }
// 기존 reset-password 함수는 "전화번호만 알면 누구나 비밀번호를 바꿀 수 있는" 구조라 대체합니다.
// (배포 후 기존 reset-password 함수는 삭제하세요.)
import { caller, cors, json, serviceClient } from "../_shared/common.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const me = await caller(req);
  if (!me) return json({ error: "로그인이 필요합니다" }, 401);

  const { studio_id, email, new_password } = await req.json().catch(() => ({}));
  if (!studio_id || !email || String(new_password ?? "").length < 6) {
    return json({ error: "학원, 대상 계정, 새 비밀번호(6자 이상)가 필요합니다" }, 400);
  }
  const { data: admin } = await me.client.rpc("mm_is_admin", { p_studio: String(studio_id) });
  if (!admin) return json({ error: "운영자만 변경할 수 있습니다" }, 403);

  const sb = serviceClient();
  const target = String(email).toLowerCase();
  // 같은 학원 소속 회원만 허용 (다른 학원/원장 계정 보호)
  const { data: prof } = await sb.from("user_profiles").select("email,role,studio_id")
    .ilike("email", target).eq("studio_id", studio_id).maybeSingle();
  if (!prof) return json({ error: "이 학원 소속 계정이 아닙니다" }, 404);
  if (prof.role === "원장" || prof.role === "슈퍼어드민") {
    if (target !== me.email) return json({ error: "원장 계정은 본인만 변경할 수 있습니다" }, 403);
  }

  let page = 1, userId: string | null = null;
  while (!userId && page <= 20) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 });
    if (error || !data.users.length) break;
    userId = data.users.find((u) => (u.email ?? "").toLowerCase() === target)?.id ?? null;
    page++;
  }
  if (!userId) return json({ error: "로그인 계정을 찾을 수 없습니다" }, 404);

  const { error } = await sb.auth.admin.updateUserById(userId, { password: String(new_password) });
  if (error) return json({ error: error.message }, 500);
  return json({ ok: true });
});
