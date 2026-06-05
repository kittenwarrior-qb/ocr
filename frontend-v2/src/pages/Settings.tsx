import { useEffect, useState } from 'react'
import { Alert, Button, Card, Input, Space, Tag, message } from 'antd'
import {
  ApiOutlined,
  CheckCircleOutlined,
  CopyOutlined,
  ExclamationCircleOutlined,
  SaveOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons'
import client from '@/api/client'

export default function SettingsPage() {
  const [appId, setAppId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [maskedSecret, setMaskedSecret] = useState('')
  const [hasClientSecret, setHasClientSecret] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [copyingSecret, setCopyingSecret] = useState(false)

  const loadSettings = () => {
    client.get('/settings/misa').then(r => {
      setAppId(r.data.app_id || '')
      setMaskedSecret(r.data.client_secret_masked || '')
      setHasClientSecret(Boolean(r.data.has_client_secret))
    }).catch(() => {})
  }

  useEffect(() => { loadSettings() }, [])

  const handleSave = async () => {
    if (!appId.trim()) {
      message.warning('Vui lòng nhập App ID MISA')
      return
    }
    if (!clientSecret.trim() && !hasClientSecret) {
      message.warning('Vui lòng nhập Secret MISA')
      return
    }

    setSaving(true)
    try {
      const payload: Record<string, string> = { app_id: appId.trim() }
      if (clientSecret.trim()) payload.client_secret = clientSecret.trim()
      await client.patch('/settings/misa', payload)
      message.success(`Đã lưu cấu hình MISA cho App ID: ${appId.trim()}`)
      window.dispatchEvent(new Event('misa-settings-updated'))
      setClientSecret('')
      loadSettings()
    } catch (e: any) {
      message.error(e?.response?.data?.detail || 'Lưu thất bại')
    } finally {
      setSaving(false)
    }
  }

  const handleTest = async () => {
    setTesting(true)
    try {
      const { data } = await client.get('/misa/account/token')
      message.success(`Kết nối MISA thành công với App ID: ${data.app_id || appId}`)
    } catch (e: any) {
      message.error(e?.response?.data?.detail || 'Không thể kết nối MISA')
    } finally {
      setTesting(false)
    }
  }

  const copyText = async (value: string) => {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value)
      return
    }

    const textarea = document.createElement('textarea')
    textarea.value = value
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    document.execCommand('copy')
    document.body.removeChild(textarea)
  }

  const handleCopySecret = async () => {
    setCopyingSecret(true)
    try {
      const { data } = await client.get('/settings/misa/secret')
      await copyText(data.client_secret)
      message.success('Đã copy Secret MISA')
    } catch (e: any) {
      message.error(e?.response?.data?.detail || 'Không copy được Secret MISA')
    } finally {
      setCopyingSecret(false)
    }
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-lg font-semibold text-slate-800 mb-6">Cài đặt kết nối MISA</h1>

      {(!appId || !hasClientSecret) && (
        <Alert
          type="warning"
          showIcon
          icon={<ExclamationCircleOutlined />}
          className="mb-4"
          message="Chưa đủ thông tin MISA"
          description="Nhập App ID và Secret để backend lấy token MISA tự động."
        />
      )}

      <Card>
        <div className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">App ID MISA</label>
            <Input
              prefix={<ApiOutlined className="text-slate-400" />}
              placeholder="Nhập App ID"
              value={appId}
              onChange={e => setAppId(e.target.value)}
              size="large"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Secret MISA</label>
            <div className="flex items-center gap-2 mb-2">
              {hasClientSecret
                ? <Tag color="success" icon={<CheckCircleOutlined />}>Đã cấu hình</Tag>
                : <Tag color="error">Chưa có secret</Tag>}
              {maskedSecret && <span className="text-xs text-slate-400 font-mono">{maskedSecret}</span>}
              {hasClientSecret && (
                <Button
                  size="small"
                  icon={<CopyOutlined />}
                  onClick={handleCopySecret}
                  loading={copyingSecret}
                >
                  Copy secret
                </Button>
              )}
            </div>
            <Input.Password
              prefix={<SafetyCertificateOutlined className="text-slate-400" />}
              placeholder={hasClientSecret ? 'Để trống nếu không đổi secret' : 'Nhập Secret MISA'}
              value={clientSecret}
              onChange={e => setClientSecret(e.target.value)}
              size="large"
            />
            <p className="text-xs text-slate-400 mt-1.5">
              Khi cần đổi secret, dán secret mới vào ô này rồi bấm lưu. Để trống thì backend giữ secret hiện tại.
            </p>
          </div>

          <Space className="w-full" direction="vertical" size={10}>
            <Button type="primary" icon={<SaveOutlined />} onClick={handleSave} loading={saving} size="large" block>
              Lưu cấu hình MISA
            </Button>
            <Button icon={<ApiOutlined />} onClick={handleTest} loading={testing} size="large" block>
              Kiểm tra kết nối
            </Button>
          </Space>
        </div>
      </Card>
    </div>
  )
}
