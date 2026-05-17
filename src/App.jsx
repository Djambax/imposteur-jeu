import { useState, useEffect, useRef } from 'react'
import { ref, set, get, onValue, update, remove } from 'firebase/database'
import { db } from './firebase.js'

// ── Mots WTF ──────────────────────────────────────────────────────
const WORD_PAIRS = [
  ["RSA", "SMIC"], ["URSSAF", "CAF"], ["POLE EMPLOI", "MISSION LOCALE"],
  ["HLM", "FOYER"], ["SÉCU", "MUTUELLE"], ["MAIRIE", "PRÉFECTURE"],
  ["GENDARME", "FLIC"], ["TRIBUNAL", "COMMISSARIAT"], ["IMPÔTS", "TAXES"],
  ["AMENDE", "CONTRAVENTION"], ["ASSISTANTE SOCIALE", "ÉDUCATEUR"],
  ["CROUS", "RESTO U"], ["APL", "AIDE AU LOGEMENT"], ["CMU", "AME"],
  ["AVOCAT", "NOTAIRE"], ["DAESH", "TALIBAN"], ["AL-QAÏDA", "BOKO HARAM"],
  ["FEMEN", "MANIF POUR TOUS"], ["ANTIFA", "GILETS JAUNES"],
  ["FRANC-MAÇON", "ILLUMINATI"], ["CIA", "NSA"], ["INTERPOL", "EUROPOL"],
  ["KGB", "FSB"], ["KÉKÉ", "BEAUF"], ["RACAILLE", "VOYOU"],
  ["CAILLERA", "LASCAR"], ["BOLOS", "BALTRINGUE"], ["OSEF", "BREF"],
  ["WESH", "YO"], ["CHELOU", "ZARBI"], ["CRAMÉ", "GRILLÉ"],
  ["TARÉ", "CINGLÉ"], ["MOULA", "BLÉ"], ["OSEILLE", "FRIC"],
  ["THUNE", "POGNON"], ["WEED", "SHIT"], ["BEUH", "POLLEN"],
  ["COCAÏNE", "SPEED"], ["KÉTA", "MDMA"], ["JOINT", "CIGARETTE"],
  ["OVERDOSE", "SURDOSE"], ["SEVRAGE", "MANQUE"], ["METHADONE", "SUBUTEX"],
  ["KEBAB", "TACOS"], ["MCDONALD", "QUICK"], ["KFC", "POPEYES"],
  ["LIDL", "ALDI"], ["REDBULL", "MONSTER"], ["VODKA", "RHUM"],
  ["RICARD", "PASTIS"], ["BITCOIN", "ETHEREUM"], ["TINDER", "BADOO"],
  ["SNAPCHAT", "INSTAGRAM"], ["TIKTOK", "YOUTUBE"], ["NETFLIX", "DISNEY+"],
  ["TORRENT", "STREAMING"], ["DARK WEB", "DEEP WEB"], ["VPN", "PROXY"],
  ["HACKER", "PIRATE"], ["SCAMMER", "PHISHING"], ["MEME", "SHITPOST"],
  ["SIMP", "DRAGUEUR"], ["ALIEN", "REPTILIEN"], ["COMPLOT", "CONSPIRATION"],
  ["CHEMTRAIL", "SILLAGE D'AVION"], ["TERRE PLATE", "TERRE CREUSE"],
  ["GITANE", "CLOPE SANS FILTRE"], ["CAMPING-CAR", "CARAVANE"],
  ["BANLIEUE", "CITÉ"], ["PAPARAZZI", "STALKER"],
  ["INFLUENCEUR", "YOUTUBEUR"], ["ONLYFANS", "MYMRC"],
  ["ESCORT", "MAÎTRESSE"], ["DIVORCE", "SÉPARATION"],
  ["GARDE À VUE", "MISE EN EXAMEN"], ["PRISON", "DÉTENTION PROVISOIRE"],
  ["CASIER JUDICIAIRE", "FICHE S"], ["AK-47", "KALACHNIKOV"],
  ["MOLOTOV", "GRENADE"], ["BATTE DE BASEBALL", "MARTEAU"],
]

