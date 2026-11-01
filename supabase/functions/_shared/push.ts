// 알림 대기열(mm_outbox)을 읽어 웹 푸시로 발송
import webpush from "npm:web-push@3.6.7";
import { serviceClient } from "./common.ts";

let vapidReady = false;
function initVapid() {
  if (vapidReady) return true;
  const pub = Deno.env.get("VAPID_PUBLIC_KEY");
  const priv = Deno.env.get("VAPID_PRIVATE_KEY");
  if (!pub || !priv) return false;
  webpush.setVapidDetails(Deno.env.get("VAPID_SUBJECT") ?? "mailto:herocall1@gmail.com", pub, priv);
  vapidReady = true;
  return true;
}

export async function flushOutbox(limit = 50) {
  if (!initVapid()) return { sent: 0, skipped: "VAPID 키가 설정되지 않았습니다" };
  const sb = serviceClient();
  const { data: rows } = await sb.from("mm_outbox").select("*").is("sent_at", null)
    .order("created_at").limit(limit);
  let sent = 0;
  for (const row of rows ?? []) {
    const emails = (row.to_emails as string[]).map((e) => e.toLowerCase());
    const { data: subs } = await sb.from("mm_push_sub").select("*").in("email", emails);
    const payload = JSON.stringify({ title: row.title, body: row.body, url: row.url ?? "/studio-pro/" });
    for (const s of subs ?? []) {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
        );
        sent++;
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        // 만료된 구독은 정리
        if (code === 404 || code === 410) await sb.from("mm_push_sub").delete().eq("endpoint", s.endpoint);
      }
    }
    await sb.from("mm_outbox").update({ sent_at: new Date().toISOString() }).eq("id", row.id);
  }
  return { sent, rows: rows?.length ?? 0 };
}
