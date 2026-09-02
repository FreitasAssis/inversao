import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { Board, PIECE_PT, telegraphFor } from './Board'
import type { Telegraph } from './Board'
import { Annotation } from './Annotation'
import { ShareButton } from './ShareButton'
import { shareText, SITE } from './share'
import { BOARDS_FOR, BOARD_PT, MECHANIC_PT } from './labels'
import type { CardInput } from './card'
import { Invite } from './Invite'
import { Mark } from './Mark'
import { Evaluation } from './Evaluation'
import { Outcome } from './Outcome'
import type { Tone } from './Outcome'
import {
  DEFAULT_LEVEL,
  LEVELS,
  LEVEL_LABELS,
  ORDER,
  decidedOpening,
  fallibilityOf,
  humansFor,
} from './levels'
import type { Level } from './levels'
import { loadTable } from './tables'
import { recordFinished } from './record'
import { pathOf } from './routes'
import { readSaved, writeSaved } from './saved'
import { beatFor, environment, readSettings, writeSettings } from './settings'
import { createPlayer } from './sound'
import { aiController, drawController, lookupController } from '../engine/controller'
import { annotate } from '../engine/annotate'
import { assess } from '../engine/lookup'
import type { Table } from '../engine/table'
import { actionsLeft, applyAction, awaitingDraw, startMatch, turn } from '../engine/match'
import type { Action, Match, MatchConfig } from '../engine/match'
import { PIECES } from '../engine/types'
import type { BoardCode, Piece, Side } from '../engine/types'
import { admits } from '../net/wire'
import type { Transport } from '../net/transport'
import type { RoomConfig, Seat } from '../net/protocol'

/**
 * The root opens on a board that is already playable: Escolha Sorteada on
 * Setas, against the AI. No splash, no mode menu, no "click to start" — for an
 * unknown game every screen before the board is a chance to leave, and for a
 * portfolio the link has to show the thing working in two seconds (project doc
 * 3). Mechanic, board and level sit in a quiet panel inside the game.
 *
 * Who plays each side is a parameter, not a feature: swapping the AI for a
 * second human changes only where the action comes from (project doc 6.1).
 */

/**
 * The AI's name. It has one because a win over it is worth sharing (project doc
 * 7), and "blue beat orange" is not a story — a card needs somebody to have
 * been beaten. Not editable: the opponent is a character, not a field.
 */
const AI_NAME = 'Inversa'


/**
 * Capitalised: with no name typed, the colour stands in as one, and these are
 * the values that actually reach the screen — Board and Outcome have their own
 * fallbacks, but this one wins.
 */
const COLOUR_PT: Record<Side, string> = { blue: 'Azul', orange: 'Laranja' }

/**
 * A configuração da partida online, derivada só do que a sala disse.
 *
 * O teto de ações e o empate por repetição **não** viajam, e por isso são
 * constantes aqui: se cada cliente usasse o seu, os dois discordariam sobre
 * quando a partida vira empate por limite — e a divergência apareceria no lance
 * 500, sem nada na tela explicando.
 */
function onlineConfig(config: RoomConfig): MatchConfig {
  return {
    board: config.board,
    mechanic: config.mechanic,
    maxActions: 500,
    drawOnRepetition: false,
  }
}

/**
 * A gear. The first attempt read as a *sun*, and the reason was specific:
 * eight long thin strokes with round caps are rays. Teeth are short, thick and
 * squared off, and they sit against a ring rather than radiating from a point.
 */
function Gear() {
  const teeth = Array.from({ length: 8 }, (_, index) => {
    const angle = (index * Math.PI) / 4
    return {
      key: index,
      x1: 12 + 7.6 * Math.cos(angle),
      y1: 12 + 7.6 * Math.sin(angle),
      x2: 12 + 10.4 * Math.cos(angle),
      y2: 12 + 10.4 * Math.sin(angle),
    }
  })

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <g fill="none" stroke="currentColor" strokeLinecap="butt">
        {/* The body: a thick ring, so the teeth read as growing out of a solid
            wheel instead of converging on a dot. */}
        <circle cx="12" cy="12" r="6.4" strokeWidth="3.2" />
        {/* The hole, which is most of what says "gear" rather than "wheel". */}
        <circle cx="12" cy="12" r="2.7" strokeWidth="1.8" />
        {teeth.map(({ key, x1, y1, x2, y2 }) => (
          <line
            key={key}
            x1={x1.toFixed(1)}
            y1={y1.toFixed(1)}
            x2={x2.toFixed(1)}
            y2={y2.toFixed(1)}
            strokeWidth="3.4"
          />
        ))}
      </g>
    </svg>
  )
}


