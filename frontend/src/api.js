const BASE = '/api/v1'

async function req(path, opts = {}) {
  const res = await fetch(BASE + path, {
    headers: { 'Content-Type': 'application/json', ...opts.headers },
    ...opts,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || `HTTP ${res.status}`)
  }
  return res.json()
}

// Dashboard
export const getDashboard = () => req('/settings/dashboard')

// Sessions
export const getSessions = () => req('/sessions')
export const createSession = (body) => req('/sessions', { method: 'POST', body: JSON.stringify(body) })
export const closeSession = (id) => req(`/sessions/${id}/close`, { method: 'POST' })
export const reopenSession = (id) => req(`/sessions/${id}/reopen`, { method: 'POST' })
export function exportSession(id, name) {
  return fetch(`${BASE}/sessions/${id}/export`).then(async r => {
    if (!r.ok) throw new Error('Export failed')
    const blob = await r.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url
    a.download = `phien_${name || id}.xlsx`; a.click()
    URL.revokeObjectURL(url)
  })
}

// Documents
export function uploadDocument(file, sessionId) {
  const form = new FormData()
  form.append('file', file)
  if (sessionId) form.append('session_id', sessionId)
  return fetch(BASE + '/documents/upload', { method: 'POST', body: form }).then(async r => {
    if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.detail || 'Upload failed') }
    return r.json()
  })
}

export function uploadBatch(files, sessionId) {
  const form = new FormData()
  files.forEach(f => form.append('files', f))
  if (sessionId) form.append('session_id', sessionId)
  return fetch(BASE + '/documents/upload-batch', { method: 'POST', body: form }).then(async r => {
    if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.detail || 'Upload failed') }
    return r.json()
  })
}

export const getQueueStatus = () => req('/documents/queue-status')
export const getRawDocuments = () => req('/documents/raw')
export const getRawDocument = (id) => req(`/documents/raw/${id}`)
export const reprocessDocument = (id) => req(`/documents/raw/${id}/reprocess`, { method: 'POST' })
export const overrideDocType = (id, document_type) =>
  req(`/documents/raw/${id}/override-type`, { method: 'POST', body: JSON.stringify({ document_type }) })

// Orders
export const getOrders = (status) => req(`/documents/orders${status ? `?status=${status}` : ''}`)
export const getOrder = (id) => req(`/documents/orders/${id}`)
export const completeOrder = (id) => req(`/documents/orders/${id}/complete`, { method: 'POST' })

// Bills
export const getBills = (status) => req(`/documents/bills${status ? `?status=${status}` : ''}`)
export const getBill = (id) => req(`/documents/bills/${id}`)
export const completeBill = (id) => req(`/documents/bills/${id}/complete`, { method: 'POST' })

// Mappings
export const getPendingMappings = () => req('/mappings/pending')
export const getAllMappings = () => req('/mappings/all')
export const mapTempCode = (tempCode, body) =>
  req(`/mappings/${encodeURIComponent(tempCode)}/map`, { method: 'POST', body: JSON.stringify(body) })
export const getSuggestions = (tempCode) =>
  req(`/mappings/${encodeURIComponent(tempCode)}/suggestions`)

// Products
export const getProducts = (search = '') =>
  req(`/products${search ? `?search=${encodeURIComponent(search)}` : ''}`)
export const createProduct = (body) => req('/products', { method: 'POST', body: JSON.stringify(body) })
export const updateProduct = (id, body) => req(`/products/${id}`, { method: 'PATCH', body: JSON.stringify(body) })

// Partners
export const getPartners = (type) => req(`/partners${type ? `?partner_type=${type}` : ''}`)
export const updatePartner = (id, body) => req(`/partners/${id}`, { method: 'PATCH', body: JSON.stringify(body) })

// Templates
export const getTemplates = () => req('/templates')
export const getTemplate = (id) => req(`/templates/${id}`)
export const createTemplate = (body) => req('/templates', { method: 'POST', body: JSON.stringify(body) })
export const updateTemplate = (id, body) => req(`/templates/${id}`, { method: 'PATCH', body: JSON.stringify(body) })
export const deactivateTemplate = (id) => req(`/templates/${id}`, { method: 'DELETE' })
export function testTemplate(id, file) {
  const form = new FormData()
  form.append('file', file)
  return fetch(`${BASE}/templates/${id}/test`, { method: 'POST', body: form }).then(async r => {
    if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.detail || 'Test failed') }
    return r.json()
  })
}
export const getPartnerSearch = (search) => req(`/partners?search=${encodeURIComponent(search)}&limit=20`)
export function suggestTemplate(file) {
  const form = new FormData()
  form.append('file', file)
  return fetch(`${BASE}/templates/suggest`, { method: 'POST', body: form }).then(async r => {
    if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.detail || 'Suggest failed') }
    return r.json()
  })
}

// Settings
export const getConfigs = () => req('/settings/configs')
export const updatePrefixes = (body) => req('/settings/prefixes', { method: 'PATCH', body: JSON.stringify(body) })
export const updateSMTP = (body) => req('/settings/smtp', { method: 'PATCH', body: JSON.stringify(body) })

// Exports
export const exportOrder = (id, fmt = 'misa') =>
  fetch(`${BASE}/exports/orders/${id}?fmt=${fmt}`).then(async r => {
    if (!r.ok) throw new Error('Export failed')
    const blob = await r.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url
    a.download = `order_${id}_${fmt}.xlsx`; a.click()
    URL.revokeObjectURL(url)
  })

export const exportBill = (id, fmt = 'misa') =>
  fetch(`${BASE}/exports/bills/${id}?fmt=${fmt}`).then(async r => {
    if (!r.ok) throw new Error('Export failed')
    const blob = await r.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url
    a.download = `bill_${id}_${fmt}.xlsx`; a.click()
    URL.revokeObjectURL(url)
  })
