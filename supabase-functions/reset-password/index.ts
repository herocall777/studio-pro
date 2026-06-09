// ScheduleMate — reset-password Edge Function
// 전화번호 SMS 인증 완료 후 비밀번호를 서버 측에서 변경합니다.
//
// 배포 방법:
// 1. https://supabase.com/dashboard/project/uwrgfnyydroizsvexiwe/functions 접속
// 2. "Deploy a new function" 클릭
// 3. 함수명: reset-password
// 4. 아래 코드 전체 붙여넣기 후 Deploy

import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { phone, newPassword } = await req.json()

    if (!phone || !newPassword || newPassword.length < 6) {
      return new Response(
        JSON.stringify({ error: '전화번호와 새 비밀번호(6자 이상)를 입력해주세요' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 서비스 롤 키로 Admin 클라이언트 생성
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 전화번호 → 가상 이메일 변환 (앱과 동일한 규칙)
    const digits = phone.replace(/[^0-9]/g, '')
    const fakeEmail = digits + '@schedulemateapp.com'

    // 해당 이메일의 사용자 조회
    const { data: { users }, error: listErr } = await supabase.auth.admin.listUsers({
      perPage: 1000
    })

    if (listErr) {
      console.error('listUsers error:', listErr)
      return new Response(
        JSON.stringify({ error: '사용자 조회 실패: ' + listErr.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const user = users.find(u => u.email === fakeEmail)

    if (!user) {
      return new Response(
        JSON.stringify({ error: '가입되지 않은 전화번호입니다' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 비밀번호 변경
    const { error: updateErr } = await supabase.auth.admin.updateUserById(user.id, {
      password: newPassword
    })

    if (updateErr) {
      console.error('updateUser error:', updateErr)
      return new Response(
        JSON.stringify({ error: '비밀번호 변경 실패: ' + updateErr.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`Password reset for ${fakeEmail} (${user.id})`)

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (e: any) {
    console.error('Unexpected error:', e)
    return new Response(
      JSON.stringify({ error: e?.message || '서버 오류가 발생했습니다' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
