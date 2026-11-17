// Integration tests: real component + real hook + real API client.
// Only the network is mocked (by MSW, see src/test/server.ts).
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { EVALUATE_URL, http, HttpResponse, server } from '../test/server'
import { Calculator } from './Calculator'

const KEY_NAMES: Record<string, string> = {
  '+': 'Add',
  '-': 'Subtract',
  '*': 'Multiply',
  '/': 'Divide',
  '^': 'Power',
  '=': 'Equals',
  '.': 'Decimal point',
  C: 'Clear',
  '<': 'Backspace',
  '~': 'Toggle sign',
  r: 'Square root',
  '%': 'Percent',
}

function setup() {
  const user = userEvent.setup()
  render(<Calculator />)

  /** Clicks on-screen keys, e.g. click('33*12+4='). */
  const click = async (sequence: string) => {
    for (const ch of sequence) {
      await user.click(screen.getByRole('button', { name: KEY_NAMES[ch] ?? ch }))
    }
  }
  const display = () => screen.getByTestId('display')
  const expression = () => screen.getByTestId('expression')
  /** Waits for the main display to show a value (results arrive asynchronously). */
  const shows = (text: string) => waitFor(() => expect(display()).toHaveTextContent(text))
  return { user, click, display, expression, shows }
}

describe('<Calculator />', () => {
  it('builds the expression as keys are pressed: 33 × 12 + …', async () => {
    const { click, display, expression } = setup()

    await click('33')
    expect(display()).toHaveTextContent('33')

    await click('*')
    expect(expression()).toHaveTextContent('33 ×')

    await click('12')
    expect(display()).toHaveTextContent('12')

    await click('+')
    expect(expression()).toHaveTextContent('33 × 12 +')
  })

  it('evaluates a chained expression on =', async () => {
    const { click, display, expression, shows } = setup()

    await click('33*12+4=')

    await shows('400')
    expect(display()).toHaveTextContent('400')
    expect(expression()).toHaveTextContent('33 × 12 + 4 =')
  })

  it('respects operator precedence: 5 + 3 × 2 = 11', async () => {
    const { click, display, shows } = setup()
    await click('5+3*2=')
    await shows('11')
    expect(display()).toHaveTextContent('11')
  })

  it('continues calculating from a result', async () => {
    const { click, display, shows } = setup()
    await click('2*3=')
    await shows('6')
    await click('+4=')
    await shows('10')
    expect(display()).toHaveTextContent('10')
  })

  it('highlights the pending operator', async () => {
    const { click } = setup()
    await click('7*')
    expect(screen.getByRole('button', { name: 'Multiply' })).toHaveAttribute('aria-pressed', 'true')
    await click('2')
    expect(screen.getByRole('button', { name: 'Multiply' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('applies square root to the current number', async () => {
    const { click, display, expression, shows } = setup()
    await click('10+81r')
    await shows('9')
    expect(display()).toHaveTextContent('9')
    expect(expression()).toHaveTextContent('10 +')
  })

  it('applies percent relative to the previous number', async () => {
    const { click, display, shows } = setup()
    await click('200+10%')
    await shows('20')
    await click('=')
    await shows('220')
    expect(display()).toHaveTextContent('220')
  })

  it('shows a friendly message on division by zero', async () => {
    const { click } = setup()
    await click('5/0=')
    expect(await screen.findByRole('alert')).toHaveTextContent('You can’t divide by zero.')
  })

  it('shows an error for the square root of a negative number', async () => {
    const { click } = setup()
    await click('4~r')
    expect(await screen.findByRole('alert')).toHaveTextContent(/zero or greater/)
  })

  it('recovers from an error with the next digit', async () => {
    const { click, display } = setup()
    await click('5/0=')
    await screen.findByRole('alert')
    await click('7')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(display()).toHaveTextContent('7')
  })

  it('shows a message when the server is unreachable', async () => {
    server.use(http.post(EVALUATE_URL, () => HttpResponse.error()))
    const { click } = setup()
    await click('1+1=')
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not reach the server/i)
  })

  it('disables the keypad while calculating', async () => {
    let release!: () => void
    server.use(
      http.post(EVALUATE_URL, async () => {
        await new Promise<void>((r) => (release = r))
        return HttpResponse.json({ result: 2 })
      }),
    )
    const { click, shows } = setup()
    await click('1+1=')

    expect(screen.getByRole('button', { name: '5' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Clear' })).toBeEnabled()
    release()
    await shows('2')
    expect(screen.getByRole('button', { name: '5' })).toBeEnabled()
  })

  it('edits with backspace, sign and decimal point', async () => {
    const { click, display } = setup()
    await click('12.5~')
    expect(display()).toHaveTextContent('-12.5')
    await click('<<')
    expect(display()).toHaveTextContent('-12')
  })

  it('clears everything', async () => {
    const { click, display, expression } = setup()
    await click('33*12C')
    expect(display()).toHaveTextContent('0')
    expect(expression()).toBeEmptyDOMElement()
  })

  describe('physical keyboard', () => {
    it('types numbers and operators and evaluates with Enter', async () => {
      const { user, display, expression, shows } = setup()
      await user.keyboard('33*12+4{Enter}')
      await shows('400')
      expect(display()).toHaveTextContent('400')
      expect(expression()).toHaveTextContent('33 × 12 + 4 =')
    })

    it('supports comma, Backspace, % and Escape', async () => {
      const { user, display, shows } = setup()
      await user.keyboard('1,55{Backspace}')
      expect(display()).toHaveTextContent('1.5')

      await user.keyboard('%')
      await shows('0.015')

      await user.keyboard('{Escape}')
      expect(display()).toHaveTextContent('0')
    })

    it('ignores shortcuts with modifier keys and unrelated keys', async () => {
      const { user, display } = setup()
      await user.keyboard('{Control>}5{/Control}a')
      expect(display()).toHaveTextContent('0')
    })
  })
})
