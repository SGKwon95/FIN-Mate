import { NextRequest, NextResponse } from 'next/server'
import { spawn, type ChildProcess } from 'child_process'

const g = globalThis as typeof globalThis & { _kafkaProc?: ChildProcess }

function isRunning() {
  return !!g._kafkaProc && g._kafkaProc.exitCode === null
}

export async function GET() {
  return NextResponse.json({ running: isRunning(), pid: g._kafkaProc?.pid ?? null })
}

export async function POST(req: NextRequest) {
  const { action } = await req.json()

  if (action === 'start') {
    if (isRunning()) return NextResponse.json({ ok: false, message: '이미 실행 중입니다.' })

    const proc = spawn('npm', ['run', 'kafka:all'], {
      cwd: process.cwd(),
      stdio: 'ignore',
      shell: true,
      detached: true,  // 별도 프로세스 그룹 생성 → -pgid로 전체 종료 가능
    })
    g._kafkaProc = proc
    proc.on('exit', () => { g._kafkaProc = undefined })

    return NextResponse.json({ ok: true, pid: proc.pid })
  }

  if (action === 'stop') {
    if (!isRunning()) return NextResponse.json({ ok: false, message: '실행 중이 아닙니다.' })

    try {
      // 음수 PID = 프로세스 그룹 전체에 SIGTERM (shell → npm → concurrently → tsx 모두 종료)
      process.kill(-g._kafkaProc!.pid!, 'SIGTERM')
    } catch {
      g._kafkaProc!.kill('SIGTERM')
    }
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'unknown action' }, { status: 400 })
}
