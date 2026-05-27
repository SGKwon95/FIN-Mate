import Database from 'better-sqlite3'
import path from 'path'
import { randomUUID } from 'crypto'

const DB_PATH = path.join(import.meta.dirname, '../../data/other-bank.db')

const db = new Database(DB_PATH)
db.pragma('journal_mode = WAL')

// ── 기본 테이블 (신규 설치 기준 전체 스키마) ──────────────────────────────
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
    created_at                 TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (instruction_id) REFERENCES transfer_instruction(instruction_id)
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
    updated_at       TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (instruction_id) REFERENCES transfer_instruction(instruction_id)
  );
`)

// ── 기존 DB 마이그레이션 (컬럼 추가) ──────────────────────────────────────
function addCol(table: string, col: string, definition: string) {
  try { db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${definition}`) } catch { /* already exists */ }
}

addCol('accounts', 'account_type',    "TEXT NOT NULL DEFAULT 'DEMAND_DEPOSIT'")
addCol('accounts', 'account_purpose', "TEXT NOT NULL DEFAULT 'GENERAL'")
addCol('accounts', 'account_status',  "TEXT NOT NULL DEFAULT 'ACTIVE'")
addCol('accounts', 'interest_rate',   'REAL NOT NULL DEFAULT 0')
addCol('accounts', 'currency_code',   "TEXT NOT NULL DEFAULT 'KRW'")
addCol('accounts', 'opened_at',  'TEXT')
addCol('accounts', 'created_at', 'TEXT')
addCol('accounts', 'updated_at', 'TEXT')

addCol('transactions', 'account_id',                 'TEXT')
addCol('transactions', 'transaction_type',            "TEXT DEFAULT 'TRANSFER_IN'")
addCol('transactions', 'balance_before',             'REAL')
addCol('transactions', 'balance_after',              'REAL')
addCol('transactions', 'counterpart_bank_code',      'TEXT')
addCol('transactions', 'counterpart_account_number', 'TEXT')
addCol('transactions', 'counterpart_name',           'TEXT')
addCol('transactions', 'remark',                     'TEXT')
addCol('transactions', 'instruction_id',             'TEXT')
addCol('transactions', 'transacted_at',              'TEXT')

// ── 타입 ──────────────────────────────────────────────────────────────────

export type Account = {
  account_id:      string
  account_number:  string
  account_holder:  string
  account_type:    string
  account_purpose: string
  account_status:  string
  balance:         number
  interest_rate:   number
  currency_code:   string
  opened_at:       string | null
  created_at:      string
  updated_at:      string
}

export type Transaction = {
  transaction_id:             string
  account_id:                 string | null
  transaction_type:           string
  amount:                     number
  balance_before:             number | null
  balance_after:              number | null
  from_bank_code:             string | null
  from_account_number:        string | null
  to_account_number:          string | null
  counterpart_bank_code:      string | null
  counterpart_account_number: string | null
  counterpart_name:           string | null
  remark:                     string | null
  memo:                       string | null
  instruction_id:             string | null
  status:                     string
  transacted_at:              string
  created_at:                 string
}

export type TransferInstruction = {
  instruction_id:        string
  instruction_type:      string
  transfer_scope:        string | null
  clearing_network:      string | null
  network_seq_no:        string | null
  network_response_code: string | null
  bank_response_code:    string | null
  instruction_status:    string
  total_count:           number | null
  success_count:         number
  failed_count:          number
  total_amount:          number | null
  submitted_by:          string | null
  executed_at:           string | null
  remark:                string | null
  created_at:            string
  updated_at:            string
}

export type KftcReceipt = {
  receipt_id:       string
  instruction_id:   string
  rsp_code:         string
  rsp_message:      string | null
  bank_rsp_code:    string | null
  bank_rsp_message: string | null
  fintech_use_num:  string | null
  bank_tran_id:     string | null
  received_at:      string
  created_at:       string
  updated_at:       string
}

// ── 계좌 ──────────────────────────────────────────────────────────────────

export function findAccount(accountNumber: string): Account | undefined {
  return db
    .prepare('SELECT * FROM accounts WHERE account_number = ?')
    .get(accountNumber) as Account | undefined
}

export function creditAccount(accountNumber: string, amount: number): { balanceBefore: number; balanceAfter: number } {
  const before = (db.prepare('SELECT balance FROM accounts WHERE account_number = ?').get(accountNumber) as { balance: number } | undefined)?.balance ?? 0
  db.prepare('UPDATE accounts SET balance = balance + ?, updated_at = ? WHERE account_number = ?')
    .run(amount, new Date().toISOString(), accountNumber)
  return { balanceBefore: before, balanceAfter: before + amount }
}

export function listAccounts(): Account[] {
  return db
    .prepare('SELECT * FROM accounts ORDER BY account_number')
    .all() as Account[]
}

// ── 거래 ──────────────────────────────────────────────────────────────────

