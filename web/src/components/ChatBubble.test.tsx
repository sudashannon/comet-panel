import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { ChatBubble } from './ChatBubble'

describe('ChatBubble', () => {
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
})
