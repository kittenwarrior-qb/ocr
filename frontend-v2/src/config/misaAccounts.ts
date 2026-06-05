export const FIXED_MISA_ACCOUNTS = [
  {
    code: 'MONGTHUY',
    initials: 'MT',
    name: 'Hà Mộng Thúy',
    email: 'sa-mt@satoricompany.vn',
  },
  {
    code: 'DUYANHTEST',
    initials: 'DA',
    name: 'Duy Ánh',
    email: 'huynhduyanh01011996@gmail.com',
  },
  {
    code: 'NGOCTHANG',
    initials: 'NT',
    name: 'Ngọc Thắng',
    email: '',
  },
  {
    code: 'NGOCNHI',
    initials: 'NN',
    name: 'Ngọc Nhi',
    email: '',
  },
]

export const FIXED_MISA_ACCOUNT_CODES = FIXED_MISA_ACCOUNTS.map(account => account.code)

export function normalizeMisaAppId(value: string) {
  return value.trim().toUpperCase()
}