export type AppProps = Readonly<{
  /** Staging pause on the draw. Zero in tests; a beat in play (spec 4.1). */
  drawDelayMs?: number
  /** Fixes the draws for a local match, which makes one replayable. */
  seed?: number
  /**
   * How long the AI shows its move before playing it. A move that simply
   * appears is a move the player never saw (project doc 13 is about pacing in
   * the other direction, so this stays a beat, not a wait).
   */
  telegraphMs?: number
  /**
   * A ligação com a sala, quando a partida é online.
   *
   * Ausente é o que sempre foi: partida local, contra a IA ou em dois no mesmo
   * aparelho. Presente muda três coisas e nada mais — de onde saem os lances,
   * quem sorteia, e o fato de não haver IA nenhuma para consultar.
   *
   * O assento **não** vem por aqui: quem decide é a sala, e ela conta nas
   * boas-vindas. Se o cliente escolhesse, dois jogadores se declarariam azuis.
   */
  online?: { transport: Transport } | undefined
}>

export function App({ drawDelayMs = 550, seed, telegraphMs = 700, online }: AppProps) {
  /**
   * A match interrupted on this device, read once. Everything the panel shows
   * is seeded from it, so reopening the page lands on the game that was left
   * rather than on a fresh board wearing its settings (project doc 5).
   */
  const [restored] = useState(() => readSaved())

  const [mechanic, setMechanic] = useState<MatchConfig['mechanic']>(
    restored?.match.config.mechanic ?? 'choice',
  )
  const [board, setBoard] = useState<BoardCode>(restored?.match.config.board ?? 'dbu')
  const [level, setLevel] = useState<Level>(restored?.level ?? DEFAULT_LEVEL)
  // Read once: the system preference decides where the dial starts, a stored
  // choice overrides it.
  const [settings, setSettings] = useState(() => readSettings(environment()))
  const { speed, colourless, evaluation, volume, playerName, guestName } = settings
  const beat = beatFor(speed)

  // The player reads the volume through a ref-like closure, so changing the
  // slider never rebuilds the audio context.
  const volumeRef = useRef(volume)
  volumeRef.current = volume
  const sound = useMemo(() => createPlayer(() => volumeRef.current), [])
  const update = (change: Partial<typeof settings>) =>
    setSettings((current) => {
      const next = { ...current, ...change }
      writeSettings(next)
      return next
    })
  const [humans, setHumans] = useState<Side[]>([...(restored?.humans ?? ['blue'])])
  const [drawOnRepetition, setDrawOnRepetition] = useState(
    restored?.match.config.drawOnRepetition ?? false,
  )
  /**
   * The cap is what guarantees a match ends. No clock does: somebody who moves
   * quickly never runs out of anything, and a clock that expires has to decide
   * a result the player cannot check.
   */
  const [maxActions, setMaxActions] = useState(restored?.match.config.maxActions ?? 500)


  const [telegraph, setTelegraph] = useState<Telegraph | null>(null)
  const panel = useRef<HTMLDialogElement>(null)

  /**
   * Which symbol the Rodizio's cycle opens on (spec 4.2). On the Grade this is
   * the only parameter in the game that decides *which side* holds the
   * theoretical win — triangle is blue's at 401 lances, square is orange's at
   * 524, circle is a draw — so steering everybody into one of them hides the
   * sharpest thing the mechanic has.
   *
   * Only reaches the config under the Rodizio: the Escolha Sorteada has no
   * cycle to open, and carrying a field the mechanic ignores would make two
   * identical matches compare as different.
   */
  const [opening, setOpening] = useState<Piece>(
    restored?.match.config.opening ?? 'square',
  )

  /**
   * The two flawless levels dictate the configuration instead of merely being
   * a strength, and that is the whole difference between them: the opening
   * below is a proven win for whoever moves first, so seating the player there
   * makes the win theirs (Insano) and seating the AI there puts it out of reach
   * (Impossivel). Spec 6 asked for exactly this — "fixe a abertura" — and it
   * only became possible once the tables made the promise true.
   *
   * Derived, never stored: writing it into state would fight the player's own
   * controls on every render.
   */
  const decreed = mechanic === 'rotation' ? humansFor(level) : null
  // Online são dois humanos por definição: não há IA para consultar, e o nível
  // não significa nada. O que separa os dois lados é o assento, não o assento
  // ser humano.
  const seats: Side[] = online !== undefined ? ['blue', 'orange'] : (decreed ?? humans)
  const opened_ = decreed === null ? opening : decidedOpening(board) ?? opening

  const config = useMemo<MatchConfig>(
    () => ({
      board,
      mechanic,
      drawOnRepetition,
      maxActions,
      ...(mechanic === 'rotation' ? { opening: opened_ } : {}),
    }),
    [board, mechanic, drawOnRepetition, maxActions, opened_],
  )

  /**
   * The solution table for the combination in play, or null while it is on its
   * way — or forever, on a first visit with no network. Cleared the instant the
   * combination changes: consulting the Setas table during a game on the Grade
   * would be worse than having none, because every answer would be about a
   * different board.
   */
  const [table, setTable] = useState<Table | null>(null)
  useEffect(() => {
    let live = true
    setTable(null)
    void loadTable(board, mechanic).then((loaded) => {
      if (live) setTable(loaded)
    })
    return () => {
      live = false
    }
  }, [board, mechanic])
  /**
   * O assento, e a resposta da sala à pergunta que o cliente não sabe sozinho.
   *
   * Null enquanto as boas-vindas não chegam — é o estado de "conectando", e
   * também o que impede jogar antes de saber de que lado se está. Espectador é
   * um assento como os outros, e nunca é igual a um lado, então tudo o que
   * depende de `seat === turn` simplesmente não acontece para ele.
   */
  const [seat, setSeat] = useState<Seat | null>(null)

  const [match, setMatch] = useState<Match>(() => restored?.match ?? startMatch(config))
  const [matchSeed, setMatchSeed] = useState(() => restored?.seed ?? seed ?? Date.now())

  /**
   * Changing the mechanic or the board starts a new game — but only when the
   * player changes it. On the first pass the match already came from this very
   * config, or from the save, and resetting here would throw the restored game
   * away a frame after bringing it back.
   */
  const opened = useRef(false)
  useEffect(() => {
    // Online a configuração é da sala, não do painel: ela chega nas
    // boas-vindas e monta a partida ali. Deixar este efeito rodar aqui apagaria
    // o log que a sala acabou de entregar, um quadro depois de entregá-lo.
    if (online !== undefined) return
    if (!opened.current) {
      opened.current = true
      return
    }
    setMatch(startMatch(config))
    setMatchSeed(seed ?? Date.now())
  }, [config, seed, online])

  // Kept on every change, thrown away by `writeSaved` itself once the match is
  // over or has not begun: there is no game to come back to in either case.
  useEffect(() => {
    // Partida online não é salva: a sala não sobrevive ao fechar da aba, e
    // restaurar levaria a pessoa de volta a um tabuleiro sem adversário do
    // outro lado. Reconectar é outra coisa, e vem da sala.
    if (online !== undefined) return
    writeSaved({ match, seed: matchSeed, humans: seats, level })
  }, [match, matchSeed, seats, level, online])

  // One draw source per match, keyed on the round. Building a fresh one per
  // round with a different seed would make "seeded" mean nothing.
  const draw = useMemo(() => drawController(matchSeed), [matchSeed])

  const isHuman = (side: Side) => seats.includes(side)

  /**
   * What each side is called. You are always blue locally; the second seat is
   * the guest, or the AI. Online this is where the opponent's name would come
   * from the wire instead of from storage.
   */
  const nameOf = (side: Side): string => {
    if (!isHuman(side)) return AI_NAME
    const typed = side === 'blue' ? playerName : guestName
    return typed.trim() || COLOUR_PT[side]
  }
  const displayNames: Record<Side, string> = {
    blue: nameOf('blue'),
    orange: nameOf('orange'),
  }

  /**
   * The evaluation bar is **only ever offered between two humans** (project doc
   * 9). Against the AI it is the same oracle that took the clock down: an exact
   * answer the player did not earn, handed over mid-game (spec 3.4).
   *
   * The check is on the seats rather than on the setting, so switching back to
   * the AI with the switch left on takes the bar away instead of leaving it —
   * that is the way this restriction would otherwise be walked around.
   */
  const mayEvaluate = seats.length === 2
  const showEvaluation = mayEvaluate && evaluation && table !== null
  const assessment = showEvaluation ? assess(match, table) : null

  /**
   * The finished match, read back (project doc 7.1). No restriction on this
   * one: what makes the live bar dangerous is handing over an answer *during*
   * the game, and by now the result is already on the screen. Withholding it
   * against the AI would be caution without a reason — and this is where the
   * clock's adjudication went, so it had better be shown.
   */
  const annotation =
    match.result !== null && table !== null ? annotate(match, table) : null

  /**
   * O que sai da partida quando ela acaba (projeto 7).
   *
   * O nível só entra contra a Inversa: entre dois humanos ele não significa
   * nada, e dizer "(Insano)" ao lado do nome de uma pessoa seria atribuir a ela
   * uma dificuldade que não é dela.
   *
   * A curva é lida do lado de quem compartilha, e o `viewpoint` já é isso — ele
   * é null exatamente quando há duas pessoas na mesma tela, e aí não existe um
   * "você" para a curva subir junto.
   */
  function cardFor(): CardInput | null {
    if (match.result === null) return null
    const mine = (blue: number) => (viewpoint === 'orange' ? 1 - blue : blue)
    const chance = annotation?.moments.every((moment) => moment.assessment.kind === 'chance')
    const curve =
      annotation !== null && chance === true
        ? annotation.moments.map((moment) =>
            mine(moment.assessment.kind === 'chance' ? moment.assessment.blue : 0.5),
          )
        : []
    return {
      board: match.config.board,
      placement: match.placement,
      title: `${BOARD_PT[match.config.board]} · ${MECHANIC_PT[match.config.mechanic]}`,
      headline: headlineFor(),
      curve,
      turning: curve.length > 0 ? (annotation?.turningPoint?.ply ?? null) : null,
      caption: captionFor(),
      url: SITE,
    }
  }

  function headlineFor(): string {
    if (winner === null) return 'Empate'
    const beaten = displayNames[winner === 'blue' ? 'orange' : 'blue']
    return `${displayNames[winner]} venceu ${
      viewpoint === null ? beaten : `${beaten} (${LEVEL_LABELS[level]})`
    }`
  }

  function captionFor(): string | null {
    const turning = annotation?.turningPoint
    if (turning === undefined || turning === null) return null
    return `virou no lance ${turning.ply}`
  }

  const offerPending = match.actions.at(-1)?.type === 'offerDraw'

  /**
   * A round waiting on its initiative has nobody to move, and the engine
   * refuses both offering and resigning there: with no turn there is nobody
   * whose resignation it would be. The buttons say so instead of pretending.
   *
   * Marked, never removed and never `disabled` — the same rule the board
   * follows. A control that disappears every round moves the layout under the
   * player's thumb, and a `disabled` one drops out of the tab order and out of
   * the screen reader entirely. The board is inert through this same beat, so
   * it reads as the round not having started rather than as controls flickering.
   *
   * Locally the beat is the draw staging. Online it is the commit-and-reveal
   * round trip, which is where the window is long enough to matter.
   */
  const held = awaitingDraw(match)

  /** Sound reinforces what the screen already says; it never says it alone. */
  function cueFor(next: Match, action: Action) {
    if (next.result !== null) {
      const end = next.result
      const won = end.kind === 'win' || end.kind === 'resignation' || end.kind === 'abandonment'
      if (!won) sound.play('tie')
      else if (viewpoint === null || end.winner === viewpoint) sound.play('win')
      else sound.play('defeat')
      return
    }
    if (action.type === 'draw') sound.play('draw')
    else if (action.type === 'move') sound.play('land')
    // Um lance é um gesto em duas partes, pegar e pousar. Um passe é a primeira
    // sem a segunda: a peça foi nomeada e não foi a lugar nenhum — que é
    // exatamente o que o som de pegar, sozinho, diz.
    else if (action.type === 'pass') sound.play('move')
  }

  /**
   * Whose eyes the result is read through. One human means the result is about
   * them; two people at one screen means there is nobody to console, so the
   * winner simply celebrates. Online this becomes the local player's side and
   * the other device shows the mirror — which is why the tone comes from a
   * viewpoint rather than from who happens to be human. Against the AI the two
   * agree by accident, and that accident would not survive step 9.
   */
  const viewpoint: Side | null = seats.length === 1 ? (seats[0] ?? null) : null

  const winner =
    match.result?.kind === 'win' ||
    match.result?.kind === 'resignation' ||
    match.result?.kind === 'abandonment'
      ? match.result.winner
      : null

  function toneFor(): Tone {
    if (match.result === null) return 'celebration'
    // Nobody won a draw, and neither bouncing nor mourning would say so.
    if (winner === null) return 'draw'
    if (viewpoint === null) return 'celebration'
    return winner === viewpoint ? 'celebration' : 'defeat'
  }
  const tone = toneFor()

  const shareable =
    match.result === null
      ? null
      : {
          text: shareText({
            board: match.config.board,
            mechanic: match.config.mechanic,
            result: match.result,
            actions: match.actions.length,
            placement: match.placement,
            names: displayNames,
            level: viewpoint === null ? null : level,
            annotation,
            viewpoint: viewpoint ?? 'blue',
            url: SITE,
          }),
          card: cardFor(),
        }


  function play(action: Action) {
    if (online !== undefined) {
      // Online ninguém aplica o próprio lance: manda, e aplica quando ele volta
      // carimbado. Assim existe uma ordem só, a da sala, em vez de duas que
      // precisam concordar.
      if (seat === null || turn(match)?.side !== seat) return
      online.transport.send({ kind: 'act', action })
      return
    }
    setMatch((current) => {
      const result = applyAction(current, action)
      if (!result.ok) return current
      cueFor(result.match, action)
      if (result.match.result !== null && current.result === null) {
        recordFinished(result.match.actions.length)
      }
      return result.match
    })
  }

  /**
   * O que chega da sala.
   *
   * Toda mensagem passa por `admits` antes do motor: ela confere ordem e
   * **autoria**, que é o que o motor não tem como saber — `Action` não diz quem
   * jogou, e sem esta checagem `resign` mandado na vez do adversário registraria
   * que ele desistiu.
   *
   * O contador segue a **sala**, e não a lista de ações. A primeira versão usava
   * `actions.length`, com o raciocínio de que toda mensagem aceita acrescenta
   * exatamente uma ação — verdadeiro, e insuficiente: a sala numera tudo o que
   * transmite, inclusive o que os clientes recusam, porque ela não conhece as
   * regras. Uma única mensagem recusada dessincronizava a sequência para sempre,
   * e a partida travava depois de qualquer tentativa de trapaça.
   *
   * Numa ref e não em estado: ele não muda nada do que se desenha, e passar por
   * um render entre duas mensagens perderia a segunda.
   */
  const expected = useRef(0)
  useEffect(() => {
    if (online === undefined) return
    return online.transport.onReceive((inbound) => {
      if (inbound.kind === 'welcome') {
        // A sala manda as boas-vindas **antes** do log, e a partida precisa
        // nascer aqui, na mesma rajada: as ações que vêm a seguir são
        // enfileiradas depois desta atualização e caem sobre a partida certa.
        //
        // Montar a partida a partir do painel e corrigir depois perderia o log
        // — o efeito de configuração reiniciaria a partida um quadro adiante.
        setSeat(inbound.seat)
        setBoard(inbound.config.board)
        setMechanic(inbound.config.mechanic)
        update({ evaluation: inbound.config.evaluation })
        expected.current = 0
        setMatch(startMatch(onlineConfig(inbound.config)))
        return
      }

      const message = inbound.message
      // Fora do atualizador: React chama atualizador duas vezes em modo estrito,
      // e um contador incrementado lá dentro pularia mensagens.
      const at = expected.current
      if (message.seq !== at) return
      expected.current = at + 1

      setMatch((current) => {
        const verdict = admits(current, at, message)
        if (!verdict.ok) return current
        cueFor(verdict.match, message.action)
        if (verdict.match.result !== null && current.result === null) {
          recordFinished(verdict.match.actions.length)
        }
        return verdict.match
      })
    })
  }, [online])

  /**
   * O sorteio, quando a partida é online: quem sorteia é a sala.
   *
   * Os dois clientes pedem, porque nenhum sabe se o outro pediu, e a sala é
   * idempotente por rodada — o segundo pedido não produz ação nenhuma. Um
   * cliente que sorteasse escolheria a própria iniciativa, que é o jogo inteiro
   * da Escolha Sorteada.
   */
  useEffect(() => {
    if (online === undefined || match.result !== null) return
    if (!awaitingDraw(match)) return
    const round = match.selector.kind === 'choice' ? match.selector.state.round : 0
    online.transport.send({ kind: 'draw', round })
  }, [online, match])

  // The draw and the AI both resolve outside the render: a controller hands
  // back a promise of an action, whoever is behind it.
  useEffect(() => {
    // Online não há IA nem sorteio local: os dois vêm da sala, acima.
    if (online !== undefined) return
    if (match.result !== null) return
    const mover = turn(match)?.side
    const pending = awaitingDraw(match)
    if (!pending && (mover === undefined || isHuman(mover))) return

    let live = true
    const timers: ReturnType<typeof setTimeout>[] = []
    const controller = pending
      ? draw
      : table !== null
        ? lookupController(table, fallibilityOf(level))
        : aiController(LEVELS[level].depth)

    timers.push(
      setTimeout(
        () => {
          void controller(match).then((action) => {
            if (!live) return
            // Um passe é anunciado pela mesma batida que um lance, e isso é o
            // ponto: ele não move nada. Sem a batida ele era aplicado no mesmo
            // instante e em silêncio, e a vez voltava presa a um símbolo que o
            // jogador nunca viu ninguém escolher — a jogada mais forte da
            // Escolha Sorteada acontecendo fora da tela.
            const announced = mover === undefined ? null : telegraphFor(match, action, mover)
            if (announced === null) {
              play(action)
              return
            }
            setTelegraph(announced)
            timers.push(
              setTimeout(() => {
                if (!live) return
                setTelegraph(null)
                play(action)
              }, telegraphMs * beat),
            )
          })
        },
        pending ? drawDelayMs * beat : 0,
      ),
    )

    return () => {
      live = false
      for (const timer of timers) clearTimeout(timer)
    }
  }, [match, level, seats, table, drawDelayMs, draw, telegraphMs, beat, online])

  return (
    <main
      className="app"
      data-colourless={colourless || undefined}
      style={{ '--beat': beat } as CSSProperties}
    >
      <header className="top">
        {/* The mark and the name trade colours, so the pair is itself an
            inversion — the same operation the game is named after. */}
        <h1>
          <Mark side="blue" decorative />
          <span>Inversão</span>
        </h1>
        {/* Reference, never a prerequisite: quiet links, not gates. Grouped,
            because `space-between` on three children spreads them across the
            whole page instead of parking them opposite the name. */}
        <nav>
          <a href={pathOf('puzzle')}>Desafios</a>
          <a href={pathOf('rules')}>Regras</a>
          {/* The settings live behind this, over the board, rather than as ten
              controls permanently parked under the game. Project doc 3 asks for
              them "num painel discreto dentro do jogo, nunca numa tela anterior
              a ele" — on demand and over the board is exactly that. */}
          <button
            type="button"
            className="gear"
            aria-label="Configurações"
            onClick={() => panel.current?.showModal()}
          >
            <Gear />
          </button>
        </nav>
      </header>

      <Board
        match={match}
        onPlay={play}
        telegraph={telegraph}
        names={displayNames}
        outcome={
          <Outcome
            result={match.result}
            actions={match.actions.length}
            tone={tone}
            names={displayNames}
          />
        }
      />

      {assessment !== null && <Evaluation assessment={assessment} names={displayNames} />}

      {/* A plain readout, not a live region: announcing "499 lances restantes"
          after every single move would be noise in a screen reader. */}
      {match.result === null && (
        <p className="counter">{actionsLeft(match)} lances restantes</p>
      )}

      {match.result === null && (
        <div className="offers">
          {/* Draw by agreement is the main route between two humans (spec 3.4),
              and until now it had no way in at all. */}
          {offerPending ? (
            /* Answering an open offer needs nobody's turn, so it is never held:
               the engine settles it before it ever looks at the selector. */
            <>
              <button type="button" onClick={() => play({ type: 'acceptDraw' })}>
                Aceitar empate
              </button>
              <button type="button" onClick={() => play({ type: 'declineDraw' })}>
                Recusar
              </button>
            </>
          ) : (
            <button
              type="button"
              aria-disabled={held}
              onClick={() => !held && play({ type: 'offerDraw' })}
            >
              Propor empate
            </button>
          )}
          <button
            type="button"
            aria-disabled={held}
            onClick={() => !held && play({ type: 'resign' })}
          >
            Desistir
          </button>
        </div>
      )}

      {/*
        What game this is stays on the page. These three are not preferences,
        they are the content: three topologies and two mechanics is what the
        project has to show, and behind a gear most people would play one
        combination and never learn the others were there.
      */}
      <div className="setup">
        <label>
          Mecânica
          <select
            value={mechanic}
            onChange={(event) => {
              const next = event.target.value as MatchConfig['mechanic']
              setMechanic(next)
              if (!BOARDS_FOR[next].includes(board)) setBoard('dbu')
            }}
          >
            <option value="choice">Escolha Sorteada</option>
            <option value="rotation">Rodízio</option>
          </select>
        </label>

        <label>
          Tabuleiro
          <select value={board} onChange={(event) => setBoard(event.target.value as BoardCode)}>
            {BOARDS_FOR[mechanic].map((code) => (
              <option key={code} value={code}>
                {BOARD_PT[code]}
              </option>
            ))}
          </select>
        </label>

        {/* Only under the Rodizio: the Escolha Sorteada has no cycle to open,
            and the draw decides who names a piece every single round. */}
        {mechanic === 'rotation' && (
          <label>
            Abertura
            <select
              value={opened_}
              aria-disabled={decreed !== null}
              onChange={(event) =>
                decreed === null && setOpening(event.target.value as Piece)
              }
            >
              {PIECES.map((piece) => (
                <option key={piece} value={piece}>
                  {PIECE_PT[piece]}
                </option>
              ))}
            </select>
          </label>
        )}

        <label>
          Nível
          <select value={level} onChange={(event) => setLevel(event.target.value as Level)}>
            {ORDER.filter(
              // Impossivel is a theorem, and the Escolha Sorteada has none to
              // offer: it opens ~50/50 on all three boards (spec 6).
              (code) => code !== 'impossible' || mechanic === 'rotation',
            ).map((code) => (
              <option key={code} value={code}>
                {LEVEL_LABELS[code]}
              </option>
            ))}
          </select>
        </label>

      </div>

      {/*
        A native dialog, not a div: focus trapping, Escape, the inert page
        behind it and returning focus to the gear are all hard to get right and
        all come free here. jsdom does not implement it, so `tests/setup.ts`
        shims it — and says plainly that the modal behaviour itself is the
        browser's and is not covered by these tests.

        No longer hidden when the match ends. It used to be, because ten
        controls under a finished game were in the way of the result; behind a
        gear they are in nobody's way.
      */}
      <dialog
        ref={panel}
        className="settings"
        aria-label="Configurações"
        // A native dialog closes on Escape but not on a click outside, and
        // people expect both. The backdrop is not an element, so a click on it
        // arrives with the dialog itself as its target — which is why the
        // padding lives on the body inside and never on the dialog.
        onClick={(event) => {
          if (event.target === panel.current) panel.current?.close()
        }}
      >
      <div className="settings-body">
      <div className="controls">
        <label>
          <input
            type="checkbox"
            checked={colourless}
            onChange={(event) => update({ colourless: event.target.checked })}
          />
          Modo sem cor
        </label>

        {/* Shown rather than hidden against the AI: a control that vanishes
            never tells anybody the feature exists, and the reason it is held is
            worth reading. */}
        <label
          title={
            mayEvaluate
              ? 'Mostra o valor exato da posição, direto da tabela de solução.'
              : 'Só em dois jogadores: contra a IA a barra entregaria a resposta exata que o jogador não conquistou.'
          }
        >
          <input
            type="checkbox"
            checked={mayEvaluate && evaluation}
            aria-disabled={!mayEvaluate}
            onChange={(event) => mayEvaluate && update({ evaluation: event.target.checked })}
          />
          Barra de avaliação
        </label>

        <label
          title="Uma posição repetida não prova que o jogo travou: com sorteio ela pode
                 voltar por acaso, e no Rodízio 54% dos turnos são forçados."
        >
          <input
            type="checkbox"
            checked={drawOnRepetition}
            onChange={(event) => setDrawOnRepetition(event.target.checked)}
          />
          Empate por repetição
        </label>

        <label>
          Velocidade
          <input
            type="range"
            min={0}
            max={4}
            step={1}
            value={speed}
            onChange={(event) => update({ speed: Number(event.target.value) })}
          />
        </label>

        <label>
          Limite de lances
          <input
            type="number"
            min={20}
            max={600}
            step={10}
            value={maxActions}
            onChange={(event) => setMaxActions(Number(event.target.value))}
          />
        </label>

        <label>
          Som
          <input
            type="range"
            min={0}
            max={1}
            step={0.25}
            value={volume}
            onChange={(event) => update({ volume: Number(event.target.value) })}
          />
        </label>

        <label>
          Seu nome
          <input
            type="text"
            value={playerName}
            maxLength={20}
            placeholder="Azul"
            onChange={(event) => update({ playerName: event.target.value })}
          />
        </label>

        {humans.length === 2 && (
          <label>
            Nome do convidado
            <input
              type="text"
              value={guestName}
              maxLength={20}
              placeholder="Laranja"
              onChange={(event) => update({ guestName: event.target.value })}
            />
          </label>
        )}

        <label>
          <input
            type="checkbox"
            checked={seats.length === 2}
            aria-disabled={decreed !== null}
            onChange={(event) =>
              decreed === null &&
              setHumans(event.target.checked ? ['blue', 'orange'] : ['blue'])
            }
          />
          Dois jogadores
        </label>

      </div>

        <button type="button" className="restart" onClick={() => panel.current?.close()}>
          Fechar
        </button>
      </div>
      </dialog>

      {table !== null && (
        <p className="ready">Análise completa disponível</p>
      )}

      {shareable !== null && <ShareButton text={shareable.text} card={shareable.card} />}

      {annotation !== null && <Annotation read={annotation} names={displayNames} />}

      <a className="seal" href={pathOf('analysis')}>
        verificado por busca exaustiva
      </a>

      {/*
        Trocar de tabuleiro ou de mecânica já reinicia a partida por si, então o
        convite não precisa de botão de estado próprio: ele mexe na mesma
        escolha que o painel mexe.
      */}
      {match.result !== null && (
        <Invite
          board={board}
          mechanic={mechanic}
          onPick={(next, how) => {
            setBoard(next)
            setMechanic(how)
          }}
        />
      )}

      <button
        type="button"
        className="restart"
        onClick={() => {
          setMatch(startMatch(config))
          setMatchSeed(seed ?? Date.now())
        }}
      >
        Nova partida
      </button>
    </main>
  )
}
