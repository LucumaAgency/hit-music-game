function SongCard({ song, onClick }) {
  return (
    <div
      className={`song-card ${song.type === 'youtube' ? 'youtube' : ''}`}
      onClick={() => onClick(song)}
    >
      {song.type === 'youtube' && <span className="yt-badge">YouTube</span>}
      <div className="song-icon">{song.type === 'youtube' ? '🎸' : '🎵'}</div>
      <div className="song-title">{song.title}</div>
      <div className="song-artist">{song.artist}</div>
      <div className="song-meta">
        <span>{song.bpm ? `${song.bpm} BPM` : ''}</span>
      </div>
    </div>
  )
}

export default SongCard
