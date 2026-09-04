import { useEffect, useMemo, useRef, useState } from 'react'
import { App } from './App'
import { Mark } from './Mark'
import { makeCode } from '../net/code'
import { parseConfig } from '../net/protocol'
import type { RoomConfig, Seat } from '../net/protocol'
import { socketTransport } from '../net/socket'
import type { Transport } from '../net/transport'
import { roomPath } from './routes'

/**
 * A tela de uma sala: conectar, esperar o adversário, e então sair da frente.
 *
 * Ela não sabe jogar. Quando as boas-vindas chegam, o `App` assume com o
 * transporte na mão — e o `App`, por sua vez, não sabe que existe rede.
 *
 * **A configuração viaja na query, e é consumida uma vez.** Quem cria abre
 * `/sala/K3M9?b=…`; assim que a sala confirma, o endereço é trocado pelo limpo,
 * que é o que se compartilha. Isso também é o que distingue recarregar de
 * criar: depois da troca, recarregar é entrar.
 */

type Status =
  | { at: 'connecting' }
  /** A sala respondeu, e daqui em diante quem manda é o `App`. */
  | { at: 'playing'; seat: Seat; config: RoomConfig }
  /** O socket fechou antes de qualquer resposta: sala inexistente ou desfeita. */
  | { at: 'gone' }

export type RoomProps = Readonly<{
  code: string
  /** Injetáveis para o teste não precisar de rede nem de `location`. */
  connect?: (joining: { code: string; config?: RoomConfig | undefined }) => Transport
  search?: string
  origin?: string
}>

const browserConnect =
  (origin?: string) =>
  (joining: { code: string; config?: RoomConfig | undefined }): Transport =>
    socketTransport((url) => new WebSocket(url), { ...joining, origin })

/** A configuração que quem cria pendurou no endereço, se houver. */
function askedIn(search: string): RoomConfig | null {
  const query = new URLSearchParams(search)
  if (!query.has('b')) return null
  return parseConfig({
    board: query.get('b'),
    mechanic: query.get('m'),
    evaluation: query.get('e') === '1',
  })
}

export function Room({ code, connect, search, origin }: RoomProps) {
  const asked = useMemo(
    () => askedIn(search ?? globalThis.location?.search ?? ''),
    [search],
  )
  const [status, setStatus] = useState<Status>({ at: 'connecting' })
  /** Quantos códigos já foram descartados por colisão. */
  const [collisions, setCollisions] = useState(0)
  const [here, setHere] = useState(code)
  const open = connect ?? browserConnect(origin)

  const transport = useMemo(
    () => open(asked === null ? { code: here } : { code: here, config: asked }),
    // Uma conexão por código. `open` e `asked` são estáveis por montagem, e
    // listá-los faria o socket ser refeito a cada render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [here],
  )

  const settled = useRef(false)
  useEffect(() => {
    settled.current = false
    return transport.onReceive((message) => {
      if (message.kind !== 'welcome') return
      settled.current = true

      /**
       * Colisão de código: eu criei e a sala já existia.
       *
       * Sem isto, dois jogadores que sorteiem o mesmo código caem na mesma
       * sala — e o segundo entra numa partida alheia sem nada na tela dizendo
       * isso. Em ~900 mil combinações é raro, e raro sem tratamento é o defeito
       * que aparece uma vez e não se reproduz.
       */
      if (asked !== null && !message.first) {
        transport.close()
        setCollisions((many) => many + 1)
        setHere(makeCode())
        return
      }

      // O endereço limpo é o que se compartilha, e trocá-lo aqui é o que faz
      // recarregar significar "entrar" em vez de "criar de novo".
      globalThis.history?.replaceState(null, '', roomPath(here))
      setStatus({ at: 'playing', seat: message.seat, config: message.config })
    })
  }, [transport, asked, here])

  useEffect(() => {
    const timer = setTimeout(() => {
      // Só conta como sumida se nada chegou. Uma queda **depois** das
      // boas-vindas é outro assunto, e é o passo 6.
      if (!settled.current) setStatus({ at: 'gone' })
    }, 4000)
    return () => clearTimeout(timer)
  }, [transport])

  useEffect(() => () => transport.close(), [transport])

  if (status.at === 'gone') return <Gone />
  if (status.at === 'connecting') return <Waiting code={here} creating={asked !== null} tries={collisions} />
  return <App online={{ transport }} />
}

function Waiting({ code, creating, tries }: { code: string; creating: boolean; tries: number }) {
  return (
    <main className="app room">
      <Mark />
      <h1>{creating ? 'Sala criada' : 'Entrando'}</h1>
      <p className="room-code">{code}</p>
      {creating && <Invitation code={code} />}
      {tries > 0 && (
        <p className="lead">
          O código anterior já estava em uso, então sorteamos outro.
        </p>
      )}
    </main>
  )
}

function Invitation({ code }: { code: string }) {
  const link = `${globalThis.location?.origin ?? ''}${roomPath(code)}`
  return (
    <p className="lead">
      Mande este endereço para quem vai jogar: <strong>{link}</strong>
    </p>
  )
}

function Gone() {
  return (
    <main className="app room">
      <Mark />
      <h1>Sala não encontrada</h1>
      <p className="lead">
        Uma sala existe só enquanto alguém está nela — não é um registro que fica.
        Se o link é antigo, peça outro; se você é quem criou, crie de novo.
      </p>
      <a className="restart" href="/">
        Voltar ao tabuleiro
      </a>
    </main>
  )
}

/** O endereço com que se cria uma sala: código sorteado mais a configuração. */
export function creationPath(config: RoomConfig, random?: () => number): string {
  const code = makeCode(random)
  const query = `b=${config.board}&m=${config.mechanic}&e=${config.evaluation ? '1' : '0'}`
  return `${roomPath(code)}?${query}`
}
