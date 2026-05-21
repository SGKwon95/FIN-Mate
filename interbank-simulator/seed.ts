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
    account_id       TEXT PRIMARY KEY,
    account_number   TEXT UNIQUE NOT NULL,
    account_holder   TEXT NOT NULL,
    account_type     TEXT NOT NULL DEFAULT 'DEMAND_DEPOSIT',
    account_purpose  TEXT NOT NULL DEFAULT 'GENERAL',
    account_status   TEXT NOT NULL DEFAULT 'ACTIVE',
    balance          REAL NOT NULL DEFAULT 0,
    interest_rate    REAL NOT NULL DEFAULT 0,
    currency_code    TEXT NOT NULL DEFAULT 'KRW',
    opened_at        TEXT,
    created_at       TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS transactions (
    transaction_id             TEXT PRIMARY KEY,
    account_id                 TEXT,
    transaction_type           TEXT NOT NULL DEFAULT 'TRANSFER_IN',
    amount                     REAL NOT NULL,
    balance_before             REAL,
    balance_after              REAL,
    from_bank_code             TEXT,
    from_account_number        TEXT,
    to_account_number          TEXT,
    counterpart_bank_code      TEXT,
    counterpart_account_number TEXT,
    counterpart_name           TEXT,
    remark                     TEXT,
    memo                       TEXT,
    instruction_id             TEXT,
    status                     TEXT NOT NULL DEFAULT 'COMPLETED',
    transacted_at              TEXT NOT NULL DEFAULT (datetime('now')),
    created_at                 TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS transfer_instruction (
    instruction_id        TEXT PRIMARY KEY,
    instruction_type      TEXT NOT NULL,
    transfer_scope        TEXT,
    clearing_network      TEXT,
    network_seq_no        TEXT,
    network_response_code TEXT,
    bank_response_code    TEXT,
    instruction_status    TEXT NOT NULL DEFAULT 'PENDING',
    total_count           INTEGER,
    success_count         INTEGER NOT NULL DEFAULT 0,
    failed_count          INTEGER NOT NULL DEFAULT 0,
    total_amount          REAL,
    submitted_by          TEXT,
    executed_at           TEXT,
    remark                TEXT,
    created_at            TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at            TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS kftc_receipt (
    receipt_id       TEXT PRIMARY KEY,
    instruction_id   TEXT NOT NULL,
    rsp_code         TEXT NOT NULL,
    rsp_message      TEXT,
    bank_rsp_code    TEXT,
    bank_rsp_message TEXT,
    fintech_use_num  TEXT,
    bank_tran_id     TEXT,
    received_at      TEXT NOT NULL DEFAULT (datetime('now')),
    created_at       TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
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
