const need = (k: string) => {
  const v = process.env[k]
  if (!v) throw new Error(`missing ${k} in .env`)
  return v
}

export const env = {
  api: need('API_URL').replace(/\/$/, ''),
  adminKey: need('ADMIN_KEY'),
  buyerEmail: need('SANDBOX_PERSONAL_EMAIL'),
  buyerPass: need('SANDBOX_PERSONAL_PASS'),
  headless: process.env.HEADLESS !== '0', // HEADLESS=0 → watch browser
  payoutMin: 500_000, // = server PAYOUT_MIN_MICROS
}
