import Database from "better-sqlite3"
import path from "path"

const g = globalThis as unknown as { _otherBankDb?: Database.Database }

function getDb(): Database.Database {
  if (!g._otherBankDb) {
    g._otherBankDb = new Database(
      path.join(process.cwd(), "data", "other-bank.db"),
      { readonly: true }
    )
  }
  return g._otherBankDb
}

export function findOtherBankAccount(accountNumber: string): { account_holder: string } | undefined {
  return getDb()
    .prepare("SELECT account_holder FROM accounts WHERE account_number = ?")
    .get(accountNumber) as { account_holder: string } | undefined
}