// ── Helpers ───────────────────────────────────────────────────────
const UID_KEY = 'impostor_uid'
const NAME_KEY = 'impostor_name'
const ROOM_KEY = 'impostor_room'

function getMyId() {
  let id = localStorage.getItem(UID_KEY)
  if (!id) {
    id = Math.random().toString(36).slice(2) + Date.now().toString(36)
    localStorage.setItem(UID_KEY, id)
  }
  return id
}

function genCode() {
  const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
  return Array.from({ length: 4 }, () => c[Math.floor(Math.random() * c.length)]).join('')
}

function copyToClipboard(text) {
  navigator.clipboard?.writeText(text).catch(() => {})
}

// ── App ───────────────────────────────────────────────────────────
export default function App() {
  const [myId] = useState(getMyId)
  const [myName, setMyName] = useState(() => localStorage.getItem(NAME_KEY) || '')
  const [screen, setScreen] = useState('home')
  const [roomCode, setRoomCode] = useState('')
  const [room, setRoom] = useState(null)
  const [joinInput, setJoinInput] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [wordShowing, setWordShowing] = useState(false)
  const [copied, setCopied] = useState(false)
  const unsubRef = useRef(null)

  // Derived
  const players = room ? Object.entries(room.players || {}).map(([id, p]) => ({ id, ...p })) : []
  const amHost = room?.hostId === myId
  const isImpostor = room?.impostorId === myId
  const myPlayer = room?.players?.[myId]
  const allReady = players.length >= 2 && players.every(p => p.ready)
  const allVoted = players.length >= 2 && players.every(p => p.vote != null)

  function subscribeRoom(code) {
    if (unsubRef.current) unsubRef.current()
    const unsub = onValue(ref(db, `rooms/${code}`), snap => {
      const data = snap.val()
      if (!data) {
        setRoom(null)
        setScreen('home')
        localStorage.removeItem(ROOM_KEY)
        return
      }
      setRoom(data)
    })
    unsubRef.current = unsub
    localStorage.setItem(ROOM_KEY, code)
  }

  // Auto-reconnect on page refresh
  useEffect(() => {
    const savedCode = localStorage.getItem(ROOM_KEY)
    if (!savedCode) return
    get(ref(db, `rooms/${savedCode}/players/${myId}`)).then(snap => {
      if (snap.exists()) {
        setRoomCode(savedCode)
        subscribeRoom(savedCode)
        setScreen('room')
      } else {
        localStorage.removeItem(ROOM_KEY)
      }
    }).catch(() => {})
  }, []) // eslint-disable-line

  // Auto-advance phases (host only)
  useEffect(() => {
    if (!room || !amHost) return
    if (room.status === 'playing' && allReady) {
      update(ref(db, `rooms/${roomCode}`), { status: 'discuss' })
    }
    if (room.status === 'vote' && allVoted) {
      update(ref(db, `rooms/${roomCode}`), { status: 'result' })
    }
  }, [room, amHost, allReady, allVoted, roomCode])

  // Reset local word state when game restarts
  useEffect(() => {
    if (room?.status === 'playing') setWordShowing(false)
  }, [room?.status])

  useEffect(() => () => { if (unsubRef.current) unsubRef.current() }, [])

  function saveName() {
    const n = myName.trim()
    if (!n) { setError('Mets ton prénom !'); return false }
    localStorage.setItem(NAME_KEY, n)
    return true
  }

  async function createRoom() {
    if (!saveName()) return
    setLoading(true); setError('')
    try {
      let code, tries = 0
      do {
        code = genCode()
        const snap = await get(ref(db, `rooms/${code}`))
        if (!snap.exists()) break
      } while (++tries < 10)

      await set(ref(db, `rooms/${code}`), {
        hostId: myId, status: 'lobby', createdAt: Date.now(),
        normalWord: '', impostorWord: '', impostorId: '',
        players: { [myId]: { name: myName.trim(), ready: false, vote: null, joinedAt: Date.now() } }
      })
      setRoomCode(code)
      subscribeRoom(code)
      setScreen('room')
    } catch { setError('Erreur réseau, réessaie') }
    setLoading(false)
  }

  async function joinRoom() {
    if (!saveName()) return
    const code = joinInput.toUpperCase().replace(/\s/g, '')
    if (code.length !== 4) { setError('Code à 4 lettres !'); return }
    setLoading(true); setError('')
    try {
      const snap = await get(ref(db, `rooms/${code}`))
      if (!snap.exists()) { setError('Room introuvable 🤔'); setLoading(false); return }
      const data = snap.val()
      if (data.status !== 'lobby') { setError('Partie déjà lancée !'); setLoading(false); return }
      await update(ref(db, `rooms/${code}/players/${myId}`), {
        name: myName.trim(), ready: false, vote: null, joinedAt: Date.now()
      })
      setRoomCode(code)
      subscribeRoom(code)
      setScreen('room')
    } catch { setError('Erreur réseau, réessaie') }
    setLoading(false)
  }

  async function startGame() {
    if (players.length < 3) { setError('3 joueurs minimum !'); return }
    setError('')
    const pair = WORD_PAIRS[Math.floor(Math.random() * WORD_PAIRS.length)]
    const impostor = players[Math.floor(Math.random() * players.length)]
    const updates = {
      [`rooms/${roomCode}/normalWord`]: pair[0],
      [`rooms/${roomCode}/impostorWord`]: pair[1],
      [`rooms/${roomCode}/impostorId`]: impostor.id,
      [`rooms/${roomCode}/status`]: 'playing',
    }
    players.forEach(p => {
      updates[`rooms/${roomCode}/players/${p.id}/ready`] = false
      updates[`rooms/${roomCode}/players/${p.id}/vote`] = null
    })
    await update(ref(db), updates)
  }

  async function confirmWordSeen() {
    await update(ref(db, `rooms/${roomCode}/players/${myId}`), { ready: true })
  }

  async function startVote() {
    await update(ref(db, `rooms/${roomCode}`), { status: 'vote' })
  }

  async function vote(targetId) {
    if (myPlayer?.vote != null) return
    await update(ref(db, `rooms/${roomCode}/players/${myId}`), { vote: targetId })
  }

  async function leaveRoom() {
    if (unsubRef.current) unsubRef.current()
    if (roomCode) {
      if (amHost) await remove(ref(db, `rooms/${roomCode}`)).catch(() => {})
      else await remove(ref(db, `rooms/${roomCode}/players/${myId}`)).catch(() => {})
    }
    setRoom(null); setRoomCode(''); setScreen('home'); setError('')
    localStorage.removeItem(ROOM_KEY)
  }

  async function playAgain() {
    if (!amHost) return
    const updates = {
      [`rooms/${roomCode}/status`]: 'lobby',
      [`rooms/${roomCode}/normalWord`]: '',
      [`rooms/${roomCode}/impostorWord`]: '',
      [`rooms/${roomCode}/impostorId`]: '',
    }
    players.forEach(p => {
      updates[`rooms/${roomCode}/players/${p.id}/ready`] = false
      updates[`rooms/${roomCode}/players/${p.id}/vote`] = null
    })
    await update(ref(db), updates)
  }

  function handleCopy() {
    copyToClipboard(roomCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const voteResults = players
    .map(p => ({ ...p, received: players.filter(v => v.vote === p.id).length }))
    .sort((a, b) => b.received - a.received)
  const mostVoted = voteResults[0]
  const impostorEliminated = mostVoted?.id === room?.impostorId
  const impostorPlayer = players.find(p => p.id === room?.impostorId)

  return (
    <div className="app">
      {screen === 'home' && (
        <HomeScreen
          myName={myName} setMyName={setMyName}
          joinInput={joinInput} setJoinInput={setJoinInput}
          onCreate={createRoom} onJoin={joinRoom}
          error={error} loading={loading} setError={setError}
        />
      )}
      {screen === 'room' && room && (
        <>
          {room.status === 'lobby' && (
            <LobbyScreen
              roomCode={roomCode} players={players} amHost={amHost} myId={myId}
              onStart={startGame} onLeave={leaveRoom} error={error}
              copied={copied} onCopy={handleCopy}
            />
          )}
          {room.status === 'playing' && (
            <WordScreen
              myName={myPlayer?.name} isImpostor={isImpostor}
              word={isImpostor ? room.impostorWord : room.normalWord}
              wordShowing={wordShowing} setWordShowing={setWordShowing}
              hasConfirmed={!!myPlayer?.ready} onConfirm={confirmWordSeen}
              readyCount={players.filter(p => p.ready).length}
              total={players.length}
            />
          )}
          {room.status === 'discuss' && (
            <DiscussScreen
              amHost={amHost} onStartVote={startVote}
              players={players} onLeave={leaveRoom}
            />
          )}
          {room.status === 'vote' && (
            <VoteScreen
              myId={myId} myVote={myPlayer?.vote}
              players={players} onVote={vote}
              voteCount={players.filter(p => p.vote != null).length}
              total={players.length}
            />
          )}
          {room.status === 'result' && (
            <ResultScreen
              voteResults={voteResults} mostVoted={mostVoted}
              impostorEliminated={impostorEliminated}
              impostorPlayer={impostorPlayer}
              normalWord={room.normalWord} impostorWord={room.impostorWord}
              amHost={amHost} onPlayAgain={playAgain} onLeave={leaveRoom}
            />
          )}
        </>
      )}
    </div>
  )
}

// ── HomeScreen ────────────────────────────────────────────────────
function HomeScreen({ myName, setMyName, joinInput, setJoinInput, onCreate, onJoin, error, loading, setError }) {
  return (
    <div className="screen setup-screen">
      <div className="logo">🕵️</div>
      <h1 className="title">IMPOSTEUR</h1>
      <p className="subtitle">Le jeu des mots chelous</p>

      <div className="card">
        <label className="label">Ton prénom</label>
        <input
          className="name-input name-input--full"
          value={myName}
          onChange={e => { setMyName(e.target.value); setError('') }}
          placeholder="Jean-Michel..."
          maxLength={16}
        />
      </div>

      <button className="btn-main" onClick={onCreate} disabled={loading}>
        {loading ? 'CRÉATION...' : 'CRÉER UNE ROOM 🚀'}
      </button>

      <div className="divider"><span>OU</span></div>

      <div className="card join-card">
        <label className="label">Rejoindre avec un code</label>
        <div className="join-row">
          <input
            className="name-input code-input"
            value={joinInput}
            onChange={e => { setJoinInput(e.target.value.toUpperCase()); setError('') }}
            placeholder="ABCD"
            maxLength={4}
            onKeyDown={e => e.key === 'Enter' && onJoin()}
          />
          <button className="btn-join" onClick={onJoin} disabled={loading}>
            {loading ? '...' : 'REJOINDRE'}
          </button>
        </div>
      </div>

      {error && <p className="error-msg">⚠️ {error}</p>}

      <div className="rules">
        <p>📖 Tout le monde reçoit le même mot, <em>sauf l'imposteur</em> qui a un mot proche. Donnez des indices, votez !</p>
      </div>
    </div>
  )
}

// ── LobbyScreen ───────────────────────────────────────────────────
function LobbyScreen({ roomCode, players, amHost, myId, onStart, onLeave, error, copied, onCopy }) {
  return (
    <div className="screen lobby-screen">
      <h2 className="screen-title">SALLE D'ATTENTE</h2>

      <div className="room-code-box" onClick={onCopy}>
        <p className="room-code-label">CODE DE LA ROOM</p>
        <div className="room-code">{roomCode}</div>
        <p className="room-code-hint">{copied ? '✅ Copié !' : '👆 Appuie pour copier'}</p>
      </div>

      <div className="card players-list-card">
        <label className="label">{players.length} joueur{players.length > 1 ? 's' : ''}</label>
        <div className="players-list">
          {players.map(p => (
            <div key={p.id} className={`player-item ${p.id === myId ? 'player-item--me' : ''}`}>
              <span className="player-dot" />
              <span>{p.name}</span>
              {p.id === myId && <span className="me-tag">moi</span>}
              {p.isHost && <span className="host-tag">👑</span>}
            </div>
          ))}
        </div>
        {players.length < 3 && (
          <p className="waiting-hint">⏳ En attente... (3 min)</p>
        )}
      </div>

      {error && <p className="error-msg">⚠️ {error}</p>}

      {amHost ? (
        <button className="btn-main" onClick={onStart} disabled={players.length < 3}>
          {players.length < 3 ? `ATTENDRE (${players.length}/3)` : 'LANCER LA PARTIE 🎮'}
        </button>
      ) : (
        <div className="waiting-host">
          <div className="spinner" />
          <p>En attente que l'hôte lance...</p>
        </div>
      )}

      <button className="btn-leave" onClick={onLeave}>Quitter la room</button>
    </div>
  )
}

// ── WordScreen ────────────────────────────────────────────────────
function WordScreen({ myName, isImpostor, word, wordShowing, setWordShowing, hasConfirmed, onConfirm, readyCount, total }) {
  return (
    <div className="screen reveal-screen">
      <div className="progress-bar">
        <div className="progress-fill" style={{ width: `${(readyCount / total) * 100}%` }} />
      </div>

      <p className="player-tag">👤 {myName}</p>
      <h2 className="reveal-title">Ton mot secret</h2>

      <div
        className={`word-card ${wordShowing ? 'word-card--shown' : ''}`}
        onClick={() => !hasConfirmed && setWordShowing(v => !v)}
      >
        {wordShowing ? (
          <div className="word-content">
            {isImpostor ? (
              <>
                <div className="impostor-badge">🎭 IMPOSTEUR</div>
                <div className="word-text impostor-word">{word}</div>
                <p className="word-hint">Ton mot est <em>différent</em>. Bluff !</p>
              </>
            ) : (
              <>
                <div className="citizen-badge">✅ CITOYEN</div>
                <div className="word-text">{word}</div>
                <p className="word-hint">Parle-en sans le dire !</p>
              </>
            )}
            {!hasConfirmed && <p className="tap-hint">Appuie pour cacher</p>}
          </div>
        ) : (
          <div className="word-hidden">
            {hasConfirmed ? (
              <>
                <div className="check-big">✅</div>
                <p>Tu as vu ton mot</p>
                <p className="word-hint">En attente des autres...</p>
              </>
            ) : (
              <>
                <div className="eye-icon">👁️</div>
                <p>Appuie pour voir ton mot</p>
                <p className="word-hint">Assure-toi d'être seul(e) à regarder</p>
              </>
            )}
          </div>
        )}
      </div>

      {wordShowing && !hasConfirmed && (
        <button className="btn-main" onClick={onConfirm}>
          J'AI MÉMORISÉ ✅
        </button>
      )}

      <p className="step-counter">{readyCount} / {total} prêts</p>
    </div>
  )
}

// ── DiscussScreen ─────────────────────────────────────────────────
function DiscussScreen({ amHost, onStartVote, players, onLeave }) {
  return (
    <div className="screen discuss-screen">
      <div className="big-emoji">🗣️</div>
      <h2 className="screen-title">DISCUSSION</h2>
      <div className="card">
        <p>Chacun donne <strong>un indice</strong> sur son mot.</p>
        <p>Essayez de repérer <strong>l'imposteur</strong> !</p>
        <p>L'imposteur essaie de <strong>se fondre dans la masse</strong>.</p>
      </div>
      <div className="tips">
        <p>💡 Ni trop vague ni trop précis !</p>
        <p>💡 L'imposteur a un mot <em>différent mais proche</em></p>
        <p>💡 Faites plusieurs tours si vous voulez</p>
      </div>

      {amHost ? (
        <button className="btn-main btn-vote-start" onClick={onStartVote}>
          PASSER AU VOTE 🗳️
        </button>
      ) : (
        <div className="waiting-host">
          <div className="spinner" />
          <p>L'hôte décide quand voter...</p>
        </div>
      )}
    </div>
  )
}

// ── VoteScreen ────────────────────────────────────────────────────
function VoteScreen({ myId, myVote, players, onVote, voteCount, total }) {
  return (
    <div className="screen vote-screen">
      <div className="progress-bar">
        <div className="progress-fill" style={{ width: `${(voteCount / total) * 100}%` }} />
      </div>

      <div className="big-emoji">🗳️</div>
      <h2 className="screen-title">VOTE</h2>
      <p className="vote-hint">Qui est l'imposteur ?</p>

      {myVote == null ? (
        <div className="vote-grid">
          {players
            .filter(p => p.id !== myId)
            .map(p => (
              <button key={p.id} className="vote-btn" onClick={() => onVote(p.id)}>
                {p.name}
              </button>
            ))}
        </div>
      ) : (
        <div className="voted-confirmation">
          <div className="check-big">✅</div>
          <p>Vote envoyé !</p>
          <p className="word-hint">En attente des autres...</p>
        </div>
      )}

      <p className="step-counter">{voteCount} / {total} ont voté</p>
    </div>
  )
}

// ── ResultScreen ──────────────────────────────────────────────────
function ResultScreen({ voteResults, mostVoted, impostorEliminated, impostorPlayer, normalWord, impostorWord, amHost, onPlayAgain, onLeave }) {
  const [revealed, setRevealed] = useState(false)

  return (
    <div className="screen result-screen">
      <h2 className="screen-title">RÉSULTATS</h2>

      <div className="vote-results">
        {voteResults.map(({ id, name, received }) => (
          <div key={id} className="result-row">
            <span className="result-name">{name}</span>
            <div className="result-bar-wrap">
              <div
                className="result-bar"
                style={{ width: `${Math.max(4, (received / (voteResults.length > 1 ? voteResults[0].received || 1 : 1)) * 100)}%` }}
              />
            </div>
            <span className="result-count">{received} vote{received > 1 ? 's' : ''}</span>
          </div>
        ))}
      </div>

      <div className="verdict-box">
        Le plus voté : <strong>{mostVoted?.name}</strong>
      </div>

      {!revealed ? (
        <button className="btn-main btn-reveal" onClick={() => setRevealed(true)}>
          RÉVÉLER L'IMPOSTEUR 🎭
        </button>
      ) : (
        <div className="reveal-zone">
          <div className={`final-verdict ${impostorEliminated ? 'verdict-win' : 'verdict-lose'}`}>
            <div className="verdict-emoji">{impostorEliminated ? '🎉' : '😈'}</div>
            <h3>{impostorEliminated ? 'IMPOSTEUR ÉLIMINÉ !' : 'IMPOSTEUR GAGNE !'}</h3>
            <p className="impostor-name">
              L'imposteur était <strong>{impostorPlayer?.name ?? '?'}</strong>
            </p>
            <div className="words-reveal">
              <span className="word-reveal-tag citizen-tag">Mot citoyen : <strong>{normalWord}</strong></span>
              <span className="word-reveal-tag impostor-tag">Mot imposteur : <strong>{impostorWord}</strong></span>
            </div>
          </div>

          {amHost ? (
            <button className="btn-main btn-restart" onClick={onPlayAgain}>
              REJOUER 🔄
            </button>
          ) : (
            <div className="waiting-host">
              <div className="spinner" />
              <p>L'hôte peut relancer...</p>
            </div>
          )}

          <button className="btn-leave" onClick={onLeave}>Quitter</button>
        </div>
      )}
    </div>
  )
}
