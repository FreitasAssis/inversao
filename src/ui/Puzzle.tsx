import { useState } from 'react'
import { ShareButton } from './ShareButton'
import { puzzleShareText, SITE } from './share'
import { Board, CELL_NAMES, PIECE_PT } from './Board'
import { pathOf } from './routes'
import {
  answersOn,
  readPuzzleRecord,
  recordAnswer,
  streaksOf,
} from './puzzleRecord'
import { dayKey, placementOf, puzzlesFor } from './puzzles'
import type { Puzzle as Daily, PuzzleMove } from './puzzles'
import { applyAction, startMatch } from '../engine/match'
import type { Action, Match } from '../engine/match'

/**
 * The daily puzzles (project doc 8).
 *
 * Three a day, one per board, the same three for everybody — chosen by
 * arithmetic over the UTC date rather than by a server, which is what keeps the
 * site static.
 *
 * Each one is a **real match** starting from a position lifted out of the
 * solution table, not a diagram: the same board component, the same rules, the
 * same legal-move highlighting and keyboard navigation. A hand-drawn puzzle
 * would drift from the game the first time a rule moved. This cannot.
 *
 * One attempt each, because the answer is exact and a second guess would make
 * it a quiz rather than a decision.
 */

const MONTHS = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
]

function longDate(now: Date): string {
  return `${now.getUTCDate()} de ${MONTHS[now.getUTCMonth()]} de ${now.getUTCFullYear()}`
}

/** A move said out loud, the way somebody would explain it over the board. */
function describe(move: PuzzleMove): string {
  const piece = PIECE_PT[move.symbol]
  if (move.pass) return `nomear o ${piece} e passar, sem lance legal`
  return `nomear o ${piece} e mover para ${CELL_NAMES[move.to as number]}`
}

const matches = (action: Action, move: PuzzleMove): boolean =>
  move.pass
    ? action.type === 'pass' && action.piece === move.symbol
    : action.type === 'move' && action.piece === move.symbol && action.to === move.to

/** Percentage points, the currency the whole analysis is quoted in. */
const points = (value: number) => (value * 100).toFixed(1).replace('.', ',')

export type PuzzleProps = Readonly<{
  /** Injected by tests. In the browser it is simply now. */
  now?: Date
}>


export function Puzzle({ now = new Date() }: PuzzleProps) {
  const today = dayKey(now)
  const [record, setRecord] = useState(() => readPuzzleRecord())
  const answers = answersOn(record, today)
  const streaks = streaksOf(record, today)
  const daily = puzzlesFor(now)

  return (
    <main className="app puzzle">
      <header className="top">
        <h1>Desafios de {longDate(now)}</h1>
        <a href={pathOf('game')}>Jogar</a>
      </header>

      {/*
        A match answers "which way am I going" on its own: you watched your
        pieces leave the top row. A puzzle drops somebody into the middle with
        no such history, so it has to be said — the coloured slots show it, and
        the words make sure.
      */}
      <p className="lead">
        <strong>Você joga com as azuis</strong> e tem a iniciativa. Suas peças saíram da
        fileira <strong>de cima</strong> e precisam chegar aos encaixes azuis da fileira{' '}
        <strong>de baixo</strong> — os contornos vazios na cor delas. Escolha uma peça e
        mova; o adversário fica então obrigado a mexer a peça dele do mesmo símbolo.
      </p>

      <p className="lead">
        Uma tentativa em cada. A partida começa equilibrada, perto de{' '}
        <strong>50%</strong> de chance para cada lado — é essa a régua dos números abaixo.
      </p>

      {/* Two counts, because "all three right" snaps too easily to be the only
          one worth showing (project doc 8.4). */}
      <p className="streaks">
        <strong>{streaks.attempted}</strong> dias seguidos ·{' '}
        <strong>{streaks.perfect}</strong> perfeitos
      </p>

      {daily.map((puzzle) => (
        <Single
          key={puzzle.board}
          puzzle={puzzle}
          answered={answers[puzzle.board]}
          onAnswer={(correct) =>
            setRecord((current) => recordAnswer(current, today, puzzle.board, correct))
          }
        />
      ))}

      {/*
        Só depois de encarar algum. Um card com os três traços diria "não fiz
        nada hoje", que não é o que ninguém quer mandar para alguém.
      */}
      {Object.keys(answers).length > 0 && (
        <ShareButton
          text={puzzleShareText({
            date: longDate(now),
            answers,
            streaks,
            url: SITE,
          })}
          card={null}
        />
      )}

      <a className="restart" href={pathOf('game')}>
        Voltar e jogar
      </a>
    </main>
  )
}

type SingleProps = Readonly<{
  puzzle: Daily
  /** Undefined until it has been faced; then whether it was right. */
  answered: boolean | undefined
  onAnswer: (correct: boolean) => void
}>

function Single({ puzzle, answered, onAnswer }: SingleProps) {
  const [played, setPlayed] = useState<Action | null>(null)

  /**
   * The position, as a match with the initiative already drawn to the player.
   * Built fresh on every render rather than held in state: it is a pure
   * function of the puzzle, and there is exactly one move to make on it.
   */
  const opened = applyAction(startMatch({ board: puzzle.board, mechanic: 'choice' }, placementOf(puzzle)), {
    type: 'draw',
    initiative: 'blue',
  })
  if (!opened.ok) throw new Error(`puzzle position is not playable: ${opened.reason}`)
  const match: Match = played === null ? opened.match : applyOne(opened.match, played)

  const done = answered !== undefined
  const right = played !== null ? matches(played, puzzle.best) : answered === true

  function play(action: Action) {
    if (done) return
    setPlayed(action)
    onAnswer(matches(action, puzzle.best))
  }

  return (
    <section className="puzzle-one" data-board={puzzle.board}>
      <h2>
        {puzzle.boardLabel}
        <span className="tier"> · {TIER_PT[puzzle.tier]}</span>
      </h2>

      <p className="ask">
        {puzzle.question === 'piece'
          ? 'Qual peça nomear?'
          : 'A peça está escolhida — para onde movê-la?'}
      </p>

      <Board match={match} onPlay={play} />

      {done && (
        <div className="verdict" role="status" data-verdict data-right={right || undefined}>
          <strong>{right ? 'Certo.' : 'Não era o melhor.'}</strong>{' '}
          {/* Exact, because the position is solved. Almost no puzzle can say
              how much a move cost — this one can, and that is the reason to
              come back (project doc 8.4). */}
          O melhor é {describe(puzzle.best)}, que deixa você com{' '}
          {points(puzzle.value)}% de chance de vencer.{' '}
          {played !== null && matches(played, puzzle.second)
            ? `O seu foi o segundo melhor e custou ${points(puzzle.margin)} pontos.`
            : `O segundo melhor, ${describe(puzzle.second)}, já custa ${points(puzzle.margin)} pontos.`}
        </div>
      )}
    </section>
  )
}

const TIER_PT: Record<Daily['tier'], string> = {
  sharp: 'afiado',
  subtle: 'sutil',
  clear: 'claro',
}

function applyOne(match: Match, action: Action): Match {
  const applied = applyAction(match, action)
  return applied.ok ? applied.match : match
}
