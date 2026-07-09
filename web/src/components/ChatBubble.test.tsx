import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ChatBubble } from './ChatBubble'
import { streamChat, fetchChatSession } from '../api/client'

vi.mock('../api/client', () => ({
  streamChat: vi.fn(),
  fetchChatSession: vi.fn(),
}))

describe('ChatBubble', () => {
  beforeEach(() => {
    vi.mocked(streamChat).mockReset()
    vi.mocked(fetchChatSession).mockReset()
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
})
