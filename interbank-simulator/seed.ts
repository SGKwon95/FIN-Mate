/**
 * 타행 시뮬레이터 DB 시드
 * 실행: npx tsx interbank-simulator/seed.ts
 */
import Database from 'better-sqlite3'
import path from 'path'
import { randomUUID } from 'crypto'
import fs from 'fs'

const DATA_DIR = path.join(import.meta.dirname, '../data')
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })

const db = new Database(path.join(DATA_DIR, 'other-bank.db'))

db.exec(`
  CREATE TABLE IF NOT EXISTS accounts (
    account_id     TEXT PRIMARY KEY,
    account_number TEXT UNIQUE NOT NULL,
    account_holder TEXT NOT NULL,
    balance        REAL NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS transactions (
    transaction_id      TEXT PRIMARY KEY,
    from_bank_code      TEXT NOT NULL,
    from_account_number TEXT NOT NULL,
    to_account_number   TEXT NOT NULL,
    amount              REAL NOT NULL,
    memo                TEXT,
    status              TEXT NOT NULL,
    created_at          TEXT NOT NULL
  );
`)

const accounts = [
  { number: '3020000000001', holder: '김신한', balance: 5_000_000 },
  { number: '3020000000002', holder: '이신한', balance: 2_000_000 },
  { number: '0200000000001', holder: '박우리', balance: 3_500_000 },
  { number: '0200000000002', holder: '최우리', balance: 1_200_000 },
  { number: '0880000000001', holder: '정하나', balance: 8_000_000 },
  { number: '0880000000002', holder: '강하나', balance: 500_000  },
]

const insert = db.prepare(
  'INSERT OR IGNORE INTO accounts (account_id, account_number, account_holder, balance) VALUES (?, ?, ?, ?)'
)

for (const acc of accounts) {
  insert.run(randomUUID(), acc.number, acc.holder, acc.balance)
}

const rows = db.prepare('SELECT account_number, account_holder, balance FROM accounts').all() as {
  account_number: string
  account_holder: string
  balance: number
}[]

console.log('타행 계좌 시드 완료:')
for (const row of rows) {
  console.log(`  ${row.account_number}  ${row.account_holder}  ${row.balance.toLocaleString('ko-KR')}원`)
}

db.close()
