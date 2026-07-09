import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ChatBubble } from './ChatBubble'
import { streamChat } from '../api/client'

vi.mock('../api/client', () => ({
  streamChat: vi.fn(),
}))

describe('ChatBubble', () => {
  beforeEach(() => {
    vi.mocked(streamChat).mockReset()
  })

  it('is collapsed by default and expands on click', () => {
    render(<ChatBubble changeName="rx101-x" />)
    expect(screen.queryByTestId('chat-overlay')).toBeNull()
    fireEvent.click(screen.getByTestId('chat-bubble-button'))
    expect(screen.getByTestId('chat-overlay')).toBeTruthy()
  })

  it('collapses again when the close button is clicked', () => {
    render(<ChatBubble changeName="rx101-x" />)
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
})