export function recordTransaction(params: {
  transactionId:            string
  accountId?:               string | null
  transactionType?:         string
  amount:                   number
  balanceBefore?:           number | null
  balanceAfter?:            number | null
  fromBankCode?:            string | null
  fromAccountNumber?:       string | null
  toAccountNumber?:         string | null
  counterpartBankCode?:     string | null
  counterpartAccountNumber?: string | null
  counterpartName?:         string | null
  remark?:                  string | null
  memo?:                    string | null
  instructionId?:           string | null
  status:                   string
  transactedAt?:            string
  createdAt?:               string
}) {
  const now = new Date().toISOString()
  db.prepare(`
    INSERT INTO transactions (
      transaction_id, account_id, transaction_type, amount,
      balance_before, balance_after,
      from_bank_code, from_account_number, to_account_number,
      counterpart_bank_code, counterpart_account_number, counterpart_name,
      remark, memo, instruction_id, status, transacted_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    params.transactionId,
    params.accountId ?? null,
    params.transactionType ?? 'TRANSFER_IN',
    params.amount,
    params.balanceBefore ?? null,
    params.balanceAfter  ?? null,
    params.fromBankCode  ?? null,
    params.fromAccountNumber ?? null,
    params.toAccountNumber   ?? null,
    params.counterpartBankCode      ?? params.fromBankCode ?? null,
    params.counterpartAccountNumber ?? params.fromAccountNumber ?? null,
    params.counterpartName ?? null,
    params.remark    ?? null,
    params.memo      ?? null,
    params.instructionId ?? null,
    params.status,
    params.transactedAt ?? now,
    params.createdAt    ?? now,
  )
}

export function listTransactions(params?: { limit?: number; status?: string }): Transaction[] {
  const limit = params?.limit ?? 50
  if (params?.status) {
    return db
      .prepare('SELECT * FROM transactions WHERE status = ? ORDER BY transacted_at DESC LIMIT ?')
      .all(params.status, limit) as Transaction[]
  }
  return db
    .prepare('SELECT * FROM transactions ORDER BY transacted_at DESC LIMIT ?')
    .all(limit) as Transaction[]
}

// ── 실행지시 ───────────────────────────────────────────────────────────────

export function createInstruction(params: {
  instructionType:   string
  transferScope?:    string | null
  clearingNetwork?:  string | null
  networkSeqNo?:     string | null
  instructionStatus?: string
  totalCount?:       number | null
  totalAmount?:      number | null
  submittedBy?:      string | null
  executedAt?:       string | null
  remark?:           string | null
}): string {
  const id  = randomUUID()
  const now = new Date().toISOString()
  db.prepare(`
    INSERT INTO transfer_instruction (
      instruction_id, instruction_type, transfer_scope, clearing_network,
      network_seq_no, instruction_status, total_count, success_count, failed_count,
      total_amount, submitted_by, executed_at, remark, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    params.instructionType,
    params.transferScope    ?? null,
    params.clearingNetwork  ?? null,
    params.networkSeqNo     ?? null,
    params.instructionStatus ?? 'PENDING',
    params.totalCount       ?? 1,
    params.totalAmount      ?? null,
    params.submittedBy      ?? null,
    params.executedAt       ?? null,
    params.remark           ?? null,
    now, now,
  )
  return id
}

export function updateInstruction(instructionId: string, params: {
  instructionStatus:    string
  networkResponseCode?: string | null
  bankResponseCode?:    string | null
  successCount?:        number
  failedCount?:         number
}) {
  const now = new Date().toISOString()
  db.prepare(`
    UPDATE transfer_instruction
    SET instruction_status    = ?,
        network_response_code = ?,
        bank_response_code    = ?,
        success_count         = ?,
        failed_count          = ?,
        updated_at            = ?
    WHERE instruction_id = ?
  `).run(
    params.instructionStatus,
    params.networkResponseCode ?? null,
    params.bankResponseCode    ?? null,
    params.successCount        ?? (params.instructionStatus === 'COMPLETED' ? 1 : 0),
    params.failedCount         ?? (params.instructionStatus === 'FAILED'    ? 1 : 0),
    now,
    instructionId,
  )
}

export function listInstructions(params?: { limit?: number; status?: string }): TransferInstruction[] {
  const limit = params?.limit ?? 50
  if (params?.status) {
    return db
      .prepare('SELECT * FROM transfer_instruction WHERE instruction_status = ? ORDER BY created_at DESC LIMIT ?')
      .all(params.status, limit) as TransferInstruction[]
  }
  return db
    .prepare('SELECT * FROM transfer_instruction ORDER BY created_at DESC LIMIT ?')
    .all(limit) as TransferInstruction[]
}

// ── KFTC 수신이력 ──────────────────────────────────────────────────────────

export function createKftcReceipt(params: {
  instructionId:  string
  rspCode:        string
  rspMessage?:    string | null
  bankRspCode?:   string | null
  bankTranId?:    string | null
  receivedAt?:    string
}): string {
  const id  = randomUUID()
  const now = new Date().toISOString()
  db.prepare(`
    INSERT INTO kftc_receipt (
      receipt_id, instruction_id, rsp_code, rsp_message,
      bank_rsp_code, bank_tran_id, received_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    params.instructionId,
    params.rspCode,
    params.rspMessage  ?? null,
    params.bankRspCode ?? null,
    params.bankTranId  ?? null,
    params.receivedAt  ?? now,
    now, now,
  )
  return id
}

export function findInstructionIdByTransaction(transactionId: string): string | null {
  const row = db.prepare('SELECT instruction_id FROM transactions WHERE transaction_id = ?').get(transactionId) as { instruction_id: string | null } | undefined
  return row?.instruction_id ?? null
}

export function listKftcReceipts(params?: { limit?: number }): KftcReceipt[] {
  return db
    .prepare('SELECT * FROM kftc_receipt ORDER BY received_at DESC LIMIT ?')
    .all(params?.limit ?? 50) as KftcReceipt[]
}

export default db
