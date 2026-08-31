import { describe, expect, test } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ShareButton } from '../../src/ui/ShareButton'
import type { ShareEnv } from '../../src/ui/sharing'

const TEXT = 'Inversão · Grade\nVitória de Luiz'

function setup(env: ShareEnv) {
  render(<ShareButton text={TEXT} card={null} env={env} />)
  return userEvent.setup()
}

const press = (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole('button', { name: /compartilhar/i }))

describe('o botão de compartilhar', () => {
  test('entrega o texto à folha nativa quando ela existe', async () => {
    const sent: string[] = []
    const user = setup({ share: async (data) => { sent.push(data.text ?? '') } })

    await press(user)

    expect(sent).toEqual([TEXT])
  })

  test('cai para a área de transferência e diz que copiou', async () => {
    // O desktop é isto: quase nenhum tem Web Share. Sem a confirmação, clicar
    // no botão não produz efeito visível nenhum e parece quebrado.
    const written: string[] = []
    const user = setup({ write: async (text) => { written.push(text) } })

    await press(user)

    expect(written).toEqual([TEXT])
    expect(await screen.findByRole('status')).toHaveTextContent(/copiado/i)
  })

  test('não diz nada quando a pessoa fecha a folha', async () => {
    // Desistir não é erro, e anunciar qualquer coisa aqui seria comentar uma
    // decisão que a pessoa acabou de tomar.
    const abort = Object.assign(new Error('x'), { name: 'AbortError' })
    const user = setup({ share: async () => { throw abort }, canShare: () => true })

    await press(user)

    expect(screen.queryByRole('status')).toBeNull()
  })

  test('mostra o texto para copiar à mão quando não há saída nenhuma', async () => {
    // Nunca um beco sem saída: o card é o produto, e recusar a entrega sem
    // oferecer o conteúdo seria perder o trabalho todo por falta de uma API.
    const user = setup({})

    await press(user)

    expect(await screen.findByRole('textbox', { name: /resultado/i })).toHaveValue(TEXT)
  })

  test('não deixa disparar duas vezes enquanto prepara', async () => {
    let resolve = () => {}
    const held = new Promise<void>((done) => { resolve = done })
    const sent: string[] = []
    const user = setup({ share: async (data) => { sent.push(data.text ?? ''); await held } })

    await press(user)
    expect(screen.getByRole('button', { name: /preparando/i })).toBeDisabled()

    resolve()
  })
})
