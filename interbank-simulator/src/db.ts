import Database from 'better-sqlite3'
import path from 'path'

const DB_PATH = path.join(import.meta.dirname, '../../data/other-bank.db')

const db = new Database(DB_PATH)
db.pragma('journal_mode = WAL')

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

export type Account = {
  account_id:     string
  account_number: string
  account_holder: string
  balance:        number
}

export type Transaction = {
  transaction_id:      string
  from_bank_code:      string
  from_account_number: string
  to_account_number:   string
  amount:              number
  memo:                string | null
  status:              string
  created_at:          string
}

export function findAccount(accountNumber: string): Account | undefined {
  return db
    .prepare('SELECT * FROM accounts WHERE account_number = ?')
    .get(accountNumber) as Account | undefined
}

export function creditAccount(accountNumber: string, amount: number) {
  db.prepare('UPDATE accounts SET balance = balance + ? WHERE account_number = ?')
    .run(amount, accountNumber)
}

export function recordTransaction(params: {
  transactionId:     string
  fromBankCode:      string
  fromAccountNumber: string
  toAccountNumber:   string
  amount:            number
  memo:              string | null
  status:            string
  createdAt:         string
}) {
  db.prepare(`
    INSERT INTO transactions
      (transaction_id, from_bank_code, from_account_number, to_account_number, amount, memo, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    params.transactionId,
    params.fromBankCode,
    params.fromAccountNumber,
    params.toAccountNumber,
    params.amount,
    params.memo,
    params.status,
    params.createdAt,
  )
}

export function listTransactions(params?: { limit?: number; status?: string }): Transaction[] {
  const limit = params?.limit ?? 50
  if (params?.status) {
    return db
      .prepare('SELECT * FROM transactions WHERE status = ? ORDER BY created_at DESC LIMIT ?')
      .all(params.status, limit) as Transaction[]
  }
  return db
    .prepare('SELECT * FROM transactions ORDER BY created_at DESC LIMIT ?')
    .all(limit) as Transaction[]
}

export function listAccounts(): Account[] {
  return db
    .prepare('SELECT * FROM accounts ORDER BY account_number')
    .all() as Account[]
}

export default db
