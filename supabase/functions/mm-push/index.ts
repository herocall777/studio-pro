// 푸시 발송 트리거.
// 호출 방법 (둘 중 하나)
//  1) Database Webhook : mm_outbox 에 INSERT 되면 이 함수를 호출 (헤더 x-push-secret 필요)
//  2) 앱이 출결 기록 직후 호출 (로그인한 사용자 토큰)
import { caller, cors, json } from "../_shared/common.ts";
import { flushOutbox } from "../_shared/push.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const secret = Deno.env.get("PUSH_SECRET");
  const bySecret = !!secret && req.headers.get("x-push-secret") === secret;
  const user = bySecret ? null : await caller(req);
  if (!bySecret && !user) return json({ error: "로그인이 필요합니다" }, 401);

  return json(await flushOutbox());
});
