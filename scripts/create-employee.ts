import bcrypt from 'bcryptjs'
import { prisma } from '../lib/prisma'

async function main() {
  const hash = await bcrypt.hash('Employee1!', 12)

  await prisma.$transaction(async (tx) => {
    // 1. 지점
    const branch = await tx.branch.upsert({
      where: { branchCode: '100' },
      create: {
        branchCode: '100',
        branchName: 'KB국민은행 본점',
        branchType: 'HEAD',
        branchStatus: 'ACTIVE',
        branchAddress: '서울특별시 중구 을지로 26',
        branchPhone: '02-2073-7114',
        openedDate: '19631214',
      },
      update: {},
    })

    // 2. Party + Individual + PartyAuth + Employee 한 번에
    const party = await tx.party.create({
      data: {
        partyNo: 'EMP-2026-0001',
        partyName: '김직원',
        partyRole: 'INDIVIDUAL',
        partyStatus: 'ACTIVE',
        individual: {
          create: {
            individualPhone: '010-9999-1234',
            individualEmail: 'staff@kbbank.com',
            individualCi: 'EMP_CI_20260001',
            individualStatus: 'ACTIVE',
          },
        },
        partyAuth: {
          create: {
            loginId: 'employee',
            passwordHash: hash,
            partyAuthStatus: 'ACTIVE',
          },
        },
        employee: {
          create: {
            branchId: branch.branchId,
            employeeNo: 'E2026001',
            employeeName: '김직원',
            department: '개인금융부',
            position: '대리',
            employeeEmail: 'staff@kbbank.com',
            employeePhone: '02-2073-1234',
            employeeStatus: 'ACTIVE',
            hiredDate: new Date('2024-03-01'),
          },
        },
      },
    })

    console.log('\n✅ 직원 계정 생성 완료')
    console.log('  party_id  :', party.partyId)
    console.log('  로그인 ID : employee')
    console.log('  비밀번호  : Employee1!')
    console.log('  이름      : 김직원 (개인금융부 대리)')
    console.log('  지점      :', branch.branchName)
  })
}

main()
  .catch((e) => { console.error('❌ 실패:', e.message); process.exit(1) })
  .finally(() => prisma.$disconnect())
