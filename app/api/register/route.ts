import { NextRequest, NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { prisma } from "@/lib/prisma"

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { partyType, partyName, loginId, password, residentNo, phone, email, businessRegNo, representativeName } = body

  if (!partyName?.trim() || !loginId?.trim() || !password) {
    return NextResponse.json({ error: "필수 항목을 모두 입력해주세요." }, { status: 400 })
  }
  if (loginId.length < 4 || loginId.length > 20) {
    return NextResponse.json({ error: "아이디는 4~20자로 입력해주세요." }, { status: 400 })
  }
  if (!/^[a-zA-Z0-9_]+$/.test(loginId)) {
    return NextResponse.json({ error: "아이디는 영문, 숫자, 밑줄(_)만 사용할 수 있습니다." }, { status: 400 })
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "비밀번호는 8자 이상이어야 합니다." }, { status: 400 })
  }

  const existing = await prisma.partyAuth.findUnique({ where: { loginId } })
  if (existing) {
    return NextResponse.json({ error: "이미 사용 중인 아이디입니다." }, { status: 409 })
  }

  const passwordHash = await bcrypt.hash(password, 12)

  if (partyType === "INDIVIDUAL") {
    if (!residentNo) {
      return NextResponse.json({ error: "주민등록번호를 입력해주세요." }, { status: 400 })
    }
    const ci = residentNo.replace(/-/g, "")
    if (ci.length !== 13 || !/^\d+$/.test(ci)) {
      return NextResponse.json({ error: "주민등록번호 형식이 올바르지 않습니다. (예: 900101-1234567)" }, { status: 400 })
    }

    await prisma.$transaction(async (tx) => {
      const party = await tx.party.create({
        data: { partyName: partyName.trim(), partyRole: "INDIVIDUAL", partyStatus: "ACTIVE" },
      })
      await tx.individual.create({
        data: {
          partyId: party.partyId,
          individualCi: ci,
          individualPhone: phone?.trim() || null,
          individualEmail: email?.trim() || null,
          individualStatus: "ACTIVE",
        },
      })
      await tx.partyAuth.create({
        data: { partyId: party.partyId, loginId, passwordHash, partyAuthStatus: "ACTIVE" },
      })
    })
  } else {
    if (!businessRegNo) {
      return NextResponse.json({ error: "사업자등록번호를 입력해주세요." }, { status: 400 })
    }
    const brn = businessRegNo.replace(/-/g, "")
    if (brn.length !== 10 || !/^\d+$/.test(brn)) {
      return NextResponse.json({ error: "사업자등록번호 형식이 올바르지 않습니다. (예: 123-45-67890)" }, { status: 400 })
    }

    await prisma.$transaction(async (tx) => {
      const party = await tx.party.create({
        data: { partyName: partyName.trim(), partyRole: "CORPORATE", partyStatus: "ACTIVE" },
      })
      await tx.corporate.create({
        data: { partyId: party.partyId, businessRegNo, representativeName: representativeName?.trim() || null },
      })
      await tx.partyAuth.create({
        data: { partyId: party.partyId, loginId, passwordHash, partyAuthStatus: "ACTIVE" },
      })
    })
  }

  return NextResponse.json({ success: true })
}
