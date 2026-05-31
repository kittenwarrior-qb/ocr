import { useState, useEffect } from 'react'
import { Input, Button, Select, message, Card, Tag, Alert } from 'antd'
import { KeyOutlined, SaveOutlined, CheckCircleOutlined, ExclamationCircleOutlined } from '@ant-design/icons'
import client from '@/api/client'

const MODELS = [
  { value: 'google/gemini-2.5-flash', label: 'Google Gemini 2.5 Flash (khuyến nghị)' },
  { value: 'google/gemini-2.0-flash-001', label: 'Google Gemini 2.0 Flash' },
  { value: 'anthropic/claude-sonnet-4', label: 'Claude Sonnet 4' },
  { value: 'openai/gpt-4o', label: 'GPT-4o' },
  { value: 'openai/gpt-4o-mini', label: 'GPT-4o Mini' },
]

export default function SettingsPage() {
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState('google/gemini-2.5-flash')
  const [maskedKey, setMaskedKey] = useState('')
  const [hasKey, setHasKey] = useState(false)
  const [saving, setSaving] = useState(false)

  const loadSettings = () => {
    client.get('/settings/ocr').then(r => {
      setMaskedKey(r.data.api_key_masked)
      setModel(r.data.model)
      setHasKey(r.data.has_key)
    }).catch(() => {})
  }

  useEffect(() => { loadSettings() }, [])

  const handleSave = async () => {
    if (!apiKey.trim() && !hasKey) {
      message.warning('Vui lòng nhập API key')
      return
    }
    setSaving(true)
    try {
      const payload: Record<string, string> = { model }
      if (apiKey.trim()) payload.api_key = apiKey.trim()
      await client.patch('/settings/ocr', payload)
      message.success('Đã lưu cài đặt OCR')
      setApiKey('')
      loadSettings()
    } catch (e: any) {
      message.error(e?.response?.data?.detail || 'Lưu thất bại')
    }
    setSaving(false)
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-lg font-semibold text-slate-800 mb-6">Cài đặt OCR</h1>

      {!hasKey && (
        <Alert type="warning" showIcon icon={<ExclamationCircleOutlined />} className="mb-4"
          message="Chưa có API key" description="Nhập OpenRouter API key để sử dụng chức năng OCR đọc PDF." />
      )}

      <Card>
        <div className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">API Key (OpenRouter)</label>
            <div className="flex items-center gap-2 mb-2">
              {hasKey ? <Tag color="success" icon={<CheckCircleOutlined />}>Đã cấu hình</Tag> : <Tag color="error">Chưa có key</Tag>}
              {maskedKey && <span className="text-xs text-slate-400 font-mono">{maskedKey}</span>}
            </div>
            <Input.Password
              prefix={<KeyOutlined className="text-slate-400" />}
              placeholder="sk-or-v1-... (nhập key mới để thay đổi)"
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              size="large"
            />
            <p className="text-xs text-slate-400 mt-1.5">
              Lấy key tại <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer" className="text-blue-500 hover:underline">openrouter.ai/keys</a>.
              Key cần có credit (nạp tiền) để sử dụng.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Model OCR</label>
            <Select className="w-full" size="large" value={model} onChange={setModel} options={MODELS} />
            <p className="text-xs text-slate-400 mt-1.5">Model cần hỗ trợ vision (đọc hình ảnh/PDF). Gemini Flash nhanh và rẻ nhất.</p>
          </div>

          <Button type="primary" icon={<SaveOutlined />} onClick={handleSave} loading={saving} size="large" block>
            Lưu cài đặt
          </Button>
        </div>
      </Card>
    </div>
  )
}
