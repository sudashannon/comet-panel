import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SettingsPanel } from './SettingsPanel'
import { fetchChatConfig, updateChatConfig, fetchChatProviders } from '../api/client'

vi.mock('../api/client', () => ({
  fetchChatProviders: vi.fn(),
  fetchChatConfig: vi.fn(),
  updateChatConfig: vi.fn(),
}))

describe('SettingsPanel', () => {
  beforeEach(() => {
    vi.mocked(fetchChatProviders).mockReset()
    vi.mocked(fetchChatConfig).mockReset()
    vi.mocked(updateChatConfig).mockReset()

    vi.mocked(fetchChatProviders).mockResolvedValue({
      active: 'anthropic',
      providers: [{ name: 'anthropic', models: ['claude-3-5-sonnet', 'claude-3-opus'], supports_images: true }],
    })
    vi.mocked(fetchChatConfig).mockResolvedValue({
      active_provider: 'anthropic',
      providers: {
        anthropic: {
          api_key: 'sk-c****umMM',
          api_base: '',
          model: 'claude-3-5-sonnet',
          temperature: 0.7,
          max_tokens: 4096,
          thinking: 'auto',
        },
      },
    })
    vi.mocked(updateChatConfig).mockResolvedValue({
      active_provider: 'anthropic',
      providers: {
        anthropic: {
          api_key: 'sk-c****umMM',
          api_base: '',
          model: 'claude-3-opus',
          temperature: 0.7,
          max_tokens: 4096,
          thinking: 'auto',
        },
      },
    })
  })

  it('loads and shows provider/model/apiKey fields', async () => {
    render(<SettingsPanel onClose={() => {}} />)

    await waitFor(() => expect(fetchChatProviders).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(fetchChatConfig).toHaveBeenCalledTimes(1))

    expect(screen.getByTestId('chat-settings-panel')).toBeTruthy()
    await waitFor(() => expect((screen.getByTestId('chat-settings-provider') as HTMLSelectElement).value).toBe('anthropic'))
    expect((screen.getByTestId('chat-settings-model') as HTMLSelectElement).value).toBe('claude-3-5-sonnet')
    expect((screen.getByTestId('chat-settings-api-key') as HTMLInputElement).placeholder).toBe('sk-c****umMM')
    expect((screen.getByTestId('chat-settings-temperature') as HTMLInputElement).value).toBe('0.7')
    expect((screen.getByTestId('chat-settings-max-tokens') as HTMLInputElement).value).toBe('4096')
  })

  it('save calls updateChatConfig and closes on success', async () => {
    const onClose = vi.fn()
    render(<SettingsPanel onClose={onClose} />)

    await waitFor(() => expect(screen.getByTestId('chat-settings-panel')).toBeTruthy())
    await waitFor(() => expect((screen.getByTestId('chat-settings-provider') as HTMLSelectElement).value).toBe('anthropic'))

    fireEvent.change(screen.getByTestId('chat-settings-model'), { target: { value: 'claude-3-opus' } })
    await act(async () => {
      fireEvent.click(screen.getByTestId('chat-settings-save'))
    })

    await waitFor(() => expect(updateChatConfig).toHaveBeenCalledTimes(1))
    const patch = vi.mocked(updateChatConfig).mock.calls[0][0]
    expect(patch).toEqual({
      active_provider: 'anthropic',
      providers: {
        anthropic: {
          model: 'claude-3-opus',
          temperature: 0.7,
          max_tokens: 4096,
          thinking: 'auto',
        },
      },
    })
    expect(patch.providers?.anthropic).not.toHaveProperty('api_key')
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
  })

  it('typing a new api_key sends it in the patch', async () => {
    render(<SettingsPanel onClose={() => {}} />)

    await waitFor(() => expect(screen.getByTestId('chat-settings-panel')).toBeTruthy())
    await waitFor(() => expect((screen.getByTestId('chat-settings-provider') as HTMLSelectElement).value).toBe('anthropic'))

    fireEvent.change(screen.getByTestId('chat-settings-api-key'), { target: { value: 'sk-newkey123' } })
    await act(async () => {
      fireEvent.click(screen.getByTestId('chat-settings-save'))
    })

    await waitFor(() => expect(updateChatConfig).toHaveBeenCalledTimes(1))
    const patch = vi.mocked(updateChatConfig).mock.calls[0][0]
    expect(patch.providers?.anthropic?.api_key).toBe('sk-newkey123')
  })

  it('cancel button calls onClose without saving', async () => {
    const onClose = vi.fn()
    render(<SettingsPanel onClose={onClose} />)

    await waitFor(() => expect(screen.getByTestId('chat-settings-panel')).toBeTruthy())
    fireEvent.click(screen.getByTestId('chat-settings-cancel'))

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(updateChatConfig).not.toHaveBeenCalled()
  })
})
