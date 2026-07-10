import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ChatBubble } from './ChatBubble'
import { streamChat, fetchChatSession, fetchChangeDetail, fetchChatConfig, updateChatConfig, fetchChatProviders } from '../api/client'

vi.mock('../api/client', () => ({
  streamChat: vi.fn(),
  fetchChatSession: vi.fn(),
  fetchChangeDetail: vi.fn(),
  fetchChatConfig: vi.fn(),
  updateChatConfig: vi.fn(),
  fetchChatProviders: vi.fn(),
}))

describe('ChatBubble', () => {
  beforeEach(() => {
    vi.mocked(streamChat).mockReset()
    vi.mocked(fetchChatSession).mockReset()
    vi.mocked(fetchChangeDetail).mockReset()
    vi.mocked(fetchChatConfig).mockReset()
    vi.mocked(updateChatConfig).mockReset()
    vi.mocked(fetchChatProviders).mockReset()
    // Default: no persisted history, so pre-existing tests (which never set
    // up fetchChatSession themselves) still start from an empty transcript.
    vi.mocked(fetchChatSession).mockResolvedValue({
      change: 'rx101-x',
      messages: [],
      context_files: [],
      usage: { total_input: 0, total_output: 0 },
      created_at: '',
      updated_at: '',
    })
    // Default: no artifacts, so pre-existing tests see an empty context-file
    // selector (and don't need to mock fetchChangeDetail themselves).
    vi.mocked(fetchChangeDetail).mockResolvedValue({
      name: 'rx101-x',
      workflow: '',
      phase: '',
      archived: false,
      tasksCompleted: 0,
      tasksTotal: 0,
      verifyResult: '',
      createdAt: '',
      phases: [],
    })
    // Default: single-provider config/provider list, so pre-existing tests
    // don't need to mock these themselves (settings panel is lazy-loaded).
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

  it('is collapsed by default and expands on click', async () => {
    render(<ChatBubble changeName="rx101-x" />)
    await waitFor(() => expect(fetchChatSession).toHaveBeenCalledWith('rx101-x'))
    expect(screen.queryByTestId('chat-overlay')).toBeNull()
    fireEvent.click(screen.getByTestId('chat-bubble-button'))
    expect(screen.getByTestId('chat-overlay')).toBeTruthy()
  })

  it('collapses again when the close button is clicked', async () => {
    render(<ChatBubble changeName="rx101-x" />)
    await waitFor(() => expect(fetchChatSession).toHaveBeenCalledWith('rx101-x'))
    fireEvent.click(screen.getByTestId('chat-bubble-button'))
    fireEvent.click(screen.getByTestId('chat-overlay-close'))
    expect(screen.queryByTestId('chat-overlay')).toBeNull()
  })

  it('sends a message via streamChat and renders accumulated delta text', async () => {
    vi.mocked(streamChat).mockImplementation(async (change, message, contextFiles, onEvent) => {
      expect(change).toBe('rx101-x')
      expect(message).toBe('hello there')
      expect(contextFiles).toEqual([])
      onEvent({ type: 'thinking', content: 'pondering...' })
      onEvent({ type: 'delta', content: 'Hi ' })
      onEvent({ type: 'delta', content: 'there!' })
      onEvent({ type: 'done' })
    })

    render(<ChatBubble changeName="rx101-x" />)
    fireEvent.click(screen.getByTestId('chat-bubble-button'))

    const textarea = screen.getByTestId('chat-input') as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: 'hello there' } })
    await act(async () => {
      fireEvent.click(screen.getByTestId('chat-send'))
    })

    await waitFor(() => expect(streamChat).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.getByTestId('chat-messages').textContent).toContain('Hi there!'))
    expect(screen.getByTestId('chat-messages').textContent).toContain('hello there')
  })

  it('shows an error message instead of hanging when streamChat rejects', async () => {
    vi.mocked(streamChat).mockRejectedValue(new Error('Anthropic API key not configured'))

    render(<ChatBubble changeName="rx101-x" />)
    fireEvent.click(screen.getByTestId('chat-bubble-button'))

    const textarea = screen.getByTestId('chat-input') as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: 'hi' } })
    await act(async () => {
      fireEvent.click(screen.getByTestId('chat-send'))
    })

    await waitFor(() =>
      expect(screen.getByTestId('chat-messages').textContent).toContain('Anthropic API key not configured'),
    )
  })

  it('loads persisted history on mount and renders it before any send', async () => {
    vi.mocked(fetchChatSession).mockResolvedValue({
      change: 'rx101-x',
      messages: [
        { role: 'user', content: [{ type: 'text', text: '之前的问题' }] },
        { role: 'assistant', content: [{ type: 'text', text: '之前的回答' }] },
      ],
      context_files: [],
      usage: { total_input: 10, total_output: 20 },
      created_at: '2026-07-01T00:00:00Z',
      updated_at: '2026-07-02T00:00:00Z',
    })

    render(<ChatBubble changeName="rx101-x" />)

    await waitFor(() => expect(fetchChatSession).toHaveBeenCalledWith('rx101-x'))
    fireEvent.click(screen.getByTestId('chat-bubble-button'))

    await waitFor(() => expect(screen.getByTestId('chat-messages').textContent).toContain('之前的问题'))
    expect(screen.getByTestId('chat-messages').textContent).toContain('之前的回答')
  })

  it('renders an empty transcript for a fresh change with no persisted history', async () => {
    vi.mocked(fetchChatSession).mockResolvedValue({
      change: 'brand-new-change',
      messages: [],
      context_files: [],
      usage: { total_input: 0, total_output: 0 },
      created_at: '',
      updated_at: '',
    })

    render(<ChatBubble changeName="brand-new-change" />)
    await waitFor(() => expect(fetchChatSession).toHaveBeenCalledWith('brand-new-change'))
    fireEvent.click(screen.getByTestId('chat-bubble-button'))

    expect(screen.getByTestId('chat-messages').textContent).toBe('')
  })

  it('renders context-file chips from the change artifacts and passes selected paths to streamChat', async () => {
    vi.mocked(fetchChangeDetail).mockResolvedValue({
      name: 'rx101-x',
      workflow: '',
      phase: '',
      archived: false,
      tasksCompleted: 0,
      tasksTotal: 0,
      verifyResult: '',
      createdAt: '',
      phases: [
        {
          key: 'design',
          label: 'Design',
          status: 'done',
          artifacts: [
            { file: 'design.md', label: 'Design', exists: true, path: 'openspec/changes/rx101-x/design.md' },
            { file: 'proposal.md', label: 'Proposal', exists: true, path: 'openspec/changes/rx101-x/proposal.md' },
            { file: 'tasks.md', label: 'Tasks', exists: false, path: 'openspec/changes/rx101-x/tasks.md' },
          ],
        },
      ],
    })
    vi.mocked(streamChat).mockImplementation(async (_change, _message, contextFiles, onEvent) => {
      expect(contextFiles).toEqual(['openspec/changes/rx101-x/design.md'])
      onEvent({ type: 'delta', content: 'ok' })
      onEvent({ type: 'done' })
    })

    render(<ChatBubble changeName="rx101-x" />)
    fireEvent.click(screen.getByTestId('chat-bubble-button'))

    await waitFor(() => expect(fetchChangeDetail).toHaveBeenCalledWith('rx101-x'))

    // Only artifacts that exist are offered as context; the missing tasks.md is excluded.
    const designChip = await screen.findByTestId('context-file-chip-openspec/changes/rx101-x/design.md')
    expect(screen.getByTestId('context-file-chip-openspec/changes/rx101-x/proposal.md')).toBeTruthy()
    expect(screen.queryByTestId('context-file-chip-openspec/changes/rx101-x/tasks.md')).toBeNull()

    fireEvent.click(designChip)

    const textarea = screen.getByTestId('chat-input') as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: 'what changed?' } })
    await act(async () => {
      fireEvent.click(screen.getByTestId('chat-send'))
    })

    await waitFor(() => expect(streamChat).toHaveBeenCalledTimes(1))
  })

  it('shows a labeled, collapsible context-file section that toggles visibility', async () => {
    vi.mocked(fetchChangeDetail).mockResolvedValue({
      name: 'rx101-x',
      workflow: '',
      phase: '',
      archived: false,
      tasksCompleted: 0,
      tasksTotal: 0,
      verifyResult: '',
      createdAt: '',
      phases: [
        {
          key: 'design',
          label: 'Design',
          status: 'done',
          artifacts: [
            { file: 'design.md', label: 'Design', exists: true, path: 'openspec/changes/rx101-x/design.md' },
          ],
        },
      ],
    })

    render(<ChatBubble changeName="rx101-x" />)
    fireEvent.click(screen.getByTestId('chat-bubble-button'))
    await waitFor(() => expect(fetchChangeDetail).toHaveBeenCalledWith('rx101-x'))

    const chip = await screen.findByTestId('context-file-chip-openspec/changes/rx101-x/design.md')
    expect(chip.getAttribute('aria-pressed')).toBe('false')
    expect(screen.getByTestId('context-file-list')).toBeTruthy()

    fireEvent.click(chip)
    expect(chip.getAttribute('aria-pressed')).toBe('true')

    fireEvent.click(screen.getByTestId('context-panel-toggle'))
    expect(screen.queryByTestId('context-file-list')).toBeNull()

    fireEvent.click(screen.getByTestId('context-panel-toggle'))
    expect(screen.getByTestId('context-file-list')).toBeTruthy()
  })

  it('⚙ opens the config panel with provider/model/key/temperature/tokens loaded', async () => {
    render(<ChatBubble changeName="rx101-x" />)
    await waitFor(() => expect(fetchChatSession).toHaveBeenCalledWith('rx101-x'))
    fireEvent.click(screen.getByTestId('chat-bubble-button'))

    expect(screen.queryByTestId('chat-settings-panel')).toBeNull()
    await act(async () => {
      fireEvent.click(screen.getByTestId('chat-settings-toggle'))
    })

    await waitFor(() => expect(fetchChatProviders).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(fetchChatConfig).toHaveBeenCalledTimes(1))
    expect(screen.getByTestId('chat-settings-panel')).toBeTruthy()
    expect((screen.getByTestId('chat-settings-provider') as HTMLSelectElement).value).toBe('anthropic')
    expect((screen.getByTestId('chat-settings-model') as HTMLSelectElement).value).toBe('claude-3-5-sonnet')
    expect((screen.getByTestId('chat-settings-api-key') as HTMLInputElement).placeholder).toBe('sk-c****umMM')
    expect((screen.getByTestId('chat-settings-temperature') as HTMLInputElement).value).toBe('0.7')
    expect((screen.getByTestId('chat-settings-max-tokens') as HTMLInputElement).value).toBe('4096')
  })

  it('changing the model and saving calls updateChatConfig with the new model, omitting an unchanged api_key', async () => {
    render(<ChatBubble changeName="rx101-x" />)
    await waitFor(() => expect(fetchChatSession).toHaveBeenCalledWith('rx101-x'))
    fireEvent.click(screen.getByTestId('chat-bubble-button'))

    await act(async () => {
      fireEvent.click(screen.getByTestId('chat-settings-toggle'))
    })
    await waitFor(() => expect(screen.getByTestId('chat-settings-panel')).toBeTruthy())

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
    expect(screen.queryByTestId('chat-settings-panel')).toBeNull()
    expect(screen.getByTestId('chat-settings-saved')).toBeTruthy()
  })

  it('typing a new api_key sends it in the patch', async () => {
    render(<ChatBubble changeName="rx101-x" />)
    await waitFor(() => expect(fetchChatSession).toHaveBeenCalledWith('rx101-x'))
    fireEvent.click(screen.getByTestId('chat-bubble-button'))

    await act(async () => {
      fireEvent.click(screen.getByTestId('chat-settings-toggle'))
    })
    await waitFor(() => expect(screen.getByTestId('chat-settings-panel')).toBeTruthy())

    fireEvent.change(screen.getByTestId('chat-settings-api-key'), { target: { value: 'sk-newkey123' } })
    await act(async () => {
      fireEvent.click(screen.getByTestId('chat-settings-save'))
    })

    await waitFor(() => expect(updateChatConfig).toHaveBeenCalledTimes(1))
    const patch = vi.mocked(updateChatConfig).mock.calls[0][0]
    expect(patch.providers?.anthropic?.api_key).toBe('sk-newkey123')
  })
})

