// Nguồn dùng chung cho "Người thực hiện" (owner_name) và "Nhân viên bán hàng"
// (custom_field4) — đảm bảo form Khách hàng dùng đúng danh sách như khi tạo đơn hàng.

// Người thực hiện → MISA owner_name
export const DEFAULT_SALESPERSON = 'Hà Mộng Thúy (KM0139)'
export const SALESPERSON_VALUES = [
  'Đỗ Thị Mỹ Dung (ar-km@satoricompany.vn)',
  'Hà Mộng Thúy (KM0139)',
  'Lê Thị Hồng Hân (KM1602)',
  'Nguyễn Thị Ngọc Thắng (KM0115)',
  'Nguyễn Thị Tuyến (tuyen.nguyen@satoricompany.vn)',
  'TRẦN MINH QUỐC (quoc.tran@satoricompany.vn)',
  'Trần Ngọc Nhi (KM1847)',
  'Trương Thanh Vũ (ktth@satoricompany.vn)',
]
export const SALESPERSON_OPTIONS = SALESPERSON_VALUES.map(v => ({ value: v, label: v }))

// Nhân viên bán hàng → MISA custom_field4
export const DEFAULT_NV = 'KM1989-Nguyễn Văn Ân'
export const NV_VALUES = [
  'Trần Hữu Thành',
  'Võ Chí Thông',
  'KM1989-Nguyễn Văn Ân',
  'KD0209-Lê Văn Vinh',
  'KD0045-Nguyễn Đình Việt',
  'KD0003-Nguyễn Thị Mai Hân',
  'KM1349-Mai Tiến Hợp',
  'KD0002-Nguyễn Huỳnh Sơn',
  'KD0217-Nguyễn Thị Như Thảo',
  'KM4048-Lê Ngân Vương',
  'KM1753-Cao Viết Thắng',
  'KD0092-Đỗ Thành Công',
  'KM0189-Doãn Thị Ngư',
]
export const NV_OPTIONS = NV_VALUES.map(v => ({ value: v, label: v }))
